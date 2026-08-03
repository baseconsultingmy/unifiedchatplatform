import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

const TOKEN_KEY = "baseapp_token";
const MASTER_TOKEN_KEY = "baseapp_master_token";

type AuthState = {
  token: string | null;
  user: any | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  viewAsVendor: (vendorId: number) => Promise<void>;
  exitViewAs: () => void;
  loading: boolean;
  impersonating: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .me(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      loading,
      impersonating: Boolean(user?.impersonating),
      async login(email, password) {
        const res = await api.login(email, password);
        localStorage.removeItem(MASTER_TOKEN_KEY);
        localStorage.setItem(TOKEN_KEY, res.access_token);
        setToken(res.access_token);
      },
      logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(MASTER_TOKEN_KEY);
        setToken(null);
        setUser(null);
      },
      async viewAsVendor(vendorId: number) {
        if (!token) throw new Error("Not authenticated");
        const res = await api.viewAsVendor(token, vendorId);
        // Keep Master Admin token so Exit can restore it.
        if (!localStorage.getItem(MASTER_TOKEN_KEY)) {
          localStorage.setItem(MASTER_TOKEN_KEY, token);
        }
        localStorage.setItem(TOKEN_KEY, res.access_token);
        setToken(res.access_token);
      },
      exitViewAs() {
        const master = localStorage.getItem(MASTER_TOKEN_KEY);
        if (!master) return;
        localStorage.setItem(TOKEN_KEY, master);
        localStorage.removeItem(MASTER_TOKEN_KEY);
        setToken(master);
      },
    }),
    [token, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
