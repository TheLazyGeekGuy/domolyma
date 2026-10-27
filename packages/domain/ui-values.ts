import { sourceText } from "../i18n/source";
// Shared display values do not load server-side validation schemas.
export const roleLabels: Record<string, string> = {
  manager: sourceText("app.m0176"),
  owner: sourceText("app.m0177"),
  tenant: sourceText("operations_panel.m0911"),
  supplier: sourceText("metadata.m1375"),
  council: sourceText("app.m0217"),
  resident: sourceText("operations_panel.m0909"),
};
export const incidentNatures = [
  "Incident",
  "Presque-accident",
  "Accident corporel",
] as const;
export const incidentDomains = [
  "Équipement",
  "Sécurité",
  "Espaces et circulation",
  "Autre",
] as const;
export const incidentSymptoms = [
  "Ampoule grillée",
  "Panne",
  "Fuite",
  "Casse / dégradation",
  "Intrusion",
  "Obstacle / trou",
  "Chute",
  "Autre",
] as const;
export const injuryLevels = [
  "Non renseignée",
  "Blessure signalée",
  "Secours sollicités",
  "Hospitalisation signalée",
  "Décès signalé",
] as const;
export const interventionCategories = [
  "Chauffage",
  "Plomberie",
  "Électricité",
  "Climatisation",
  "Ascenseur",
  "Accès et serrurerie",
  "Réparation",
  "Nettoyage",
  "Espaces verts",
  "Autre",
] as const;
export const searchText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
