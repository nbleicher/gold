import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsxs("form", { className: "card login", onSubmit: onSubmit, children: [_jsx("h1", { children: "Gold Platform" }), _jsxs("label", { children: ["Email", _jsx("input", { value: email, onChange: (e) => setEmail(e.target.value), type: "email", required: true })] }), _jsxs("label", { children: ["Password", _jsx("input", { value: password, onChange: (e) => setPassword(e.target.value), type: "password", required: true })] }), error ? _jsx("p", { className: "error", children: error }) : null, _jsx("button", { type: "submit", children: "Sign in" })] }));
}
