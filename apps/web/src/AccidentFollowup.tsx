import { msg, labelText } from "./i18n";
import { apiFetch } from "./session";
import { useEffect, useState } from "react";
type Followup = {
  version: number;
  secured: boolean;
  managerInformed: boolean;
  evidenceCollected: boolean;
  insuranceReviewed: boolean;
  insuranceStatus: string;
  insuranceReference: string;
  declaredOn: string;
  nextActionOn: string;
  notes: string;
};
export default function AccidentFollowup({
  context,
  recordId,
}: {
  context: string;
  recordId: string;
}) {
  const [data, setData] = useState<Followup>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/api/condominiums/${context}/records/${recordId}/followup`;
  async function load() {
    const response = await apiFetch(path);
    if (!response.ok)
      throw new Error(((await response.json()) as { error: string }).error);
    setData((await response.json()) as Followup);
  }
  useEffect(() => {
    let active = true;
    apiFetch(path)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(((await response.json()) as { error: string }).error);
        const result = (await response.json()) as Followup;
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        version: data.version,
        secured: values.has("secured"),
        managerInformed: values.has("managerInformed"),
        evidenceCollected: values.has("evidenceCollected"),
        insuranceReviewed: values.has("insuranceReviewed"),
        insuranceStatus: values.get("insuranceStatus"),
        insuranceReference: values.get("insuranceReference"),
        declaredOn: values.get("declaredOn"),
        nextActionOn: values.get("nextActionOn"),
        notes: values.get("notes"),
      };
      const response = await apiFetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(((await response.json()) as { error: string }).error);
      await load();
      setNotice(msg("accident_followup.m0001"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="accident-followup">
      <h3>{msg("accident_followup.m0002")}</h3>
      <p className="scope-note">{msg("accident_followup.m0003")}</p>
      {error && (
        <p role="alert" className="error">
          {labelText(error)}
          <button
            className="text-button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            {msg("accident_followup.m0004")}
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {labelText(notice)}
        </p>
      )}
      {data && (
        <form key={data.version} onSubmit={save}>
          <fieldset disabled={busy}>
            {(
              [
                ["secured", msg("accident_followup.m0005")],
                ["managerInformed", msg("accident_followup.m0006")],
                ["evidenceCollected", msg("accident_followup.m0007")],
                ["insuranceReviewed", msg("accident_followup.m0008")],
              ] as const
            ).map(([key, label]) => (
              <label className="check-row" key={key}>
                <input type="checkbox" name={key} defaultChecked={data[key]} />
                {labelText(label)}
              </label>
            ))}
            <label>
              {msg("accident_followup.m0009")}
              <select
                name="insuranceStatus"
                defaultValue={data.insuranceStatus}
              >
                {[
                  "À évaluer",
                  "À préparer",
                  "Déclaré",
                  "Sans déclaration",
                  "Clos",
                ].map((v) => (
                  <option key={v} value={v}>
                    {labelText(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {msg("accident_followup.m0015")}
              <input
                name="insuranceReference"
                maxLength={200}
                defaultValue={data.insuranceReference}
              />
            </label>
            <div className="form-grid">
              <label>
                {msg("accident_followup.m0016")}
                <input
                  type="date"
                  name="declaredOn"
                  defaultValue={data.declaredOn}
                />
              </label>
              <label>
                {msg("accident_followup.m0017")}
                <input
                  type="date"
                  name="nextActionOn"
                  defaultValue={data.nextActionOn}
                />
              </label>
            </div>
            <label>
              {msg("accident_followup.m0018")}
              <textarea
                name="notes"
                maxLength={3000}
                defaultValue={data.notes}
              />
              <small>{msg("accident_followup.m0019")}</small>
            </label>
            <button className="primary" disabled={busy}>
              {msg("accident_followup.m0020")}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
