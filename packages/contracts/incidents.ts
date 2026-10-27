import { sourceText } from "../i18n/source";
import { z } from "zod";
import {
  incidentNatures,
  incidentDomains,
  incidentSymptoms,
  injuryLevels,
} from "../domain/ui-values";
export {
  incidentNatures,
  incidentDomains,
  incidentSymptoms,
  injuryLevels,
} from "../domain/ui-values";
export const incidentClassification = {
  eventNature: z.enum(incidentNatures).optional(),
  domain: z.enum(incidentDomains).optional(),
  occurredAt: z
    .union([z.literal(""), z.iso.datetime({ offset: true })])
    .optional(),
  location: z.string().trim().max(300).optional(),
  equipmentMode: z.enum(["none", "catalogue", "other"]).optional(),
  equipmentDescription: z.string().trim().max(300).optional(),
  symptom: z.enum(incidentSymptoms).optional(),
  symptomOther: z.string().trim().max(300).optional(),
  injuryLevel: z.enum(injuryLevels).optional(),
  relatedIncidentId: z.string().max(100).nullable().optional(),
};
export const followupSchema = z
  .object({
    version: z.number().int().positive(),
    secured: z.boolean(),
    managerInformed: z.boolean(),
    evidenceCollected: z.boolean(),
    insuranceReviewed: z.boolean(),
    insuranceStatus: z.enum([
      "À évaluer",
      "À préparer",
      "Déclaré",
      "Sans déclaration",
      "Clos",
    ]),
    insuranceReference: z.string().trim().max(200),
    declaredOn: z.union([z.literal(""), z.iso.date()]),
    nextActionOn: z.union([z.literal(""), z.iso.date()]),
    notes: z.string().trim().max(3000),
  })
  .refine(
    (v) => v.insuranceStatus !== "Déclaré" || !!v.declaredOn,
    sourceText("metadata.m1367"),
  )
  .refine(
    (v) => v.insuranceStatus !== "Sans déclaration" || !!v.notes,
    sourceText("metadata.m1368"),
  );
