import { describe, expect, it } from "vitest";
import { buildWorklist } from "../packages/domain/worklist";
import { readRoute, routeHash } from "../apps/web/src/workspace-route";

describe("File opérationnelle et navigation", () => {
  it("conserve les incidents ouverts anciens sans compter les dossiers résolus", () => {
    const items = buildWorklist(
      [
        {
          id: "old",
          title: "Danger ancien",
          fiscal_year: 2025,
          kind: "incident",
          payload: { status: "En cours", dueDate: "2026-10-20" },
        },
        {
          id: "closed",
          title: "Clos",
          fiscal_year: 2026,
          kind: "incident",
          payload: { status: "Résolu" },
        },
        {
          id: "undated",
          title: "À qualifier",
          fiscal_year: 2024,
          kind: "incident",
          payload: { status: "Signalé" },
        },
      ],
      [],
      "2026-10-25",
    );
    expect(items.map((i) => i.id)).toEqual(["old", "undated"]);
    expect(items[0].year).toBe(2025);
    expect(items[1].dueDate).toBe("");
  });
  it("respecte l’horizon de 30 jours et les états des passages", () => {
    const op = (id: string, kind: string, payload: any) => ({
      id,
      kind,
      title: id,
      fiscal_year: 2026,
      payload,
    });
    const items = buildWorklist(
      [],
      [
        op("done", "visit", { status: "Réalisé", scheduledOn: "2026-10-20" }),
        op("future", "visit", { status: "Prévu", scheduledOn: "2026-12-25" }),
        op("near", "contract", { endsOn: "2026-11-24" }),
        op("far", "contract", { endsOn: "2026-11-25" }),
        op("late", "equipment", { nextMaintenance: "2026-01-01" }),
      ],
      "2026-10-25",
    );
    expect(items.map((i) => i.id)).toEqual(["late", "near", "future"]);
  });
  it("conserve le bien, l’exercice et un identifiant encodé dans un lien", () => {
    const route = {
      page: "tasks",
      context: "bien avec espace",
      year: 2025,
      record: "id/&?",
      search: "fuite & hall",
    };
    expect(readRoute(routeHash(route))).toEqual(route);
    expect(readRoute("#/inconnu?year=nan").page).toBe("overview");
    expect(readRoute("#/tasks?year=999999").year).toBe(
      new Date().getFullYear(),
    );
  });
});
