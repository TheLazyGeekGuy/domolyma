import { describe, expect, it } from "vitest";
import { incidentStatistics } from "../packages/domain/incident-statistics";
import type { RecordRow } from "../packages/contracts";
const row = (id: string, payload: Record<string, unknown>) =>
  ({ id, kind: "incident", payload }) as RecordRow;
describe("Registre de prévention", () => {
  it("compte les anciens dossiers séparément et ne confond pas axes et événements", () => {
    const result = incidentStatistics([
      row("old", { description: "Ancien dossier" }),
      row("incident", {
        eventNature: "Incident",
        domain: "Équipement",
        location: "Hall",
        occurredAt: "2026-01-01T10:00:00Z",
      }),
      row("near", {
        eventNature: "Presque-accident",
        domain: "Espaces et circulation",
        location: "Parking",
        occurredAt: "2026-02-01T10:00:00Z",
      }),
      row("accident", {
        eventNature: "Accident corporel",
        domain: "Sécurité",
        injuryLevel: "Secours sollicités",
        location: "Parking",
        occurredAt: "2026-02-02T10:00:00Z",
        relatedIncidentId: "incident",
      }),
    ]);
    expect(result.total).toBe(4);
    expect(result.unclassified).toBe(1);
    expect(result.accidents).toBe(1);
    expect(result.security).toBe(1);
    expect(result.nearMisses).toBe(1);
    expect(result.linked).toBe(1);
    expect(result.months[1]).toEqual({ month: 2, reports: 2, accidents: 1 });
    expect(result.locations[0]).toEqual(["Parking", 2]);
  });
  it("utilise le mois de survenue Europe/Paris plutôt que le mois UTC", () => {
    const result = incidentStatistics([
      row("boundary", {
        eventNature: "Incident",
        occurredAt: "2026-01-31T23:30:00Z",
      }),
    ]);
    expect(result.months[0].reports).toBe(0);
    expect(result.months[1].reports).toBe(1);
  });
});
