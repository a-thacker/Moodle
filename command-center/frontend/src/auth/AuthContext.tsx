// Authentication state for the app: the current user (or null), plus login /
// logout. The token lives in localStorage (via the api client); on load we
// validate it by fetching /auth/me. A `cc-unauthorized` event (any 401)
// forces a logout so an expired token bounces to the login screen.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, setToken, type CurrentUser } from "../api/client";

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Validate an existing token on first load.
  useEffect(() => {
    api.auth
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Any 401 anywhere → drop the session.
  useEffect(() => {
    window.addEventListener("cc-unauthorized", logout);
    return () => window.removeEventListener("cc-unauthorized", logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.auth.login(email, password);
    setToken(access_token);
    setUser(await api.auth.me());
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
