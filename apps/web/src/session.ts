import { getLocale, labelText } from "./i18n";
import { validationMessage } from "../../../packages/i18n/messages";
import { appUrl } from "./urls";
let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept-Language", getLocale());
  if (!["GET", "HEAD"].includes(options.method || "GET") && csrfToken)
    headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(appUrl(path), {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (
    !response.ok &&
    response.headers.get("Content-Type")?.includes("application/json")
  ) {
    try {
      const body = (await response.clone().json()) as {
        error?: string;
        details?: { code?: string; message?: string }[];
      };
      if (typeof body.error === "string") body.error = labelText(body.error);
      if (Array.isArray(body.details))
        body.details = body.details.map((issue) => ({
          ...issue,
          message: validationMessage(issue, getLocale()),
        }));
      const nextHeaders = new Headers(response.headers);
      nextHeaders.delete("Content-Length");
      nextHeaders.delete("Content-Encoding");
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers: nextHeaders,
      });
    } catch {
      /* Preserve non-JSON and unexpected error responses. */
    }
  }
  return response;
}
