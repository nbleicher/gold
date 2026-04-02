import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
export class AppErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error("App render error:", error, info.componentStack);
    }
    render() {
        if (this.state.error) {
            return (_jsxs("div", { className: "app-loading", style: { flexDirection: "column", gap: "1rem", padding: "2rem", textAlign: "center" }, children: [_jsx("p", { style: { maxWidth: "28rem", lineHeight: 1.5 }, children: "Something went wrong. Try refreshing the page." }), _jsx("button", { type: "button", className: "btn btn-gold", onClick: () => {
                            this.setState({ error: null });
                            window.location.reload();
                        }, children: "Reload" })] }));
        }
        return this.props.children;
    }
}
