import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "../state/auth";
export function LoginPage() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const onSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            await signIn(email, password);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to login");
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "shimmer-bar", "aria-hidden": true }), _jsxs("div", { className: "login-screen", children: [_jsx("div", { className: "login-bg", "aria-hidden": true }), _jsxs("form", { className: "login-box", onSubmit: onSubmit, children: [_jsx("div", { className: "login-logo", children: "\u2B21 GoldStream" }), _jsx("div", { className: "login-tagline", children: "Live Gold \u00B7 Direct Sales Platform" }), _jsxs("div", { className: "login-field", children: [_jsx("label", { className: "login-label", htmlFor: "login-email", children: "Email" }), _jsx("input", { id: "login-email", className: "login-input", value: email, onChange: (e) => setEmail(e.target.value), type: "email", autoComplete: "username", placeholder: "you@example.com", required: true })] }), _jsxs("div", { className: "login-field", children: [_jsx("label", { className: "login-label", htmlFor: "login-password", children: "Password" }), _jsx("input", { id: "login-password", className: "login-input", value: password, onChange: (e) => setPassword(e.target.value), type: "password", autoComplete: "current-password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", required: true })] }), _jsx("button", { type: "submit", className: "login-btn", children: "Sign in" }), _jsx("div", { className: "login-err", role: error ? "alert" : undefined, children: error })] })] })] }));
}
