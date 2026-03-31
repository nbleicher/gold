import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getAuthToken, setAuthToken } from "../lib/api";

type AppUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  displayName: string | null;
};

type AuthContextValue = {
  user: AppUser | null;
  profile: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api<AppUser>("/v1/auth/me")
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user: profile,
      profile,
      loading,
      signIn: async (email, password) => {
        const res = await api<{ token: string; user: AppUser }>("/v1/auth/login", {
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
