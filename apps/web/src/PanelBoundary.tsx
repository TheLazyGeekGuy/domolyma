import { Component, type ReactNode } from "react";
import { msg } from "./i18n";
/** A failed deferred panel leaves navigation available. */
export default class PanelBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="error">
        <p>{msg("loading.failed")}</p>
        <button className="secondary" onClick={() => location.reload()}>
          {msg("loading.reload")}
        </button>
      </section>
    );
  }
}
