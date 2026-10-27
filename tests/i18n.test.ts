import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  catalogs,
  formatMessage,
  knownText,
  sourceText,
  validationMessage,
  type MessageKey,
} from "../packages/i18n/messages";
import { getLocale, localeTag, msg, setLocale } from "../apps/web/src/i18n";
import { apiFetch, setCsrfToken } from "../apps/web/src/session";
import IncidentFields from "../apps/web/src/IncidentFields";
import { TaskRows } from "../apps/web/src/WorkspaceViews";
import { buildWorklist } from "../packages/domain/worklist";

afterEach(() => {
  setLocale("fr");
  setCsrfToken("");
  vi.unstubAllGlobals();
});

describe("FR/EN interface contracts", () => {
  it("translates task defaults while preserving an assignee whose name equals a French label", () => {
    setLocale("en");
    const items = buildWorklist(
      [
        {
          id: "a",
          title: "Enregistrer",
          fiscal_year: 2026,
          kind: "incident",
          payload: { status: "En cours", assignee: "Non affecté" },
        },
        {
          id: "b",
          title: "Libellé saisi",
          fiscal_year: 2026,
          kind: "incident",
          payload: { status: "Signalé" },
        },
      ],
      [],
      "2026-10-26",
    );
    const html = renderToStaticMarkup(
      createElement(TaskRows, { items, asOf: "2026-10-26", onOpen: () => {} }),
    );
    expect(html).toContain("Enregistrer");
    expect(html).toContain("Non affecté");
    expect(html).toContain("Unassigned");
    expect(html).toContain("In progress");
    expect(html).toContain("Normal");
  });
  it("provides both catalogues with identical placeholders and no empty translations", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      Object.keys(catalogs.fr).sort(),
    );
    for (const key of Object.keys(catalogs.fr) as MessageKey[]) {
      expect(catalogs.en[key].trim(), key).not.toBe("");
      const placeholders = (s: string) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(catalogs.en[key]), key).toEqual(
        placeholders(catalogs.fr[key]),
      );
    }
  });
  it("interpolates values literally and preserves unknown content", () => {
    expect(
      formatMessage("en", "vault.portable_summary", {
        date: "26/10/2026",
        count: 3,
      }),
    ).toContain("3");
    expect(
      formatMessage("en", "app.m0155", { p1: "{p1} <script> €" }),
    ).toContain("{p1} <script> €");
    expect(knownText("Éclairage du hall de Mme Martin", "en")).toBe(
      "Éclairage du hall de Mme Martin",
    );
    expect(knownText("Enregistrer", "en")).toBe("Save");
    expect(sourceText("common.save")).toBe("Enregistrer");
  });
  it("persists the language, updates document language and tolerates blocked storage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    vi.stubGlobal("document", { documentElement: { lang: "fr" } });
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(localeTag()).toBe("en-GB");
    expect(document.documentElement.lang).toBe("en");
    expect(setItem).toHaveBeenCalledWith("domolyma-language", "en");
    setItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setLocale("fr")).not.toThrow();
    expect(getLocale()).toBe("fr");
    expect(msg("common.save")).toBe("Enregistrer");
    setLocale("xx" as "en");
    expect(getLocale()).toBe("fr");
  });
  it("renders English incident choices while retaining valid French business defaults", () => {
    setLocale("en");
    const html = renderToStaticMarkup(
      createElement(IncidentFields, {
        selected: null,
        operations: [],
        records: [],
        manager: true,
        preset: null,
        onRestricted: () => {},
      }),
    );
    expect(html).toMatch(/value="Équipement" selected="">Equipment/);
    expect(html).toMatch(/value="Panne" selected="">Breakdown/);
    expect(html).toMatch(/value="Incident" selected="">Incident/);
    expect(html).toContain('value="Accident corporel"');
    expect(html).not.toContain('value="Equipment"');
  });
  it("localizes validation messages including known custom errors without changing their source", () => {
    expect(
      validationMessage(
        {
          code: "too_small",
          origin: "string",
          minimum: 3,
          message: "Too small",
        },
        "en",
      ),
    ).toContain("3");
    expect(
      validationMessage(
        { code: "invalid_value", message: "Invalid option" },
        "en",
      ),
    ).toBe(catalogs.en["validation.choice"]);
    expect(
      validationMessage({ code: "custom", message: "Enregistrer" }, "en"),
    ).toBe("Save");
    expect(
      validationMessage(
        { code: "custom", message: "Custom external constraint" },
        "fr",
      ),
    ).toBe("Custom external constraint");
  });
});

describe("Localized API errors without modifying business responses", () => {
  it("returns a successful response untouched even when a title matches a French UI message", async () => {
    setLocale("en");
    const response = Response.json({
      title: "Enregistrer",
      payload: { domain: "Équipement", status: "En cours" },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await apiFetch("/api/example");
    expect(result).toBe(response);
    expect(await result.json()).toEqual({
      title: "Enregistrer",
      payload: { domain: "Équipement", status: "En cours" },
    });
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get("Accept-Language"),
    ).toBe("en");
  });
  it("keeps status, CSRF and structured errors while translating user-facing messages", async () => {
    setLocale("en");
    setCsrfToken("synthetic-test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "Champs invalides",
          details: [
            {
              code: "too_small",
              origin: "string",
              minimum: 2,
              message: "Too small",
              path: ["title"],
            },
          ],
          version: 7,
        },
        {
          status: 409,
          headers: { "X-Request-Id": "test", "Content-Length": "200" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await apiFetch("/api/example", {
      method: "POST",
      body: "{}",
    });
    const body = (await result.json()) as any;
    expect(result.status).toBe(409);
    expect(result.headers.get("X-Request-Id")).toBe("test");
    expect(result.headers.has("Content-Length")).toBe(false);
    expect(body.error).toBe(catalogs.en["api.invalid_fields"]);
    expect(body.version).toBe(7);
    expect(body.details[0].path).toEqual(["title"]);
    expect(body.details[0].message).toContain("2");
    const options = fetchMock.mock.calls[0][1];
    expect(options.credentials).toBe("same-origin");
    expect(options.headers.get("X-CSRF-Token")).toBe("synthetic-test-token");
  });
  it("preserves non-JSON failures and propagates cancellation", async () => {
    const response = new Response("gateway unavailable", { status: 502 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await apiFetch("/api/example")).toBe(response);
    const aborted = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
    await expect(
      apiFetch("/api/example", { signal: AbortSignal.abort() }),
    ).rejects.toBe(aborted);
  });
});

describe("Bounded dynamic translation cache", () => {
  it("caches repeated unknown metadata, isolates languages and evicts old entries", () => {
    const original = RegExp.prototype.exec;
    let executions = 0;
    const spy = vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (
      this: RegExp,
      text: string,
    ) {
      if (this.source.includes("([\\s\\S]*?)")) executions++;
      return original.call(this, text);
    });
    try {
      const text = "Unknown metadata cache probe 8421";
      knownText(text, "fr");
      const first = executions;
      knownText(text, "fr");
      const repeated = executions;
      knownText(text, "en");
      const english = executions;
      for (let i = 0; i < 600; i++)
        knownText(`Unknown metadata eviction ${i}`, "fr");
      const before = executions;
      knownText(text, "fr");
      const after = executions;
      expect(first).toBeGreaterThan(0);
      expect(repeated).toBe(first);
      expect(english).toBeGreaterThan(repeated);
      expect(after).toBeGreaterThan(before);
      expect(knownText("Unknown metadata remains unchanged", "en")).toBe(
        "Unknown metadata remains unchanged",
      );
    } finally {
      spy.mockRestore();
    }
  });
});
