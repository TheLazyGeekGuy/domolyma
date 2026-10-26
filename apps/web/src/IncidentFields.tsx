import { msg, labelText } from "./i18n";
import { useEffect, useState } from "react";
import {
  incidentNatures,
  incidentDomains,
  incidentSymptoms,
  injuryLevels,
} from "../../../packages/contracts/incidents";
import { interventionCategories } from "../../../packages/contracts/rentals";
import type { RecordRow } from "../../../packages/contracts";
import type { Operation } from "../../../packages/contracts/operations";
export type IncidentPreset = {
  source: RecordRow;
  nature: "Incident" | "Accident corporel";
};
export default function IncidentFields({
  selected,
  operations,
  records,
  manager,
  preset,
  onRestricted,
  initialDraft = {},
}: {
  selected: RecordRow | null;
  operations: Operation[];
  records: RecordRow[];
  manager: boolean;
  preset: IncidentPreset | null;
  onRestricted: (value: boolean) => void;
  initialDraft?: Record<string, string>;
}) {
  const p = { ...selected?.payload, ...initialDraft };
  const [nature, setNature] = useState(
    p.eventNature || preset?.nature || (selected ? "" : incidentNatures[0]),
  );
  const [domain, setDomain] = useState(
    p.domain || preset?.source.payload.domain || incidentDomains[0],
  );
  const [mode, setMode] = useState(
    p.equipmentMode || (selected?.equipment_id ? "catalogue" : "none"),
  );
  const [symptom, setSymptom] = useState(p.symptom || incidentSymptoms[1]);
  const equipment = operations.filter((o) => o.kind === "equipment");
  function path(id: string, seen = new Set<string>()): string {
    const item = equipment.find((o) => o.id === id);
    if (!item || seen.has(id)) return "";
    seen.add(id);
    const parent = item.payload.parentId;
    return (parent ? path(parent, seen) + " › " : "") + item.title;
  }
  const localTime =
    initialDraft.occurredAt ||
    (p.occurredAt
      ? new Date(
          new Date(p.occurredAt).getTime() -
            new Date(p.occurredAt).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "");
  const confidential =
    nature === "Accident corporel" ||
    domain === "Sécurité" ||
    p.confidentialReport;
  useEffect(() => onRestricted(!!confidential), [confidential, onRestricted]);
  return (
    <>
      <div className="form-grid">
        <label>
          {msg("incident_fields.m0779")}
          <select
            name="eventNature"
            value={nature}
            onChange={(e) => setNature(e.target.value)}
            disabled={!!selected?.payload.eventNature}
          >
            {selected && !p.eventNature && (
              <option value="">{msg("incident_fields.m0780")}</option>
            )}
            {incidentNatures.map((v) => (
              <option key={v} value={v}>
                {labelText(v)}
              </option>
            ))}
          </select>
          {selected?.payload.eventNature && (
            <input type="hidden" name="eventNature" value={nature} />
          )}
        </label>
        <label>
          {msg("incident_fields.m0781")}
          <select
            disabled={!nature}
            name="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            {incidentDomains.map((v) => (
              <option key={v} value={v}>
                {labelText(v)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {nature && (
        <>
          <div className="form-grid">
            <label>
              {msg("incident_fields.m0782")}
              <input
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={localTime}
              />
              <small>
                {msg("incident_fields.m0783")}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}).
              </small>
            </label>
            <label>
              {msg("incident_fields.m0784")}
              <input
                name="location"
                maxLength={300}
                required
                defaultValue={
                  p.location || preset?.source.payload.location || ""
                }
                placeholder={msg("incident_fields.m0785")}
              />
            </label>
          </div>
          <label>
            {msg("incident_fields.m0786")}
            <select
              name="equipmentMode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="none">{msg("incident_fields.m0787")}</option>
              <option value="catalogue">{msg("incident_fields.m0788")}</option>
              <option value="other">{msg("incident_fields.m0789")}</option>
            </select>
          </label>
          {mode === "catalogue" && (
            <label>
              {msg("incident_fields.m0790")}
              <select
                name="equipmentId"
                required
                defaultValue={selected?.equipment_id || ""}
              >
                <option value="">{msg("incident_fields.m0791")}</option>
                {equipment.map((o) => (
                  <option key={o.id} value={o.id}>
                    {path(o.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "other" && (
            <label>
              {msg("incident_fields.m0792")}
              <input
                name="equipmentDescription"
                required
                maxLength={300}
                defaultValue={p.equipmentDescription || ""}
                placeholder={msg("incident_fields.m0793")}
              />
            </label>
          )}
          <label>
            {msg("incident_fields.m0794")}
            <select
              name="symptom"
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
            >
              {incidentSymptoms.map((v) => (
                <option key={v} value={v}>
                  {labelText(v)}
                </option>
              ))}
            </select>
          </label>
          {symptom === "Autre" && (
            <label>
              {msg("incident_fields.m0795")}
              <input
                name="symptomOther"
                maxLength={300}
                required
                defaultValue={p.symptomOther || ""}
              />
            </label>
          )}
          <label>
            {msg("incident_fields.m0796")}
            <select name="category" defaultValue={p.category || "Autre"}>
              {interventionCategories.map((v) => (
                <option key={v} value={v}>
                  {labelText(v)}
                </option>
              ))}
            </select>
          </label>
          {nature === "Accident corporel" && (
            <label>
              {msg("incident_fields.m0797")}
              <select
                name="injuryLevel"
                defaultValue={p.injuryLevel || "Non renseignée"}
              >
                {injuryLevels.map((v) => (
                  <option key={v} value={v}>
                    {labelText(v)}
                  </option>
                ))}
              </select>
              <small>{msg("incident_fields.m0798")}</small>
            </label>
          )}
          <label>
            {nature === "Accident corporel"
              ? msg("incident_fields.m0799")
              : msg("incident_fields.m0800")}
            <select
              name="relatedIncidentId"
              defaultValue={p.relatedIncidentId || preset?.source.id || ""}
              disabled={!!selected}
            >
              <option value="">{msg("incident_fields.m0801")}</option>
              {p.relatedIncidentId &&
                !records.some((r) => r.id === p.relatedIncidentId) && (
                  <option value={p.relatedIncidentId}>
                    {msg("incident_fields.m0802")}
                  </option>
                )}
              {records
                .filter(
                  (r) =>
                    r.kind === "incident" &&
                    r.id !== selected?.id &&
                    (nature !== "Accident corporel" ||
                      r.payload.eventNature !== "Accident corporel"),
                )
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>
            {selected && (
              <input
                type="hidden"
                name="relatedIncidentId"
                value={p.relatedIncidentId || ""}
              />
            )}
            <small>{msg("incident_fields.m0803")}</small>
          </label>
        </>
      )}
      <label>
        {msg("incident_fields.m0804")}
        <textarea
          name="description"
          required
          maxLength={5000}
          defaultValue={p.description || ""}
        />
        <small>{msg("incident_fields.m0805")}</small>
      </label>
      {confidential && (
        <p className="scope-note">{msg("incident_fields.m0806")}</p>
      )}
      <div className="form-grid">
        <label>
          {msg("incident_fields.m0807")}
          <select name="priority" defaultValue={p.priority || "Normale"}>
            <option value={"Normale"}>{msg("incident_fields.m0808")}</option>
            <option value={"Urgente"}>{msg("incident_fields.m0809")}</option>
          </select>
        </label>
        <label>
          {msg("app.m0204")}
          <input type="date" name="dueDate" defaultValue={p.dueDate || ""} />
        </label>
      </div>
      {manager && (
        <>
          <div className="form-grid">
            <label>
              {msg("app.m0159")}
              <select name="status" defaultValue={p.status || "Signalé"}>
                {[
                  "Signalé",
                  "Qualifié",
                  "Affecté",
                  "En cours",
                  "En attente",
                  "Résolu",
                  "Clôturé",
                  "Réouvert",
                ].map((v) => (
                  <option key={v} value={v}>
                    {labelText(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {msg("incident_fields.m0815")}
              <input
                name="assignee"
                maxLength={200}
                defaultValue={p.assignee || ""}
              />
            </label>
          </div>
          <label>
            {msg("incident_fields.m0816")}
            <textarea
              name="comment"
              maxLength={2000}
              defaultValue={p.comment || ""}
            />
            <small>{msg("incident_fields.m0817")}</small>
          </label>
        </>
      )}
    </>
  );
}
