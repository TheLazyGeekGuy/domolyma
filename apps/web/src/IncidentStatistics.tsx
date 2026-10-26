import { msg, labelText } from "./i18n";
import { incidentStatistics } from "../../../packages/domain/incident-statistics";
import type { RecordRow } from "../../../packages/contracts";
export default function IncidentStatistics({
  records,
  year,
}: {
  records: RecordRow[];
  year: number;
}) {
  const stats = incidentStatistics(records);
  return (
    <section className="panel incident-statistics">
      <h2>
        {msg("incident_statistics.m0819")}
        {year}
      </h2>
      <p className="table-note">{msg("incident_statistics.m0820")}</p>
      <dl className="budget-numbers">
        <div>
          <dt>{msg("incident_statistics.m0821")}</dt>
          <dd>{stats.accidents}</dd>
        </div>
        <div>
          <dt>{msg("incident_statistics.m0822")}</dt>
          <dd>{stats.nearMisses}</dd>
        </div>
        <div>
          <dt>{msg("incident_statistics.m0823")}</dt>
          <dd>{stats.security}</dd>
        </div>
        <div>
          <dt>{msg("incident_statistics.m0824")}</dt>
          <dd>{stats.linked}</dd>
        </div>
      </dl>
      <p className="table-note">
        {stats.unclassified}
        {msg("incident_statistics.m0825")}
      </p>
      <details>
        <summary>{msg("incident_statistics.m0826")}</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{msg("budget_panel.m0297")}</th>
                <th>{msg("incident_statistics.m0827")}</th>
                <th>{msg("incident_statistics.m0828")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.months.map((m) => (
                <tr key={m.month}>
                  <td>{String(m.month).padStart(2, "0")}</td>
                  <td>{m.reports}</td>
                  <td>{m.accidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="incident-breakdown">
          {(
            [
              [msg("incident_statistics.m0829"), stats.domains, true],
              [msg("incident_statistics.m0830"), stats.locations, false],
              [msg("incident_fields.m0797"), stats.consequences, true],
            ] as const
          ).map(([title, rows, translated]) => (
            <div key={title}>
              <h3>{title}</h3>
              {rows.length ? (
                <ul>
                  {rows.map(([name, count]) => (
                    <li key={name}>
                      {translated ? labelText(name) : name}{" "}
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{msg("incident_statistics.m0831")}</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
