import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getAuthToken, setAuthToken } from "../lib/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            setLoading(false);
            return;
        }
        api("/v1/auth/me")
            .then((p) => {
            setProfile(p);
        })
            .catch(() => {
            setAuthToken(null);
            setProfile(null);
        })
            .finally(() => {
            setLoading(false);
        });
    }, []);
    const value = useMemo(() => ({
        user: profile,
        profile,
        loading,
        signIn: async (email, password) => {
            const res = await api("/v1/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });
            setAuthToken(res.token);
            setProfile(res.user);
        },
        signOut: async () => {
            setAuthToken(null);
            setProfile(null);
        }
    }), [profile, loading]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used in AuthProvider");
    return ctx;
}
