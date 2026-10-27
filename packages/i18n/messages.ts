import fr from "./fr.json";
import en from "./en.json";

export type Locale = "fr" | "en";
export type MessageKey = keyof typeof fr;
export type Parameters = Record<string, unknown>;
export const catalogs = { fr, en };

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  values: Parameters = {},
) {
  const template = catalogs[locale][key] ?? fr[key];
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name] ?? "")
      : token,
  );
}

/** Stable source wording for persisted enum labels and server error contracts. */
export { sourceText } from "./source";
const exact = new Map<string, MessageKey>();
for (const key of Object.keys(fr) as MessageKey[]) {
  exact.set(en[key], key);
  exact.set(fr[key], key);
}
const patterns = (Object.keys(fr) as MessageKey[]).flatMap((key) =>
  ([fr[key], en[key]] as string[]).flatMap((text) => {
    const names = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (!names.length) return [];
    const parts = text
      .split(/\{\w+\}/g)
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return [
      {
        key,
        names,
        expression: new RegExp("^" + parts.join("([\\s\\S]*?)") + "$"),
      },
    ];
  }),
);

const dynamicCache = new Map<string, string>();
const CACHE_LIMIT = 512;
/** Translate application metadata and errors only, never user-authored content. */
export function knownText(value: unknown, locale: Locale): string {
  const text = String(value ?? "");
  const key = exact.get(text);
  if (key) return formatMessage(locale, key);
  const cacheKey = text.length <= 4096 ? JSON.stringify([locale, text]) : null;
  const cached = cacheKey === null ? undefined : dynamicCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const remember = (result: string) => {
    if (cacheKey === null) return result;
    if (dynamicCache.size >= CACHE_LIMIT)
      dynamicCache.delete(dynamicCache.keys().next().value!);
    dynamicCache.set(cacheKey, result);
    return result;
  };
  for (const pattern of patterns) {
    const match = pattern.expression.exec(text);
    if (match)
      return remember(
        formatMessage(
          locale,
          pattern.key,
          Object.fromEntries(
            pattern.names.map((name, i) => [name, match[i + 1]]),
          ),
        ),
      );
  }
  return remember(text);
}

export function validationMessage(
  issue: {
    code?: string;
    message?: string;
    origin?: string;
    minimum?: unknown;
    maximum?: unknown;
  },
  locale: Locale,
): string {
  const translated = knownText(issue.message || "", locale);
  if (translated !== issue.message || issue.code === "custom")
    return translated;
  if (issue.code === "too_small")
    return formatMessage(
      locale,
      issue.origin === "string" ? "validation.short" : "validation.minimum",
      { value: issue.minimum },
    );
  if (issue.code === "too_big")
    return formatMessage(
      locale,
      issue.origin === "string" ? "validation.long" : "validation.maximum",
      { value: issue.maximum },
    );
  if (issue.code === "invalid_value")
    return formatMessage(locale, "validation.choice");
  if (issue.code === "invalid_format")
    return formatMessage(locale, "validation.format");
  return formatMessage(locale, "validation.invalid");
}
