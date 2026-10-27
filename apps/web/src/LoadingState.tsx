import { msg } from "./i18n";
export default function LoadingState({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={`loading-state ${compact ? "compact" : ""}`}
      role="status"
      aria-busy="true"
    >
      <span className="visually-hidden">{msg("common.loading")}</span>
      <div className="loading-shapes" aria-hidden="true">
        <div className="skeleton skeleton-heading" />
        {Array.from({ length: compact ? 3 : 5 }, (_, i) => (
          <div key={i} className="skeleton-row">
            <div className="skeleton skeleton-icon" />
            <div>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
