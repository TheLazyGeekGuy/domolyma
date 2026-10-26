import { sourceText } from "../../packages/i18n/source";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { fail, json } from "./access";
export type GhostProfile = {
  user_id: string;
  condominium_id: string;
  label: string;
  role: string;
  lot_ids: string;
  equipment_ids: string;
};
type Account = {
  user_id: string;
  name: string;
  login: string;
  password_hash: string | null;
  administrator: number;
  disabled: number;
};
export type Identity = {
  mode: "demo" | "real";
  account: Account | null;
  userId: string | null;
  sessionHash: string | null;
  csrfToken: string | null;
  ghost: GhostProfile | null;
};
const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    sourceText("metadata.m1180"),
  );
const credentials = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
  password: z
    .string()
    .min(1)
    .max(72)
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      sourceText("metadata.m1181"),
    ),
});
const random = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const digest = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function installationMode(
  db: D1Database,
): Promise<"demo" | "real"> {
  return (
    (
      await db
        .prepare("SELECT mode FROM installation_settings WHERE id=1")
        .first<{ mode: "demo" | "real" }>()
    )?.mode || "demo"
  );
}
const publicAccount = (account: Account) => ({
  id: account.user_id,
  name: account.name,
  login: account.login,
  administrator: !!account.administrator,
});
export async function identity(
  request: Request,
  db: D1Database,
  mode: "demo" | "real",
): Promise<Identity> {
  const empty: Identity = {
    mode,
    account: null,
    userId: null,
    sessionHash: null,
    csrfToken: null,
    ghost: null,
  };
  if (mode === "demo") return empty;
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)domolyma_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return empty;
  const tokenHash = await digest(token);
  const session = await db
    .prepare(
      "SELECT user_id,csrf_token,ghost_user_id FROM auth_sessions WHERE token_hash=? AND expires_at>?",
    )
    .bind(tokenHash, Date.now())
    .first<{
      user_id: string;
      csrf_token: string;
      ghost_user_id: string | null;
    }>();
  if (!session) return empty;
  const account = await db
    .prepare(
      "SELECT a.*,u.name FROM auth_accounts a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND a.disabled=0",
    )
    .bind(session.user_id)
    .first<Account>();
  if (!account || !account.password_hash) return empty;
  const ghost =
    session.ghost_user_id && account.administrator
      ? await db
          .prepare(
            "SELECT g.* FROM ghost_profiles g JOIN memberships m ON m.condominium_id=g.condominium_id WHERE g.user_id=? AND m.user_id=? AND m.revoked_at IS NULL",
          )
          .bind(session.ghost_user_id, account.user_id)
          .first<GhostProfile>()
      : null;
  if (session.ghost_user_id && !ghost) return empty;
  return {
    mode,
    account,
    userId: ghost?.user_id || account.user_id,
    sessionHash: tokenHash,
    csrfToken: session.csrf_token,
    ghost,
  };
}
export function requireSession(request: Request, who: Identity) {
  if (!who.account) fail(401, sourceText("metadata.m1182"));
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("X-CSRF-Token") !== who.csrfToken
  )
    fail(403, sourceText("metadata.m1183"));
}
async function event(
  db: D1Database,
  user: string | null,
  action: string,
  target: string | null = null,
) {
  await db
    .prepare(
      "INSERT INTO auth_events(user_id,action,target_user_id,happened_at) VALUES(?,?,?,?)",
    )
    .bind(user, action, target, new Date().toISOString())
    .run();
}
async function sessionResponse(
  request: Request,
  db: D1Database,
  account: Account,
) {
  const token = random(),
    csrf = random(),
    tokenHash = await digest(token),
    now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(now),
    db
      .prepare(
        "INSERT INTO auth_sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)",
      )
      .bind(
        tokenHash,
        account.user_id,
        csrf,
        now + 8 * 3600_000,
        new Date().toISOString(),
      ),
  ]);
  return Response.json(
    { account: publicAccount(account), csrfToken: csrf },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `domolyma_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      },
    },
  );
}
async function checkAttempts(db: D1Database, login: string) {
  const row = await db
    .prepare(
      "SELECT failures FROM auth_attempts WHERE login_key=? AND window_start>?",
    )
    .bind(login, Date.now() - 900_000)
    .first<{ failures: number }>();
  if (row && row.failures >= 10) fail(429, sourceText("metadata.m1184"));
}
async function failedAttempt(db: D1Database, login: string) {
  const now = Date.now();
  await db.batch([
    db
      .prepare("DELETE FROM auth_attempts WHERE window_start<=?")
      .bind(now - 900_000),
    db
      .prepare(
        "INSERT INTO auth_attempts(login_key,window_start,failures) VALUES(?,?,1) ON CONFLICT(login_key) DO UPDATE SET failures=failures+1",
      )
      .bind(login, now),
  ]);
}
async function rotateSession(
  request: Request,
  db: D1Database,
  who: Identity,
  ghost: string | null,
) {
  const token = random(),
    csrf = random(),
    now = Date.now();
  const rotated = await db
    .prepare(
      "UPDATE auth_sessions SET token_hash=?,csrf_token=?,ghost_user_id=? WHERE token_hash=? AND expires_at>? RETURNING expires_at",
    )
    .bind(await digest(token), csrf, ghost, who.sessionHash, now)
    .first<{ expires_at: number }>();
  if (!rotated) fail(401, sourceText("metadata.m1185"));
  return Response.json(
    { saved: true, csrfToken: csrf },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `domolyma_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1, Math.floor((rotated.expires_at - now) / 1000))}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      },
    },
  );
}

export async function handleAuth(
  request: Request,
  db: D1Database,
  who: Identity,
) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/auth/")) return null;
  if (path === "/api/auth/session" && request.method === "GET") {
    if (who.mode === "demo")
      return json({ mode: "demo", authenticated: false });
    if (who.account)
      return json({
        mode: "real",
        authenticated: true,
        account: publicAccount(who.account),
        csrfToken: who.csrfToken,
        ghost: who.ghost
          ? { id: who.ghost.user_id, label: who.ghost.label }
          : null,
      });
    const setup = await db
      .prepare(
        "SELECT a.login,u.name FROM installation_settings s JOIN auth_accounts a ON a.user_id=s.owner_user_id JOIN users u ON u.id=a.user_id WHERE s.id=1 AND a.password_hash IS NULL AND a.disabled=0",
      )
      .first<{ login: string; name: string }>();
    return json({
      mode: "real",
      authenticated: false,
      setupRequired: !!setup,
      ...(setup ? { setupLogin: setup.login, setupName: setup.name } : {}),
    });
  }
  if (who.mode !== "real") fail(404, sourceText("metadata.m1186"));
  if (
    ["/api/auth/login", "/api/auth/setup"].includes(path) &&
    request.method === "POST"
  ) {
    const input = credentials.parse(await request.json());
    await checkAttempts(db, input.login);
    const account = await db
      .prepare(
        "SELECT a.*,u.name FROM auth_accounts a JOIN users u ON u.id=a.user_id WHERE a.login=? AND a.disabled=0",
      )
      .bind(input.login)
      .first<Account>();
    if (path.endsWith("/setup")) {
      const owner = await db
        .prepare("SELECT owner_user_id FROM installation_settings WHERE id=1")
        .first<{ owner_user_id: string }>();
      password.parse(input.password);
      if (
        !account ||
        account.user_id !== owner?.owner_user_id ||
        account.password_hash
      ) {
        await failedAttempt(db, input.login);
        fail(409, sourceText("metadata.m1187"));
      }
      const result = await db
        .prepare(
          "UPDATE auth_accounts SET password_hash=? WHERE user_id=? AND password_hash IS NULL",
        )
        .bind(await hash(input.password, 12), account.user_id)
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1188"));
      await event(db, account.user_id, "owner_activated");
    } else {
      // Fixed bcrypt cost for unknown users too; no password/hash is returned.
      const valid = await compare(
        input.password,
        account?.password_hash ||
          "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
      );
      if (!account?.password_hash || !valid) {
        await failedAttempt(db, input.login);
        fail(401, sourceText("metadata.m1189"));
      }
      await event(db, account.user_id, "login");
    }
    await db
      .prepare("DELETE FROM auth_attempts WHERE login_key=?")
      .bind(input.login)
      .run();
    return sessionResponse(request, db, account!);
  }
  requireSession(request, who);
  if (path === "/api/auth/logout" && request.method === "POST") {
    await db
      .prepare("DELETE FROM auth_sessions WHERE token_hash=?")
      .bind(who.sessionHash)
      .run();
    await event(db, who.account!.user_id, "logout");
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie":
          "domolyma_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      },
    });
  }
  if (path === "/api/auth/ghosts" && request.method === "GET") {
    if (!who.account!.administrator) fail(403, sourceText("metadata.m1190"));
    const profiles = (
      await db
        .prepare(
          "SELECT g.user_id AS id,g.label,g.role,g.condominium_id FROM ghost_profiles g JOIN memberships m ON m.condominium_id=g.condominium_id WHERE m.user_id=? AND m.revoked_at IS NULL ORDER BY g.role,g.label",
        )
        .bind(who.account!.user_id)
        .all()
    ).results;
    return json({ profiles });
  }
  if (path === "/api/auth/impersonate" && request.method === "POST") {
    if (!who.account!.administrator) fail(403, sourceText("metadata.m1190"));
    const { userId } = z
      .object({ userId: z.string().max(100).nullable() })
      .parse(await request.json());
    if (userId) {
      const target = await db
        .prepare(
          "SELECT g.user_id FROM ghost_profiles g JOIN memberships m ON m.condominium_id=g.condominium_id WHERE g.user_id=? AND m.user_id=? AND m.revoked_at IS NULL",
        )
        .bind(userId, who.account!.user_id)
        .first();
      if (!target) fail(403, sourceText("metadata.m1191"));
    }
    const response = await rotateSession(request, db, who, userId);
    await event(
      db,
      who.account!.user_id,
      userId ? "ghost_enter" : "ghost_exit",
      userId,
    );
    return response;
  }
  fail(404, sourceText("metadata.m1192"));
}
export async function handleAdministration(
  request: Request,
  db: D1Database,
  who: Identity,
) {
  if (new URL(request.url).pathname !== "/api/admin/overview") return null;
  requireSession(request, who);
  if (!who.account!.administrator || who.ghost)
    fail(403, sourceText("metadata.m1193"));
  if (request.method !== "GET") fail(405, sourceText("metadata.m1194"));
  const accounts = (
    await db
      .prepare(
        "SELECT a.user_id,u.name,a.login,a.administrator,a.disabled,(a.password_hash IS NOT NULL) AS activated FROM auth_accounts a JOIN users u ON u.id=a.user_id ORDER BY a.login",
      )
      .all()
  ).results;
  const imports = (
    await db
      .prepare(
        "SELECT id,source_label,created_at,summary FROM import_batches ORDER BY created_at DESC",
      )
      .all()
  ).results.map((r) => ({ ...r, summary: JSON.parse(String(r.summary)) }));
  const events = (
    await db
      .prepare(
        "SELECT user_id,action,target_user_id,happened_at FROM auth_events ORDER BY id DESC LIMIT 50",
      )
      .all()
  ).results;
  return json({ accounts, imports, events });
}
