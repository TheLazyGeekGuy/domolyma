import { msg, labelText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  readDraft,
  writeDraft,
  removeDraft,
  type DraftFields,
} from "./form-drafts";
type Entry = [string, string];
function values(form: HTMLFormElement): Entry[] {
  return [...new FormData(form)].filter(
    (e): e is Entry => typeof e[1] === "string",
  );
}
function restore(form: HTMLFormElement, fields: DraftFields) {
  const entries = JSON.parse(fields._fields) as Entry[];
  if (
    !Array.isArray(entries) ||
    entries.some(
      (e) =>
        !Array.isArray(e) ||
        e.length !== 2 ||
        e.some((v) => typeof v !== "string"),
    )
  )
    throw Error(msg("use-form-draft.m1174"));
  for (const element of [...form.elements]) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.name
    )
      continue;
    if (
      element instanceof HTMLInputElement &&
      ["file", "submit", "button", "hidden"].includes(element.type)
    )
      continue;
    const saved = entries
      .filter(([name]) => name === element.name)
      .map(([, value]) => value);
    if (element instanceof HTMLSelectElement && element.multiple) {
      for (const option of element.options)
        option.selected = saved.includes(option.value);
    } else if (
      element instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(element.type)
    )
      element.checked = saved.includes(element.value);
    else element.value = saved[0] || "";
  }
}
/** Recover native form values without replacing business validation or saving. */
export function useFormDraft({
  draftId,
  version,
  readOnly,
  onClose,
}: {
  draftId: string | null;
  version: number;
  readOnly: boolean;
  onClose: () => void;
}) {
  const form = useRef<HTMLFormElement>(null),
    dirtyRef = useRef(false),
    [loaded, setLoaded] = useState<string | null>(null),
    [pending, setPending] = useState<DraftFields | null>(null),
    [guard, setGuard] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dirtyRef.current = false;
    setDirty(false);
    setGuard(false);
    setError("");
    setPending(draftId && !readOnly ? readDraft(draftId) : null);
    setLoaded(draftId);
  }, [draftId, readOnly]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const blocked = readOnly || loaded !== draftId || !!pending;
  const capture = () => {
    if (!draftId || blocked || !form.current) return;
    dirtyRef.current = true;
    setDirty(true);
    writeDraft(draftId, {
      _baseVersion: String(version),
      _fields: JSON.stringify(values(form.current)),
    });
  };
  const complete = () => {
    if (draftId) removeDraft(draftId);
    dirtyRef.current = false;
    setDirty(false);
    setPending(null);
    setGuard(false);
  };
  const close = () => {
    if (dirtyRef.current) setGuard(true);
    else onClose();
  };
  const resume = () => {
    if (!pending || !form.current || !draftId || loaded !== draftId) return;
    try {
      restore(form.current, pending);
      writeDraft(draftId, { ...pending, _baseVersion: String(version) });
      setPending(null);
      dirtyRef.current = true;
      setDirty(true);
      setError("");
    } catch {
      setError(msg("use-form-draft.m1175"));
    }
  };
  const discard = () => {
    complete();
  };
  return {
    form,
    blocked,
    capture,
    complete,
    close,
    pending,
    guard,
    error,
    controls: (
      <>
        {guard && (
          <aside className="draft-warning" role="alert">
            <strong>{msg("use-form-draft.m1176")}</strong>
            <p>{msg("use-form-draft.m1177")}</p>
            <button type="button" className="secondary" onClick={onClose}>
              {msg("document_vault.m0452")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                discard();
                onClose();
              }}
            >
              {msg("document_vault.m0453")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setGuard(false)}
            >
              {msg("app.m0230")}
            </button>
          </aside>
        )}
        {pending && (
          <aside className="draft-warning" role="alert">
            <strong>
              {pending._baseVersion !== String(version)
                ? msg("document_vault.m0454")
                : msg("document_vault.m0455")}
            </strong>
            <p>{msg("use-form-draft.m1178")}</p>
            <button type="button" className="secondary" onClick={resume}>
              {pending._baseVersion !== String(version)
                ? msg("app.m0193")
                : msg("document_vault.m0458")}
            </button>
            <button type="button" className="secondary" onClick={discard}>
              {msg("document_vault.m0460")}
            </button>
          </aside>
        )}
        {error && (
          <p role="alert" className="error">
            {labelText(error)}
          </p>
        )}
      </>
    ),
  };
}
