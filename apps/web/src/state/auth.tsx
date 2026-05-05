import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getAuthToken, setAuthToken } from "../lib/api";
import { loginIdentifierToUsername } from "../lib/loginUsername";
import { hasSupabaseClient, supabase } from "../lib/supabase";

export type AppRole = "admin" | "streamer" | "shipper" | "bagger";

type AppUser = {
  id: string;
  username: string;
  role: AppRole;
  displayName: string | null;
};

type AuthContextValue = {
  user: AppUser | null;
  profile: AppUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch `/v1/auth/me` (e.g. after admin changes the signed-in user’s username). */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      let token = getAuthToken();
      if (!token && hasSupabaseClient && supabase) {
        const session = (await supabase.auth.getSession()).data.session;
        token = session?.access_token ?? null;
        if (token) setAuthToken(token);
      }
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const p = await api<AppUser>("/v1/auth/me");
        setProfile(p);
      } catch {
        setAuthToken(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: profile,
      profile,
      loading,
      signIn: async (username, password) => {
        const normalized = loginIdentifierToUsername(username);
        if (hasSupabaseClient && supabase) {
          const email = `${normalized}@login.internal`;
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error && data.session?.access_token) {
            setAuthToken(data.session.access_token);
            const p = await api<AppUser>("/v1/auth/me");
            setProfile(p);
            return;
          }
        }
        const res = await api<{ token: string; user: AppUser }>("/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: normalized, password })
        });
        setAuthToken(res.token);
        setProfile(res.user);
      },
      signOut: async () => {
        if (hasSupabaseClient && supabase) {
          await supabase.auth.signOut();
        }
        setAuthToken(null);
        setProfile(null);
      },
      refreshProfile: async () => {
        const token = getAuthToken();
        if (!token) {
          setProfile(null);
          return;
        }
        try {
          const p = await api<AppUser>("/v1/auth/me");
          setProfile(p);
        } catch {
          setAuthToken(null);
          setProfile(null);
        }
      }
    }),
    [profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used in AuthProvider");
  return ctx;
}
