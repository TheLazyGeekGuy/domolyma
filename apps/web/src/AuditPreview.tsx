import { msg, useLocale, LanguageSelector } from "./i18n";
import { useTheme } from "./theme";
import BrandLogo from "./BrandLogo";
import LoadingState from "./LoadingState";
import "./style.css";
import "./accessibility.css";
export default function AuditPreview() {
  useLocale();
  const [theme, setTheme] = useTheme();
  return (
    <main className="audit-preview" tabIndex={-1}>
      <div className="audit-preview-header">
        <BrandLogo />
        <LanguageSelector />
      </div>
      <p className="eyebrow">{msg("audit.preview")}</p>
      <h1>{msg("audit.title")}</h1>
      <p>{msg("audit.explanation")}</p>
      <label>
        {msg("app.m0101")}{" "}
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="system">{msg("theme.system")}</option>
          <option value="clay-sand">{msg("audit.light")}</option>
          <option value="obsidian-copper">{msg("audit.dark")}</option>
        </select>
      </label>
      <div className="audit-preview-columns">
        <section>
          <h2>{msg("rentals_panel.m1060")}</h2>
          <form>
            <label>
              {msg("rentals_panel.m1063")}
              <input readOnly value={msg("audit.example")} />
            </label>
            <label>
              {msg("rentals_panel.m1085")}
              <textarea readOnly value={msg("audit.note")} />
            </label>
            <aside className="draft-warning">
              <strong>{msg("use-form-draft.m1176")}</strong>
              <p>{msg("use-form-draft.m1177")}</p>
            </aside>
          </form>
        </section>
        <section>
          <h2>{msg("audit.loading")}</h2>
          <LoadingState />
        </section>
      </div>
      <a className="primary button" href={location.pathname}>
        {msg("audit.open_demo")}
      </a>
    </main>
  );
}
