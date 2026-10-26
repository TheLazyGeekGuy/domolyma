import { sourceText } from "../i18n/source";
import { interventionCategories } from "./rentals";
import { z } from "zod";
import { incidentClassification } from "./incidents";
const text = z.string().trim().min(1).max(200);
const date = z.union([z.literal(""), z.iso.date()]);
export const incidentPayload = z
  .object({
    ...incidentClassification,
    category: z.enum(interventionCategories).default("Autre"),
    status: z.enum([
      "Signalé",
      "Qualifié",
      "Affecté",
      "En cours",
      "En attente",
      "Résolu",
      "Clôturé",
      "Réouvert",
    ]),
    priority: z.enum(["Normale", "Urgente"]),
    description: z.string().trim().min(1).max(5000),
    assignee: z.string().trim().max(200),
    dueDate: date,
    comment: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.eventNature) {
      if (
        Object.keys(incidentClassification).some(
          (k) => (v as any)[k] !== undefined,
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["eventNature"],
          message: sourceText("metadata.m1369"),
        });
      return; // Existing unclassified records remain unclassified.
    }
    for (const key of [
      "domain",
      "occurredAt",
      "location",
      "equipmentMode",
      "symptom",
    ] as const)
      if (!v[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: sourceText("metadata.m1370"),
        });
    if (v.equipmentMode === "other" && !v.equipmentDescription)
      ctx.addIssue({
        code: "custom",
        path: ["equipmentDescription"],
        message: sourceText("metadata.m1371"),
      });
    if (v.symptom === "Autre" && !v.symptomOther)
      ctx.addIssue({
        code: "custom",
        path: ["symptomOther"],
        message: sourceText("metadata.m1372"),
      });
    if (v.eventNature === "Accident corporel" && !v.injuryLevel)
      ctx.addIssue({
        code: "custom",
        path: ["injuryLevel"],
        message: sourceText("metadata.m1373"),
      });
    if (
      v.eventNature !== "Accident corporel" &&
      v.injuryLevel &&
      v.injuryLevel !== "Non renseignée"
    )
      ctx.addIssue({
        code: "custom",
        path: ["injuryLevel"],
        message: sourceText("metadata.m1374"),
      });
  });
const common = {
  accessScope: z
    .enum(["owners", "residents", "council", "assigned"])
    .optional(),
  equipmentId: z.string().max(100).nullable().optional(),
  title: text,
  audience: z.enum(["shared", "management", "lot"]),
  lotId: z.string().max(100).nullable(),
};
export const createRecord = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("incident"),
    payload: incidentPayload,
  }),
  z.object({
    ...common,
    kind: z.literal("assembly"),
    payload: z.object({
      date: z.iso.date(),
      location: text,
      agenda: z.string().trim().min(1).max(10000),
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("fund"),
    payload: z.object({
      amountCents: z.number().int().positive().max(100_000_000),
      dueDate: z.iso.date(),
      decision: z.string().trim().min(1).max(500),
    }),
  }),
]);
export const updateIncident = z.object({
  version: z.number().int().positive(),
  payload: incidentPayload,
  equipmentId: z.string().max(100).nullable().optional(),
});
export type RecordRow = {
  id: string;
  condominium_id: string;
  kind: "incident" | "assembly" | "fund" | "document";
  title: string;
  audience: "shared" | "management" | "lot";
  lot_id: string | null;
  payload: Record<string, any>;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
  equipment_id?: string | null;
};
export type Lot = {
  id: string;
  number: string;
  label: string;
  owner_id: string;
  weight: number;
  building_id?: string | null;
  lot_type?: string;
  area_m2?: string;
  use_type?: string;
  declared_activity?: string;
  apartment_number?: string;
  parent_lot_id?: string | null;
  intercom_display?: string;
  intercom_program?: string;
  mailbox?: string;
  version?: number;
};
