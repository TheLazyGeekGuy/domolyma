import { sourceText } from "../i18n/source";
import { z } from "zod";
const short = z.string().trim().min(1).max(200),
  date = z.iso.date(),
  optionalDate = z.union([z.literal(""), date]);
const cents = z.number().int().min(0).max(100000000);
export const rentalContact = z.object({
  name: short,
  email: z.union([z.literal(""), z.email()]),
  phone: z.string().max(50),
  notes: z.string().max(3000),
});
export const rentalSchema = z
  .object({
    lotId: z.string().min(1).max(100),
    kind: z.enum(["lease", "booking"]),
    title: short,
    status: z.enum([
      "draft",
      "active",
      "ended",
      "cancelled",
      "confirmed",
      "completed",
    ]),
    startsOn: date,
    endsOn: optionalDate,
    payload: z.object({
      contactIds: z.array(z.string().min(1).max(100)).min(1).max(10),
      rentalType: z.enum([
        "unfurnished",
        "furnished",
        "parking",
        "commercial",
        "seasonal",
      ]),
      channel: z.enum(["Direct", "Airbnb", "Booking.com", "Autre"]),
      reference: z.string().max(200),
      rentCents: cents,
      chargesCents: cents,
      depositCents: cents,
      actualStart: optionalDate,
      actualEnd: optionalDate,
      notes: z.string().max(5000),
    }),
  })
  .superRefine((v, c) => {
    if (v.endsOn && v.endsOn <= v.startsOn)
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1381"),
        path: ["endsOn"],
      });
    if (v.kind === "booking" && !v.endsOn)
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1382"),
        path: ["endsOn"],
      });
    if (
      (v.kind === "booking" &&
        !["draft", "confirmed", "completed", "cancelled"].includes(v.status)) ||
      (v.kind === "lease" &&
        !["draft", "active", "ended", "cancelled"].includes(v.status))
    )
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1383"),
        path: ["status"],
      });
    if (
      v.payload.actualEnd &&
      (!v.payload.actualStart || v.payload.actualEnd <= v.payload.actualStart)
    )
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1384"),
        path: ["payload", "actualEnd"],
      });
    if (v.status === "ended" && !v.endsOn)
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1385"),
        path: ["endsOn"],
      });
    if (new Set(v.payload.contactIds).size !== v.payload.contactIds.length)
      c.addIssue({
        code: "custom",
        message: sourceText("metadata.m1386"),
        path: ["payload", "contactIds"],
      });
  });
export type Rental = {
  id: string;
  lot_id: string;
  landlord_id: string;
  kind: "lease" | "booking";
  title: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
  version: number;
  payload: z.infer<typeof rentalSchema>["payload"];
};
export type RentalContact = z.infer<typeof rentalContact> & {
  id: string;
  version: number;
};
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
