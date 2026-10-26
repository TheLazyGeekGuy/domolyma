import { useSyncExternalStore } from "react";
import {
  formatMessage,
  knownText,
  type Locale,
  type MessageKey,
  type Parameters,
} from "../../../packages/i18n/messages";

let current: Locale = "fr";
try {
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("domolyma-language") === "en"
  )
    current = "en";
} catch {}
const listeners = new Set<() => void>();
export const getLocale = () => current;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const localeTag = () => (current === "fr" ? "fr-FR" : "en-GB");
export const msg = (key: MessageKey, values?: Parameters) =>
  formatMessage(current, key, values);
export const labelText = (value: unknown) => knownText(value, current);
export function setLocale(value: Locale) {
  if (value !== "fr" && value !== "en") return;
  current = value;
  try {
    localStorage.setItem("domolyma-language", value);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = value;
    document.title = msg("language.document_title");
  }
  for (const listener of listeners) listener();
}
if (typeof document !== "undefined") {
  document.documentElement.lang = current;
  document.title = msg("language.document_title");
}
export const useLocale = () =>
  useSyncExternalStore(subscribe, getLocale, () => "fr" as Locale);

export function LanguageSelector() {
  const locale = useLocale();
  return (
    <label className="language-picker">
      <span aria-hidden="true">◎</span>
      <select
        name="interface-language"
        aria-label={msg("language.label")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        <option value="fr" lang="fr">
          {msg("language.fr")}
        </option>
        <option value="en" lang="en">
          {msg("language.en")}
        </option>
      </select>
    </label>
  );
}
