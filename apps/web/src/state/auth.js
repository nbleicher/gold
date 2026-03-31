import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        supabase.auth.getSession().then(async ({ data }) => {
            setSession(data.session);
            if (data.session?.user) {
                const p = await api(`/v1/auth/profile/${data.session.user.id}`);
                setProfile(p);
            }
            setLoading(false);
        });
        const { data } = supabase.auth.onAuthStateChange(async (_evt, next) => {
            setSession(next);
            if (next?.user) {
                const p = await api(`/v1/auth/profile/${next.user.id}`);
                setProfile(p);
            }
            else {
                setProfile(null);
            }
        });
        return () => data.subscription.unsubscribe();
    }, []);
    const value = useMemo(() => ({
        user: session?.user ?? null,
        session,
        profile,
        loading,
        signIn: async (email, password) => {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error)
                throw error;
        },
        signOut: async () => {
            await supabase.auth.signOut();
        }
    }), [session, profile, loading]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used in AuthProvider");
    return ctx;
}
