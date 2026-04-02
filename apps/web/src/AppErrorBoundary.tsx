import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-loading" style={{ flexDirection: "column", gap: "1rem", padding: "2rem", textAlign: "center" }}>
          <p style={{ maxWidth: "28rem", lineHeight: 1.5 }}>Something went wrong. Try refreshing the page.</p>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
