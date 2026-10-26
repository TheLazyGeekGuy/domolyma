import { msg, labelText } from "./i18n";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FileText,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCw,
} from "lucide-react";
import { apiFetch } from "./session";
import {
  fileKind,
  type VaultVersion,
} from "../../../packages/contracts/documents";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { appUrl } from "./urls";

const resources = async () => {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdf;
};
export const previewUrl = (context: string, id: string) =>
  appUrl(
    `/api/condominiums/${encodeURIComponent(context)}/documents/${encodeURIComponent(id)}/preview`,
  );
export const downloadUrl = (context: string, id: string) =>
  appUrl(
    `/api/condominiums/${encodeURIComponent(context)}/documents/${encodeURIComponent(id)}/download`,
  );
async function pdfDocument(url: string) {
  const pdf = await resources(),
    base = appUrl(`/pdf-assets/${pdf.version}/`);
  return pdf.getDocument({
    url,
    withCredentials: true,
    disableAutoFetch: true,
    disableStream: true,
    rangeChunkSize: 65536,
    standardFontDataUrl: base + "standard_fonts/",
    wasmUrl: base + "wasm/",
    cMapUrl: base + "cmaps/",
    cMapPacked: true,
  });
}
type Cached = { url: string; pages: number };
type Cache = {
  images: Map<string, Cached>;
  active: number;
  waiting: (() => void)[];
};
const PreviewCache = createContext<Cache | null>(null);
export function VaultPreviewScope({ children }: { children: ReactNode }) {
  const cache = useRef<Cache>({ images: new Map(), active: 0, waiting: [] });
  useEffect(
    () => () => {
      cache.current.images.clear();
    },
    [],
  );
  return (
    <PreviewCache.Provider value={cache.current}>
      {children}
    </PreviewCache.Provider>
  );
}
async function limited<T>(cache: Cache, job: () => Promise<T>) {
  await new Promise<void>((resolve) => {
    const start = () => {
      cache.active++;
      resolve();
    };
    if (cache.active < 2) start();
    else cache.waiting.push(start);
  });
  try {
    return await job();
  } finally {
    cache.active--;
    cache.waiting.shift()?.();
  }
}
function drawText(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 362;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 256, 362);
  ctx.fillStyle = "#353544";
  ctx.font = "8px monospace";
  let y = 22;
  for (const line of text.split(/\r?\n/).slice(0, 32)) {
    ctx.fillText(line.slice(0, 48), 14, y);
    y += 10;
  }
  return canvas.toDataURL("image/png");
}
export function VaultThumbnail({
  context,
  version,
}: {
  context: string;
  version: VaultVersion;
}) {
  const cache = useContext(PreviewCache)!,
    host = useRef<HTMLSpanElement>(null),
    [visible, setVisible] = useState(false),
    [image, setImage] = useState(cache?.images.get(version.id)),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setImage(cache.images.get(version.id));
    setFailed(false);
  }, [version.id]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || image || failed) return;
    const controller = new AbortController();
    let live = true;
    let task: any;
    const abort = () => {
      void task?.destroy();
    };
    controller.signal.addEventListener("abort", abort);
    limited(cache, async () => {
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const cached = cache.images.get(version.id);
      if (cached) return cached;
      const kind = fileKind(version),
        canvas = document.createElement("canvas");
      let value: Cached;
      if (kind === "pdf") {
        task = await pdfDocument(previewUrl(context, version.id));
        if (controller.signal.aborted) {
          await task.destroy();
          throw new DOMException("Aborted", "AbortError");
        }
        const pdf = await task.promise;
        const page = await pdf.getPage(1),
          viewport = page.getViewport({
            scale: 256 / page.getViewport({ scale: 1 }).width,
          });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const render = page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        controller.signal.addEventListener("abort", () => render.cancel(), {
          once: true,
        });
        await render.promise;
        value = { url: canvas.toDataURL("image/png"), pages: pdf.numPages };
      } else if (kind === "image") {
        const r = await apiFetch(previewUrl(context, version.id), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error();
        const blob = await r.blob(),
          bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.ceil(bitmap.width * scale);
        canvas.height = Math.ceil(bitmap.height * scale);
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        value = { url: canvas.toDataURL("image/png"), pages: 1 };
      } else if (
        version.mime.startsWith("text/") &&
        version.size <= 2 * 1024 * 1024
      ) {
        const r = await apiFetch(previewUrl(context, version.id), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error();
        value = { url: drawText(canvas, await r.text()), pages: 1 };
      } else throw Error(msg("vault_preview.m1114"));
      canvas.width = 0;
      if (!live) throw new DOMException("Aborted", "AbortError");
      cache.images.set(version.id, value);
      while (cache.images.size > 72)
        cache.images.delete(cache.images.keys().next().value!);
      return value;
    })
      .then((v) => {
        if (live) setImage(v);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        void task?.destroy();
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [visible, version.id, image, failed]);
  return (
    <span
      ref={host}
      className="dv-page-thumb"
      aria-busy={visible && !image && !failed}
    >
      {image ? (
        <img src={image.url} alt={msg("vault_preview.m1115")} />
      ) : (
        <span className="dv-glyph">
          {fileKind(version) === "image" ? (
            <ImageIcon size={30} />
          ) : (
            <FileText size={48} />
          )}
          <small>
            {failed ? msg("vault_preview.m1116") : msg("vault_preview.m1117")}
          </small>
        </span>
      )}
    </span>
  );
}
function PdfPage({
  pdf,
  page,
  zoom,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      render: any;
    const element = canvas.current!;
    pdf
      .getPage(page)
      .then((p) => {
        if (!active) return;
        const width =
          Math.min(
            1000,
            Math.max(260, (host.current?.clientWidth || 900) - 24),
          ) * zoom;
        const viewport = p.getViewport({
          scale: width / p.getViewport({ scale: 1 }).width,
        });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        element.width = Math.ceil(viewport.width * ratio);
        element.height = Math.ceil(viewport.height * ratio);
        element.style.width = viewport.width + "px";
        element.style.height = viewport.height + "px";
        render = p.render({
          canvas: element,
          canvasContext: element.getContext("2d")!,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        return render.promise;
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      render?.cancel();
      element.width = 0;
    };
  }, [pdf, page, zoom]);
  return (
    <div ref={host} className="dv-rendered-page">
      {error ? (
        <p role="alert">{labelText(error)}</p>
      ) : (
        <canvas
          ref={canvas}
          aria-label={msg("vault_preview.m1118", { p1: page })}
        />
      )}
    </div>
  );
}
export function VaultPreview({
  context,
  version,
  title,
  onClose,
}: {
  context: string;
  version: VaultVersion;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    before = useRef(document.activeElement as HTMLElement | null),
    [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [text, setText] = useState<string>(),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const kind = fileKind(version);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      if (element.open) element.close();
      if (before.current?.isConnected) before.current.focus();
    };
  }, []);
  useEffect(() => {
    let live = true,
      task: any,
      url = "";
    const controller = new AbortController();
    setError("");
    (async () => {
      if (kind === "pdf") {
        task = await pdfDocument(previewUrl(context, version.id));
        if (!live) {
          await task.destroy();
          return;
        }
        const value = await task.promise;
        if (live) setPdf(value);
      } else if (kind === "image") {
        const r = await apiFetch(previewUrl(context, version.id), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error(msg("vault_preview.m1119"));
        url = URL.createObjectURL(await r.blob());
        if (live) setImage(url);
        else URL.revokeObjectURL(url);
      } else if (
        version.mime.startsWith("text/") &&
        version.size <= 2 * 1024 * 1024
      ) {
        const r = await apiFetch(previewUrl(context, version.id), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error(msg("vault_preview.m1120"));
        const value = await r.text();
        if (live) setText(value);
      } else throw Error(msg("vault_preview.m1121"));
    })().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
      controller.abort();
      void task?.destroy();
      if (url) URL.revokeObjectURL(url);
    };
  }, [context, version.id, retry]);
  return (
    <dialog
      ref={dialog}
      className="dv-preview-dialog"
      aria-label={msg("vault_preview.m1122", { p1: title })}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="secondary"
          aria-label={msg("vault_preview.m1123")}
          onClick={onClose}
        >
          <X size={18} />
          {msg("common.close")}
        </button>
      </header>
      <nav aria-label={msg("vault_preview.m1124")}>
        {kind === "pdf" && (
          <>
            <button
              className="secondary"
              disabled={!pdf || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              {msg("vault_preview.m1125")}
            </button>
            <span aria-live="polite">
              {msg("vault_preview.m1126")}
              {page} / {pdf?.numPages || "…"}
            </span>
            <button
              className="secondary"
              disabled={!pdf || page >= pdf.numPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {msg("vault_preview.m1127")}
              <ChevronRight size={16} />
            </button>
            <label>
              {msg("vault_preview.m1128")}
              <select
                aria-label={msg("vault_preview.m1129")}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                <option value="1">{msg("vault_preview.m1130")}</option>
                <option value="0.75">75 %</option>
                <option value="1.25">125 %</option>
                <option value="1.5">150 %</option>
              </select>
            </label>
          </>
        )}
        <a className="secondary" href={downloadUrl(context, version.id)}>
          <Download size={16} />
          {msg("vault_preview.m1131")}
        </a>
      </nav>
      <div className="dv-preview-body">
        {error ? (
          <div className="dv-preview-error">
            <p role="alert">{labelText(error)}</p>
            <button
              className="secondary"
              onClick={() => setRetry((x) => x + 1)}
            >
              <RotateCw size={15} />
              {msg("vault_preview.m1132")}
            </button>
          </div>
        ) : pdf ? (
          <PdfPage key={`${page}:${zoom}`} pdf={pdf} page={page} zoom={zoom} />
        ) : image ? (
          <img className="dv-full-image" src={image} alt={title} />
        ) : text !== undefined ? (
          <pre className="dv-full-text">{text}</pre>
        ) : (
          <p role="status">{msg("vault_preview.m1133")}</p>
        )}
      </div>
    </dialog>
  );
}
