import { describe, it, expect } from "vitest";
import { allocateCents } from "../packages/domain/allocation";
describe("Répartition monétaire exacte", () => {
  it("répartit 1000 € en trois poids égaux avec départage stable", () => {
    expect(
      allocateCents(100000, [
        { id: "c", weight: 1 },
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ]),
    ).toEqual([
      { lotId: "c", cents: 33333 },
      { lotId: "a", cents: 33334 },
      { lotId: "b", cents: 33333 },
    ]);
  });
  it("conserve chaque centime, y compris pour les petits montants", () => {
    for (let amount = 1; amount <= 10000; amount += 37) {
      const lines = allocateCents(amount, [
        { id: "a", weight: 123 },
        { id: "b", weight: 877 },
        { id: "c", weight: 28 },
      ]);
      expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(amount);
      expect(
        lines.every((l) => Number.isSafeInteger(l.cents) && l.cents >= 0),
      ).toBe(true);
    }
  });
  it("rejette clés, doublons et montants invalides", () => {
    for (const amount of [0, -1, 1.2, Infinity, 100000001])
      expect(() => allocateCents(amount, [{ id: "a", weight: 1 }])).toThrow();
    expect(() => allocateCents(100, [])).toThrow();
    expect(() => allocateCents(100, [{ id: "a", weight: 0 }])).toThrow();
    expect(() =>
      allocateCents(100, [
        { id: "a", weight: 1 },
        { id: "a", weight: 2 },
      ]),
    ).toThrow();
  });
});
