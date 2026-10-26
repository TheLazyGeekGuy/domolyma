import { describe, it, expect } from "vitest";
import { RequestGeneration } from "../apps/web/src/request-generation";
describe("Snapshot request generation", () => {
  it("rejects a manager response after a profile switch on the same property/year", () => {
    const r = new RequestGeneration();
    r.setScope("manager:residence:2026");
    const old = r.start("manager:residence:2026")!;
    r.invalidate();
    r.setScope("ghost:residence:2026");
    const next = r.start("ghost:residence:2026")!;
    expect(old()).toBe(false);
    expect(next()).toBe(true);
    expect(r.start("manager:residence:2026")).toBeNull();
    expect(next()).toBe(true);
  });
  it("does not accept an old response after A → B → A", () => {
    const r = new RequestGeneration();
    r.setScope("A");
    const old = r.start("A")!;
    r.setScope("B");
    r.setScope("A");
    const next = r.start("A")!;
    expect(old()).toBe(false);
    expect(next()).toBe(true);
  });
  it("accepts only the most recent of two overlapping refreshes", () => {
    const r = new RequestGeneration();
    r.setScope("same");
    const first = r.start("same")!,
      second = r.start("same")!;
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });
});
