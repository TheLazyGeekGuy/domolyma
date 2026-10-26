import { describe, expect, it } from "vitest";
import { budgetSummary, indicativeShare } from "../packages/domain/budget";
describe("Suivi indicatif du budget", () => {
  it("distingue facturé, réglé, annulé, futur et mois restants", () => {
    const result = budgetSummary(
      1_200_000,
      [
        {
          invoice_date: "2026-01-03",
          amount_cents: 100_000,
          paid_cents: 80_000,
          cancelled: 0,
        },
        {
          invoice_date: "2026-10-20",
          amount_cents: 90_000,
          paid_cents: 0,
          cancelled: 0,
        },
        {
          invoice_date: "2026-11-01",
          amount_cents: 70_000,
          paid_cents: 0,
          cancelled: 0,
        },
        {
          invoice_date: "2026-03-01",
          amount_cents: 50_000,
          paid_cents: 0,
          cancelled: 1,
        },
        {
          invoice_date: "2025-03-01",
          amount_cents: 50_000,
          paid_cents: 0,
          cancelled: 0,
        },
      ],
      2026,
      "2026-10-23",
    );
    expect(result.invoicedCents).toBe(190_000);
    expect(result.paidCents).toBe(80_000);
    expect(result.unpaidCents).toBe(110_000);
    expect(result.forecastCents).toBe(390_000);
    expect(result.varianceCents).toBe(-810_000);
    expect(result.months[0].invoicedCents).toBe(100_000);
    expect(result.months[9].invoicedCents).toBe(190_000);
    expect(result.months[11].budgetCents).toBe(1_200_000);
  });
  it("ne fabrique pas un budget absent et traite exercices passés et futurs", () => {
    expect(
      budgetSummary(null, [], 2026, "2026-10-23").forecastCents,
    ).toBeNull();
    for (const [year, today] of [
      [2025, "2026-10-23"],
      [2027, "2026-10-23"],
      [2026, "2026-01-01"],
      [2026, "2026-12-31"],
    ] as const) {
      const empty = budgetSummary(1200, [], year, today);
      expect(empty.forecastCents).toBeNull();
      expect(empty.varianceCents).toBeNull();
    }
  });
  it("calcule les quotes-parts et arrondis sans produit flottant", () => {
    expect(indicativeShare(100, 1, 3)).toBe(33);
    expect(indicativeShare(1, 1, 2)).toBe(1);
    expect(indicativeShare(0, 10, 100)).toBe(0);
    expect(indicativeShare(null, 10, 100)).toBeNull();
    expect(indicativeShare(100, 0, 0)).toBeNull();
    expect(indicativeShare(100_000_001, 1_000_001, 10_000_003)).toBe(
      10_000_007,
    );
  });
});
