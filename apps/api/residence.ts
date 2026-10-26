import { sourceText } from "../../packages/i18n/source";
import { z } from "zod";
import { fail, json, type AccessContext } from "./access";
const profile = z.object({
  name: z.string().trim().min(1).max(150),
  address: z.string().trim().min(1).max(500),
  residenceKind: z.enum(["collective", "houses", "mixed"]),
  description: z.string().trim().max(3000),
  version: z.number().int().positive(),
});
type Residence = {
  id: string;
  name: string;
  address: string;
  residence_kind: string;
  description: string;
  profile_version: number;
  photo_id: string | null;
};
export async function handleResidence(
  request: Request,
  a: AccessContext,
  files: R2Bucket,
  path: string,
) {
  if (path !== "residence" && path !== "residence/photo") return null;
  const row = await a.db
    .prepare(
      "SELECT id,name,address,residence_kind,description,profile_version,photo_id FROM condominiums WHERE id=?",
    )
    .bind(a.condoId)
    .first<Residence>();
  if (!row) fail(404, sourceText("metadata.m1329"));
  if (request.method === "GET") {
    if (path === "residence")
      return json({
        ...row,
        photoUrl: row.photo_id
          ? `/api/condominiums/${a.condoId}/residence/photo?v=${row.profile_version}`
          : "/images/residence-illustration.png",
        illustration: !row.photo_id,
      });
    const photo = await a.db
      .prepare(
        "SELECT object_key,mime FROM residence_photos WHERE id=? AND condominium_id=?",
      )
      .bind(row.photo_id, a.condoId)
      .first<{ object_key: string; mime: string }>();
    if (!photo) fail(404, sourceText("metadata.m1330"));
    const object = await files.get(photo.object_key);
    if (!object) fail(404, sourceText("metadata.m1331"));
    return new Response(object.body, {
      headers: {
        "Content-Type": photo.mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!a.manager) fail(403, sourceText("metadata.m1332"));
  const now = new Date().toISOString();
  if (path === "residence" && request.method === "PUT") {
    const v = profile.parse(await request.json());
    const result = await a.db
      .prepare(
        "UPDATE condominiums SET name=?,address=?,residence_kind=?,description=?,profile_version=profile_version+1,updated_by=?,updated_at=? WHERE id=? AND profile_version=?",
      )
      .bind(
        v.name,
        v.address,
        v.residenceKind,
        v.description,
        a.userId,
        now,
        a.condoId,
        v.version,
      )
      .run();
    if (!result.meta.changes) fail(409, sourceText("metadata.m1333"));
    return json({ saved: true });
  }
  if (path === "residence/photo" && request.method === "POST") {
    const form = await request.formData();
    const version = z.coerce
      .number()
      .int()
      .positive()
      .parse(form.get("version"));
    if (version !== row.profile_version)
      fail(409, sourceText("metadata.m1333"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
      fail(400, sourceText("metadata.m1334"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png =
      file.type === "image/png" &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    const jpg =
      file.type === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217;
    if (!png && !jpg) fail(400, sourceText("metadata.m1335"));
    const id = crypto.randomUUID(),
      key = `residences/${a.condoId}/${id}`;
    const sha = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await files.put(key, bytes, { httpMetadata: { contentType: file.type } });
    const results = await a.db.batch([
      a.db
        .prepare(
          "INSERT INTO residence_photos(id,condominium_id,object_key,mime,sha256,created_at,author_id) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(id, a.condoId, key, file.type, sha, now, a.userId),
      a.db
        .prepare(
          "UPDATE condominiums SET photo_id=?,profile_version=profile_version+1,updated_by=?,updated_at=? WHERE id=? AND profile_version=?",
        )
        .bind(id, a.userId, now, a.condoId, version),
    ]);
    if (!results[1].meta.changes) {
      await a.db
        .prepare("DELETE FROM residence_photos WHERE id=?")
        .bind(id)
        .run();
      await files.delete(key);
      fail(409, sourceText("metadata.m1336"));
    }
    return json({ saved: true }, 201);
  }
  fail(404, sourceText("metadata.m1207"));
}
