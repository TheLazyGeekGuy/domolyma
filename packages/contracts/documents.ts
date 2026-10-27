import { sourceText } from "../i18n/source";
import { z } from "zod";
export const documentCategories = [
  ["assembly", sourceText("metadata.m1337"), "#494381"],
  ["contract", sourceText("metadata.m1338"), "#34316c"],
  ["finance", sourceText("metadata.m1339"), "#168783"],
  ["diagnostic", sourceText("metadata.m1340"), "#86549d"],
  ["regulation", sourceText("metadata.m1341"), "#a16a13"],
  ["insurance", sourceText("metadata.m1342"), "#3d80a5"],
  ["correspondence", sourceText("metadata.m1343"), "#a94157"],
  ["maintenance", sourceText("metadata.m1344"), "#578232"],
  ["preparation", sourceText("metadata.m1345"), "#69737e"],
  ["other", sourceText("common.other"), "#8a9bad"],
] as const;
export type Category = (typeof documentCategories)[number][0];
const date = z.union([z.literal(""), z.iso.date()]);
export const documentLink = z.object({
  type: z.enum(["lot", "operation", "governance", "record"]),
  id: z.string().min(1).max(100),
});
export type DocumentLink = z.infer<typeof documentLink>;
export const documentMetadata = z.object({
  category: z.enum(
    documentCategories.map((x) => x[0]) as [Category, ...Category[]],
  ),
  issuer: z.string().trim().max(200),
  date,
  receivedOn: date,
  validUntil: date,
  notes: z.string().trim().max(5000),
  links: z.array(documentLink).max(20),
  trashed: z.boolean().default(false),
});
export const updateDocument = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  metadata: documentMetadata,
});
export type DocumentMetadata = z.infer<typeof documentMetadata>;
export type VaultVersion = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
};
export type VaultTarget = DocumentLink & { label: string };
export type VaultDocument = {
  id: string;
  title: string;
  fiscalYear: number;
  version: number;
  audience: string;
  accessScope: string;
  lotId: string | null;
  opsId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: DocumentMetadata;
  categorySuggested: boolean;
  allowedTargetKeys: string[];
  versions: VaultVersion[];
  links: VaultTarget[];
};
export function suggestCategory(title: string, filename = ""): Category {
  const t = (title + " " + filename)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (
    /preparation|transcription|markdown|ocr|analyse|dimensionnement|note claude/.test(
      t,
    )
  )
    return "preparation";
  if (/contrat|devis|convention|avenant/.test(t)) return "contract";
  if (/repart|charges|comptes|budget|facture|appel.*fonds/.test(t))
    return "finance";
  if (/diagnostic|dpe|pppt|audit.*energet/.test(t)) return "diagnostic";
  if (/reglement|fiche.*synthet|etat.*descript/.test(t)) return "regulation";
  if (/assurance|multirisque|police/.test(t)) return "insurance";
  if (/convocation|proces.verbal|\bpv\b|assemblee|\bag\b|vpc|pouvoir/.test(t))
    return "assembly";
  if (/courrier|receipt|reception|notification|letreco|consentement/.test(t))
    return "correspondence";
  if (/visite|entretien|intervention|maintenance/.test(t)) return "maintenance";
  return "other";
}
export function initialMetadata(
  title: string,
  filename = "",
): DocumentMetadata {
  return {
    category: suggestCategory(title, filename),
    issuer: "",
    date: "",
    receivedOn: "",
    validUntil: "",
    notes: "",
    links: [],
    trashed: false,
  };
}
export function fileKind(
  version: Pick<VaultVersion, "mime" | "filename">,
): "pdf" | "image" | "office" | "other" {
  if (version.mime === "application/pdf" || /\.pdf$/i.test(version.filename))
    return "pdf";
  if (version.mime.startsWith("image/")) return "image";
  if (/\.(docx?|xlsx?|pptx?|od[tps])$/i.test(version.filename)) return "office";
  return "other";
}
export { searchText } from "../domain/ui-values";
export function documentValidity(value: string, today: string) {
  if (!value) return "none";
  if (value < today) return "expired";
  return Date.parse(value + "T12:00:00Z") - Date.parse(today + "T12:00:00Z") <=
    60 * 86400000
    ? "soon"
    : "valid";
}
