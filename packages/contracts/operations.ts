import { sourceText } from "../i18n/source";
import { interventionCategories } from "./rentals";
import { z } from "zod";
const short = z.string().trim().max(300),
  required = short.min(1),
  id = z.string().max(100),
  date = z.union([z.literal(""), z.iso.date()]);
export { roleLabels } from "../domain/ui-values";
export const lotSchema = z.object({
  number: required,
  label: required,
  ownerId: id.nullable(),
  buildingId: id.nullable(),
  lotType: z.enum([
    "apartment",
    "parking",
    "garage",
    "cellar",
    "bicycle",
    "commercial",
    "other",
  ]),
  areaM2: z.string().regex(/^(?:\d{1,6}(?:[.,]\d{1,2})?)?$/),
  weight: z.number().int().positive().max(100000000),
  useType: z.enum(["residential", "professional", "mixed", "ancillary"]),
  declaredActivity: short,
  apartmentNumber: short,
  parentLotId: id.nullable(),
  intercomDisplay: short,
  intercomProgram: short,
  mailbox: short,
});
export const buildingSchema = z.object({
  name: required,
  hasIntercom: z.boolean(),
  displayOffset: z.number().int().min(-10000).max(10000).nullable(),
  programOffset: z.number().int().min(-10000).max(10000).nullable(),
  notes: z.string().max(3000),
});
export const relationSchema = z
  .object({
    lotId: id,
    userId: id,
    relation: z.enum(["owner", "occupant"]),
    tenure: z.enum(["owner", "tenant"]).nullable(),
    validFrom: z.iso.date(),
    validUntil: date,
  })
  .refine((v) => !v.validUntil || v.validUntil > v.validFrom, {
    message: sourceText("metadata.m1376"),
  });
const equipment = z.object({
  category: required,
  buildingId: id.nullable(),
  parentId: id.nullable(),
  location: short,
  reference: short,
  serial: short,
  commissioned: date,
  nextMaintenance: date,
  notes: z.string().max(5000),
});
const contract = z
  .object({
    supplier: required,
    reference: short,
    equipmentIds: z.array(id).max(100),
    startsOn: date,
    endsOn: date,
    frequency: required,
    coverage: z.string().max(5000),
    exclusions: z.string().max(5000),
    notes: z.string().max(5000),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: sourceText("metadata.m1377"),
  });
const visit = z
  .object({
    category: z.enum(interventionCategories).default("Autre"),
    contractId: id.nullable(),
    equipmentIds: z.array(id).max(100),
    incidentId: id.nullable(),
    scheduledOn: z.iso.date(),
    performedOn: date,
    status: z.enum(["Prévu", "Réalisé", "Avec réserves", "Annulé"]),
    reception: z
      .enum(["À vérifier", "Réceptionné", "Réserves"])
      .default("À vérifier"),
    report: z.string().max(5000),
    reservations: z.string().max(3000),
  })
  .refine((v) => v.status !== "Réalisé" || Boolean(v.performedOn), {
    message: sourceText("metadata.m1378"),
  });
const event = z
  .object({
    category: z.enum([
      "Déménagement",
      "Fête",
      "Information",
      "Travaux privatifs",
      "Autre",
    ]),
    startsAt: z.iso.datetime({ local: true }),
    endsAt: z.union([z.literal(""), z.iso.datetime({ local: true })]),
    location: short,
    description: z.string().trim().min(1).max(5000),
  })
  .refine((v) => !v.endsAt || v.endsAt >= v.startsAt, {
    message: sourceText("metadata.m1379"),
  });
const access = z
  .object({
    type: z.enum(["Clé", "Badge Vigik", "Télécommande", "Autre"]),
    quantity: z.number().int().min(1).max(1000),
    holderId: id,
    serial: short,
    internalCode: short,
    handedOn: z.iso.date(),
    returnedOn: date,
    opensEquipmentIds: z.array(id).max(100),
    notes: z.string().max(3000),
  })
  .refine((v) => !v.returnedOn || v.returnedOn >= v.handedOn, {
    message: sourceText("metadata.m1380"),
  });
const common = {
  title: required,
  audience: z.enum(["residents", "owners", "management", "lot"]),
  lotId: id.nullable(),
  assignedTo: id.nullable(),
  fiscalYear: z.number().int().min(1900).max(2200),
};
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("equipment"), payload: equipment }),
  z.object({ ...common, kind: z.literal("contract"), payload: contract }),
  z.object({ ...common, kind: z.literal("visit"), payload: visit }),
  z.object({ ...common, kind: z.literal("event"), payload: event }),
  z.object({ ...common, kind: z.literal("access"), payload: access }),
]);
export type OperationInput = z.infer<typeof operationSchema>;
export type Operation = {
  id: string;
  condominium_id: string;
  kind: OperationInput["kind"];
  title: string;
  audience: OperationInput["audience"];
  lot_id: string | null;
  assigned_to: string | null;
  fiscal_year: number;
  payload: Record<string, any>;
  version: number;
  created_by: string;
  updated_at: string;
};
export type Building = {
  id: string;
  name: string;
  has_intercom: number;
  intercom_display_offset: number | null;
  intercom_program_offset?: number | null;
  notes: string;
};
