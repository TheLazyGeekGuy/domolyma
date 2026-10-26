import { sourceText } from "../../packages/i18n/source";
import { rentalContact, rentalSchema } from "../../packages/contracts/rentals";
import { occupancyDays, businessDate } from "../../packages/domain/occupancy";
import { fail, json, type AccessContext } from "./access";
import { z } from "zod";
export async function handleRentals(
  request: Request,
  a: AccessContext,
  path: string,
  year: number,
): Promise<Response | undefined> {
  if (!path.startsWith("rentals")) return;
  const { db, condoId, userId } = a;
  // Un mandat de syndic ne confère aucun accès au dossier privé d'un bailleur.
  const rows = (
    await db
      .prepare(
        "SELECT * FROM rentals WHERE condominium_id=? AND landlord_id=? ORDER BY starts_on DESC,id",
      )
      .bind(condoId, userId)
      .all<any>()
  ).results.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const lots = a.lots.filter((l) => a.own(l.id));
  const contacts = (
    await db
      .prepare(
        "SELECT * FROM rental_contacts WHERE condominium_id=? AND landlord_id=? ORDER BY name",
      )
      .bind(condoId, userId)
      .all<any>()
  ).results;
  const authorizedLots = new Set(lots.map((l) => l.id));
  const visible = rows.filter((r) => authorizedLots.has(r.lot_id));
  if (path === "rentals" && request.method === "GET") {
    const today = businessDate(),
      tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10),
      yearEnd = `${year + 1}-01-01`;
    const occupation = lots.map((l) => {
      const entries = visible.filter(
        (r) => r.lot_id === l.id && !["draft", "cancelled"].includes(r.status),
      );
      return {
        lotId: l.id,
        planned: occupancyDays(
          entries.map((r) => ({
            start: r.starts_on,
            end: r.ends_on || yearEnd,
          })),
          year,
        ),
        actual: occupancyDays(
          entries
            .filter((r) => r.payload.actualStart)
            .map((r) => ({
              start: r.payload.actualStart,
              end: r.payload.actualEnd
                ? r.payload.actualEnd < tomorrow
                  ? r.payload.actualEnd
                  : tomorrow
                : tomorrow,
            })),
          year,
        ),
      };
    });
    return json({
      lots: lots.map(a.safeLot),
      contacts,
      entries: visible,
      occupation,
      year,
    });
  }
  if (path === "rentals/contacts" && request.method === "POST") {
    if (!lots.length) fail(403, sourceText("metadata.m1321"));
    const v = rentalContact.parse(await request.json()),
      id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO rental_contacts(id,landlord_id,condominium_id,name,email,phone,notes) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(id, userId, condoId, v.name, v.email, v.phone, v.notes)
      .run();
    return json({ id }, 201);
  }
  const match = path.match(/^rentals\/entries(?:\/([^/]+))?$/);
  if (match && ["POST", "PATCH"].includes(request.method)) {
    if ((request.method === "POST") === Boolean(match[1]))
      fail(405, sourceText("metadata.m1300"));
    const old = match[1] ? visible.find((r) => r.id === match[1]) : undefined;
    if (match[1] && !old) fail(404, sourceText("metadata.m1322"));
    const body = (await request.json()) as any,
      v = rentalSchema.parse(body);
    if (!authorizedLots.has(v.lotId)) fail(403, sourceText("metadata.m1323"));
    if (v.payload.contactIds.some((id) => !contacts.some((c) => c.id === id)))
      fail(400, sourceText("metadata.m1324"));
    if (old && (v.kind !== old.kind || v.lotId !== old.lot_id))
      fail(400, sourceText("metadata.m1325"));
    const id = old?.id || crypto.randomUUID(),
      now = new Date().toISOString();
    try {
      if (old) {
        const result = await db
          .prepare(
            "UPDATE rentals SET title=?,status=?,starts_on=?,ends_on=?,payload=?,version=version+1,updated_at=? WHERE id=? AND landlord_id=? AND version=?",
          )
          .bind(
            v.title,
            v.status,
            v.startsOn,
            v.endsOn || null,
            JSON.stringify(v.payload),
            now,
            id,
            userId,
            z.number().int().positive().parse(body.version),
          )
          .run();
        if (!result.meta.changes) fail(409, sourceText("metadata.m1326"));
      } else
        await db
          .prepare(
            "INSERT INTO rentals(id,condominium_id,lot_id,landlord_id,kind,title,status,starts_on,ends_on,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            condoId,
            v.lotId,
            userId,
            v.kind,
            v.title,
            v.status,
            v.startsOn,
            v.endsOn || null,
            JSON.stringify(v.payload),
            now,
            now,
          )
          .run();
    } catch (e) {
      if (e instanceof Error && e.message.includes("RENTAL_OVERLAP"))
        fail(409, sourceText("metadata.m1327"));
      throw e;
    }
    return json({ id }, old ? 200 : 201);
  }
  fail(404, sourceText("metadata.m1328"));
}
