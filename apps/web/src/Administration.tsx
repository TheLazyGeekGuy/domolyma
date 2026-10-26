import { msg, labelText, localeTag } from "./i18n";
import { useEffect, useState } from "react";
import { apiFetch } from "./session";
type Overview = {
  accounts: {
    user_id: string;
    name: string;
    login: string;
    administrator: number;
    activated: number;
  }[];
  imports: {
    id: string;
    source_label: string;
    created_at: string;
    summary: Record<string, number>;
  }[];
  events: {
    user_id: string;
    action: string;
    target_user_id: string | null;
    happened_at: string;
  }[];
};
export default function Administration() {
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch("/api/admin/overview")
      .then(async (r) => {
        const b = (await r.json()) as Overview & { error: string };
        if (!r.ok) throw new Error(b.error);
        setData(b);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section>
      <h2>{msg("administration.m0021")}</h2>
      <p>{msg("administration.m0022")}</p>
      {error && (
        <p className="error" role="alert">
          {labelText(error)}
        </p>
      )}
      {data && (
        <>
          <h3>{msg("administration.m0023")}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{msg("administration.m0024")}</th>
                  <th>{msg("administration.m0025")}</th>
                  <th>{msg("administration.m0026")}</th>
                  <th>{msg("administration.m0027")}</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.name}</td>
                    <td>{a.login}</td>
                    <td>
                      {a.administrator
                        ? msg("administration.m0028")
                        : msg("administration.m0029")}
                    </td>
                    <td>
                      {a.activated
                        ? msg("administration.m0030")
                        : msg("administration.m0031")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{msg("administration.m0032")}</h3>
          {data.imports.length ? (
            data.imports.map((i) => (
              <div key={i.id} className="import-summary">
                <strong>{i.source_label}</strong>
                <p>{new Date(i.created_at).toLocaleString(localeTag())}</p>
                <p>
                  {Object.entries(i.summary)
                    .map(([k, v]) => `${k} : ${v}`)
                    .join(" · ")}
                </p>
              </div>
            ))
          ) : (
            <p>{msg("administration.m0033")}</p>
          )}
          <h3>{msg("administration.m0034")}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{msg("administration.m0035")}</th>
                  <th>{msg("administration.m0036")}</th>
                  <th>{msg("administration.m0037")}</th>
                  <th>{msg("administration.m0038")}</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e, i) => (
                  <tr key={i}>
                    <td>
                      {new Date(e.happened_at).toLocaleString(localeTag())}
                    </td>
                    <td>
                      {{
                        login: msg("administration.m0039"),
                        logout: msg("administration.m0040"),
                        owner_activated: msg("administration.m0041"),
                        ghost_enter: msg("administration.m0042"),
                        ghost_exit: msg("administration.m0043"),
                      }[e.action] || e.action}
                    </td>
                    <td>{e.user_id}</td>
                    <td>{e.target_user_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
