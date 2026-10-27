import type { RecordRow } from "../contracts";
const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "2-digit",
  timeZone: "Europe/Paris",
});
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
    reports: 0,
    accidents: 0,
  }));
  let undated = 0;
  for (const row of classified) {
    const raw = row.payload.occurredAt;
    const date = new Date(typeof raw === "string" && raw.trim() ? raw : NaN);
    if (!Number.isFinite(date.getTime())) {
      undated++;
      continue;
    }
    const bucket = months[Number(monthFormatter.format(date)) - 1];
    bucket.reports++;
    if (row.payload.eventNature === "Accident corporel") bucket.accidents++;
  }
  return {
    total: rows.length,
    undated,
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
