import { sourceText } from "../i18n/source";
import { z } from "zod";
const short = z.string().trim().max(300);
const text = z.string().trim().max(5000);
const date = z.union([z.literal(""), z.iso.date()]);
const reference = z.string().min(1).max(100).nullable();
const year = z.number().int().min(1900).max(2200);
const money = z.number().int().min(0).max(100_000_000).nullable();
const source = {
  documentId: reference.default(null),
  sourceVersionId: reference.optional(),
  sourcePage: z.number().int().min(1).max(100000).nullable().default(null),
  sourceType: z
    .enum(["convocation", "minutes", "contract", "invoice", "report", "other"])
    .default("other"),
  sourceNote: text.default(""),
};
const common = {
  title: short.min(1),
  dossierYear: year,
  audience: z.enum(["owners", "council", "management"]),
  parentId: reference.default(null),
};
export const governanceInput = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("meeting"),
    payload: z.object({
      ...source,
      meetingDate: date,
      location: short,
      accountingYear: year.nullable(),
      budgetYear: year.nullable(),
      notes: text,
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("requirement"),
    payload: z.object({
      ...source,
      category: z.enum(["minutes", "accounts", "contract", "report", "other"]),
      status: z.enum(["expected", "received", "not_applicable"]),
      notes: text,
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("decision"),
    payload: z.object({
      ...source,
      number: short,
      body: z.string().trim().max(50000),
      status: z.enum([
        "proposed",
        "pending_evidence",
        "pending_review",
        "information",
        "adopted",
        "rejected",
      ]),
      decidedOn: date,
      votingRule: short,
      scope: short,
      reserve: text,
      ceilingCents: money,
      relatedIds: z.array(z.string().min(1).max(100)).max(30).default([]),
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("action"),
    payload: z.object({
      ...source,
      actionType: z.enum(["preparation", "document_request", "execution"]),
      status: z.enum([
        "planned",
        "in_progress",
        "waiting",
        "done",
        "cancelled",
      ]),
      responsible: short,
      dueDate: date,
      note: text,
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("offer"),
    payload: z.object({
      ...source,
      supplier: short.min(1),
      scope: short.min(1),
      unit: short.min(1),
      baseHtCents: money,
      baseTtcCents: money,
      options: text,
      duration: short,
      notice: short,
      renewal: short,
      indexation: text,
      coverage: text,
      exclusions: text,
      status: z.enum(["proposal", "withdrawn", "signed"]),
      signedOn: date,
    }),
  }),
  z.object({
    ...common,
    kind: z.literal("charge_key"),
    payload: z.object({
      ...source,
      code: short,
      base: z
        .string()
        .trim()
        .max(24)
        .regex(/^(?:\d{1,12}(?:[.,]\d{1,6})?)?$/),
      unit: short,
      scope: short,
      validFrom: date,
      validUntil: date,
      status: z.enum(["unverified", "validated", "inactive"]),
      notes: text,
    }),
  }),
]);
export type GovernanceInput = z.infer<typeof governanceInput>;
export type GovernanceItem = {
  id: string;
  kind: GovernanceInput["kind"];
  condominium_id: string;
  dossier_year: number;
  parent_id: string | null;
  title: string;
  audience: "owners" | "council" | "management";
  payload: Record<string, any>;
  version: number;
  created_by: string;
  updated_by: string;
  updated_at: string;
};
export const kindLabels: Record<GovernanceItem["kind"], string> = {
  meeting: sourceText("governance_panel.m0673"),
  requirement: sourceText("metadata.m1346"),
  decision: sourceText("metadata.m1347"),
  action: sourceText("metadata.m1348"),
  offer: sourceText("metadata.m1349"),
  charge_key: sourceText("metadata.m1350"),
};
export const stateLabels: Record<string, string> = {
  proposed: sourceText("metadata.m1351"),
  pending_evidence: sourceText("metadata.m1352"),
  pending_review: sourceText("metadata.m1353"),
  information: sourceText("metadata.m1354"),
  adopted: sourceText("metadata.m1355"),
  rejected: sourceText("metadata.m1356"),
  expected: sourceText("metadata.m1357"),
  received: sourceText("metadata.m1358"),
  not_applicable: sourceText("metadata.m1359"),
  planned: sourceText("accident_followup.m0011"),
  in_progress: sourceText("incident_fields.m0812"),
  waiting: sourceText("incident_fields.m0813"),
  done: sourceText("metadata.m1360"),
  cancelled: sourceText("metadata.m1361"),
  proposal: sourceText("metadata.m1362"),
  withdrawn: sourceText("metadata.m1363"),
  signed: sourceText("metadata.m1364"),
  unverified: sourceText("operations_panel.m0865"),
  validated: sourceText("metadata.m1365"),
  inactive: sourceText("metadata.m1366"),
};
