import { msg, labelText, useLocale, LanguageSelector } from "./i18n";
import { useEffect, useState, type ReactNode } from "react";
import BrandLogo from "./BrandLogo";
import { apiFetch, setCsrfToken } from "./session";
export default function AuthGate({ children }: { children: ReactNode }) {
  useLocale();
  const [session, setSession] = useState<{
    mode: string;
    authenticated: boolean;
    setupRequired?: boolean;
    setupLogin?: string;
    setupName?: string;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await apiFetch("/api/auth/session");
    const s = (await r.json()) as any;
    if (!r.ok) throw new Error(s.error || msg("auth_gate.m0234"));
    setCsrfToken(s.csrfToken || "");
    setSession(s);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (session?.setupRequired && f.get("password") !== f.get("confirmation"))
        throw new Error(msg("auth_gate.m0235"));
      const r = await apiFetch(
        `/api/auth/${session?.setupRequired ? "setup" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login: f.get("login"),
            password: f.get("password"),
          }),
        },
      );
      const result = (await r.json()) as any;
      if (!r.ok) throw new Error(result.error || msg("auth_gate.m0236"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (session?.mode === "demo" || session?.authenticated) return children;
  return (
    <main className="auth-screen">
      <LanguageSelector />
      <div className="auth-brand">
        <BrandLogo />
      </div>
      <section className="auth-panel">
        <p className="eyebrow">{msg("auth_gate.m0237")}</p>
        <h1>
          {session?.setupRequired
            ? msg("auth_gate.m0238", { p1: session.setupName })
            : msg("administration.m0039")}
        </h1>
        <p>
          {session?.setupRequired
            ? msg("auth_gate.m0239")
            : msg("auth_gate.m0240")}
        </p>
        {error && (
          <p className="error" role="alert">
            {labelText(error)}
          </p>
        )}
        {session ? (
          <form onSubmit={submit}>
            <label>
              {msg("administration.m0025")}
              <input
                name="login"
                autoComplete="username"
                required
                defaultValue={session.setupLogin || "proprietaire"}
                readOnly={session.setupRequired}
              />
            </label>
            <label>
              {msg("auth_gate.m0241")}
              <input
                name="password"
                type="password"
                autoComplete={
                  session.setupRequired ? "new-password" : "current-password"
                }
                required
                minLength={session.setupRequired ? 12 : 1}
                maxLength={72}
              />
            </label>
            {session.setupRequired && (
              <>
                <small>{msg("auth_gate.m0242")}</small>
                <label>
                  {msg("auth_gate.m0243")}
                  <input
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                  />
                </label>
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? msg("auth_gate.m0244")
                : session.setupRequired
                  ? msg("auth_gate.m0245")
                  : msg("auth_gate.m0246")}
            </button>
          </form>
        ) : (
          <button
            className="secondary"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            {msg("common.retry")}
          </button>
        )}
        <small className="auth-footnote">{msg("auth_gate.m0248")}</small>
      </section>
    </main>
  );
}
