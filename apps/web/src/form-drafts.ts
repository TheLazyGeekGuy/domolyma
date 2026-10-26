export type DraftFields = Record<string, string>;
const prefix = "domolyma-form-draft:";
const memory = new Map<string, { fields: DraftFields; at: number }>();
export const draftKey = (
  user: string,
  residence: string,
  year: number,
  kind: string,
  id = "new",
) => prefix + JSON.stringify([user, residence, year, kind, id]);
export function readDraft(key: string): DraftFields | null {
  try {
    const raw = sessionStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : memory.get(key);
    if (
      !value ||
      Date.now() - value.at > 86400000 ||
      !value.fields ||
      typeof value.fields !== "object"
    ) {
      removeDraft(key);
      return null;
    }
    return Object.fromEntries(
      Object.entries(value.fields).filter(
        ([k, v]) => typeof v === "string" && k !== "file",
      ),
    ) as DraftFields;
  } catch {
    return memory.get(key)?.fields || null;
  }
}
export function captureDraft(form: HTMLFormElement): DraftFields {
  return Object.fromEntries(
    [...new FormData(form)].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
export function writeDraft(key: string, fields: DraftFields) {
  const value = { fields, at: Date.now() };
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Still preserve within this page when storage is unavailable. */
  }
}
export function removeDraft(key: string) {
  memory.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
export function clearDrafts() {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {}
}
