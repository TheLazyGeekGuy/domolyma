import { msg, labelText } from "./i18n";
import { appUrl } from "./urls";
import { apiFetch } from "./session";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
type Profile = {
  name: string;
  address: string;
  residence_kind: string;
  description: string;
  profile_version: number;
  photoUrl: string;
  illustration: boolean;
};
export default function ResidenceProfile({
  context,
  name,
  manager,
  onChange,
}: {
  context: string;
  name: string;
  manager: boolean;
  onChange: (profile: Profile) => void;
}) {
  const [layout, setLayout] = useState(
    () => localStorage.getItem("domolyma-residence-layout") || "portrait_round",
  );
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const base = `/api/condominiums/${context}/residence`;
  async function load() {
    const response = await apiFetch(base);
    if (!response.ok) throw new Error(msg("residence_profile.m1086"));
    const next = (await response.json()) as Profile;
    setProfile(next);
    return next;
  }
  useEffect(() => {
    let active = true;
    setProfile(undefined);
    setError("");
    dialog.current?.close();
    if (context)
      apiFetch(base)
        .then(async (response) => {
          if (!response.ok) throw new Error(msg("residence_profile.m1086"));
          const next = (await response.json()) as Profile;
          if (active) setProfile(next);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [base, context]);
  async function save(event: React.FormEvent<HTMLFormElement>, photo: boolean) {
    event.preventDefault();
    if (!profile) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    try {
      values.set("version", String(profile.profile_version));
      const response = await apiFetch(
        base + (photo ? "/photo" : ""),
        photo
          ? { method: "POST", body: values }
          : {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: values.get("name"),
                address: values.get("address"),
                residenceKind: values.get("residenceKind"),
                description: values.get("description"),
                version: profile.profile_version,
              }),
            },
      );
      if (!response.ok)
        throw new Error(((await response.json()) as { error: string }).error);
      onChange(await load());
      if (photo) form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={`residence-profile residence-${layout}`}
        onClick={() => dialog.current?.showModal()}
        aria-label={msg("residence_profile.m1088", {
          p1: profile?.name || name,
        })}
      >
        <img
          src={appUrl(
            profile?.photoUrl || "/images/residence-illustration.png",
          )}
          alt=""
        />
        <span>
          <strong>{profile?.name || name || msg("app.m0096")}</strong>
          <small>{msg("residence_profile.m1089")}</small>
        </span>
        <ChevronRight size={16} />
      </button>
      <dialog ref={dialog} className="residence-dialog">
        <div className="dialog-heading">
          <h2>{msg("residence_profile.m1090")}</h2>
          <button
            className="icon-button"
            aria-label={msg("residence_profile.m1091")}
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {labelText(error)}{" "}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => load().catch((e) => setError(e.message))}
            >
              {msg("budget_panel.m0273")}
            </button>
          </p>
        )}
        <fieldset className="profile-layout">
          <legend>{msg("residence_profile.m1092")}</legend>
          {[
            ["compact", msg("residence_profile.m1093")],
            ["portrait_round", msg("residence_profile.m1094")],
            ["portrait_square", msg("residence_profile.m1095")],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="profile-layout"
                value={value}
                checked={layout === value}
                onChange={() => {
                  setLayout(value);
                  localStorage.setItem("domolyma-residence-layout", value);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {profile && (
          <>
            <img
              className="residence-cover"
              src={appUrl(profile.photoUrl)}
              alt={
                profile.illustration
                  ? msg("residence_profile.m1096")
                  : msg("residence_profile.m1097", { p1: profile.name })
              }
            />
            {profile.illustration && (
              <small className="table-note">
                {msg("residence_profile.m1098")}
              </small>
            )}
            <form
              key={profile.profile_version}
              className="editor-form"
              onSubmit={(event) => save(event, false)}
            >
              <label>
                {msg("residence_profile.m1099")}
                <input
                  name="name"
                  defaultValue={profile.name}
                  maxLength={150}
                  required
                  disabled={!manager || busy}
                />
              </label>
              <label>
                {msg("residence_profile.m1100")}
                <input
                  name="address"
                  defaultValue={profile.address}
                  maxLength={500}
                  required
                  disabled={!manager || busy}
                />
              </label>
              <label>
                {msg("residence_profile.m1101")}
                <select
                  name="residenceKind"
                  defaultValue={profile.residence_kind}
                  disabled={!manager || busy}
                >
                  <option value="collective">
                    {msg("residence_profile.m1102")}
                  </option>
                  <option value="houses">
                    {msg("residence_profile.m1103")}
                  </option>
                  <option value="mixed">
                    {msg("residence_profile.m1104")}
                  </option>
                </select>
              </label>
              <label>
                {msg("residence_profile.m1105")}
                <textarea
                  name="description"
                  defaultValue={profile.description}
                  maxLength={3000}
                  disabled={!manager || busy}
                />
              </label>
              {manager && (
                <button className="primary" disabled={busy}>
                  {msg("residence_profile.m1106")}
                </button>
              )}
            </form>
            {manager && (
              <form
                className="editor-form photo-form"
                onSubmit={(event) => save(event, true)}
              >
                <label>
                  {msg("residence_profile.m1108")}
                  <input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg"
                    required
                    disabled={busy}
                  />
                </label>
                <small>{msg("residence_profile.m1109")}</small>
                <button className="secondary" disabled={busy}>
                  {msg("residence_profile.m1110")}
                </button>
              </form>
            )}
          </>
        )}
        <p className="scope-note">{msg("residence_profile.m1111")}</p>
      </dialog>
    </>
  );
}
