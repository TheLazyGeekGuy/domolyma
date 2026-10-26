import type { RecordRow } from "../contracts";
/** Counts of reports, not a population incidence rate or a causal inference. */
export function incidentStatistics(records: RecordRow[]) {
  const rows = records.filter((r) => r.kind === "incident");
  const classified = rows.filter((r) => !!r.payload.eventNature);
  const counts = (key: string, subset = classified) =>
    Object.entries(
      subset.reduce<Record<string, number>>((all, r) => {
        const value = String(r.payload[key] || "Non renseigné");
        all[value] = (all[value] || 0) + 1;
        return all;
      }, {}),
    ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  const accidents = classified.filter(
    (r) => r.payload.eventNature === "Accident corporel",
  );
  const linked = classified.filter((r) => !!r.payload.relatedIncidentId);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    reports: classified.filter(
      (r) =>
        Number(
          new Intl.DateTimeFormat("en-CA", {
            month: "2-digit",
            timeZone: "Europe/Paris",
          }).format(new Date(r.payload.occurredAt)),
        ) ===
        i + 1,
    ).length,
    accidents: accidents.filter(
      (r) =>
        Number(
          new Intl.DateTimeFormat("en-CA", {
            month: "2-digit",
            timeZone: "Europe/Paris",
          }).format(new Date(r.payload.occurredAt)),
        ) ===
        i + 1,
    ).length,
  }));
  return {
    total: rows.length,
    unclassified: rows.length - classified.length,
    accidents: accidents.length,
    nearMisses: classified.filter(
      (r) => r.payload.eventNature === "Presque-accident",
    ).length,
    security: classified.filter((r) => r.payload.domain === "Sécurité").length,
    linked: linked.length,
    domains: counts("domain"),
    locations: counts("location"),
    consequences: counts("injuryLevel", accidents),
    months,
  };
}
