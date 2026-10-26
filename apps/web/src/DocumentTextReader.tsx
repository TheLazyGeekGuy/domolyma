import { msg, labelText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "./session";

export default function DocumentTextReader({
  context,
  version,
  onClose,
}: {
  context: string;
  version: { id: string; filename: string; size: number };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    focusBefore = useRef(document.activeElement as HTMLElement | null);
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const controller = new AbortController();
    if (version.size > 2 * 1024 * 1024)
      setError(msg("document_text_reader.m0325"));
    else
      apiFetch(
        `/api/condominiums/${encodeURIComponent(context)}/documents/${encodeURIComponent(version.id)}/download`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          if (!r.ok) throw Error(msg("document_text_reader.m0326"));
          const value = await r.text();
          if (!controller.signal.aborted) setText(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => {
      controller.abort();
      if (element?.open) element.close();
      if (focusBefore.current?.isConnected) focusBefore.current.focus();
    };
  }, [context, version.id]);
  return (
    <dialog
      ref={dialog}
      className="gov-dialog document-text-reader"
      aria-labelledby="document-reader-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ width: "min(1000px,calc(100% - 2rem))" }}
    >
      <div style={{ padding: "1.5rem" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <h2 id="document-reader-title">{version.filename}</h2>
            <p className="scope-note">{msg("document_text_reader.m0329")}</p>
          </div>
          <button
            className="icon-button"
            aria-label={msg("document_text_reader.m0330")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {error ? (
          <p role="alert" className="error">
            {labelText(error)}
          </p>
        ) : text ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: ".9rem",
              lineHeight: 1.7,
            }}
          >
            {text}
          </pre>
        ) : (
          <p role="status">{msg("document_text_reader.m0331")}</p>
        )}
      </div>
    </dialog>
  );
}
