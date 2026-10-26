import { describe, it, expect } from "vitest";
import { occupancyDays, businessDate } from "../packages/domain/occupancy";
describe("Occupation en dates métier, arrivée incluse et départ exclu", () => {
  it("utilise la date de Paris et non la veille UTC à minuit local", () => {
    expect(businessDate(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
  });
  it("compte les nuits sans dérive lors du changement d’heure", () => {
    expect(
      occupancyDays([{ start: "2026-10-24", end: "2026-10-27" }], 2026).days,
    ).toBe(3);
  });
  it("fusionne les périodes et les coupe aux bornes de l’exercice", () => {
    expect(
      occupancyDays(
        [
          { start: "2025-12-29", end: "2026-01-04" },
          { start: "2026-01-03", end: "2026-01-06" },
        ],
        2026,
      ).days,
    ).toBe(5);
  });
  it("compte 366 jours pour une année bissextile complète", () => {
    expect(
      occupancyDays([{ start: "2023-12-20", end: "2025-02-01" }], 2024),
    ).toEqual({ days: 366, daysInYear: 366 });
  });
});
