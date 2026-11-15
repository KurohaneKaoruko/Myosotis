import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard: a render error in any view shows a recovery
 * screen (with the error message + reload/clear actions) instead of a
 * blank white page. Blueprint-styled to match the app.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[myosotis] render crash:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <div className="crash-tag">ERR // RENDER_CRASH</div>
          <h1>{t("crashTitle")}</h1>
          <p className="crash-msg">{this.state.error.message}</p>
          <div className="crash-ops">
            <button className="btn primary" onClick={() => location.reload()}>
              {t("crashReload")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
