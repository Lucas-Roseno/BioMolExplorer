"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface Workspace {
  name: string;
  path: string;
  created_at: string | null;
  owner: string;
  size_bytes: number;
}

interface AuthContextValue {
  user: User | null;
  workspace: Workspace | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveWorkspace: (ws: Workspace) => void;
  /** Build fetch options with Authorization + X-Workspace headers. */
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY     = "biomol_token";
const WORKSPACE_KEY = "biomol_workspace";
const USER_KEY      = "biomol_user";

// Public routes that do NOT require authentication
const PUBLIC_PATHS = new Set(["/login", "/setup", "/3d-demo"]);
const DEMO_PATHS = new Set(["/login", "/3d-demo"]);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [token,     setToken]     = useState<string | null>(null);
  const [user,      setUser]      = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Hydrate state from localStorage on mount ──────────────────────────────
  useEffect(() => {
    const storedToken     = localStorage.getItem(TOKEN_KEY);
    const storedUser      = localStorage.getItem(USER_KEY);
    const storedWorkspace = localStorage.getItem(WORKSPACE_KEY);

    if (storedToken && storedUser) {
      setToken(storedToken);
      try { setUser(JSON.parse(storedUser)); } catch { /* ignore */ }
    }
    if (storedWorkspace) {
      try { setWorkspace(JSON.parse(storedWorkspace)); } catch { /* ignore */ }
    }
    setIsLoading(false);
  }, []);

  // ── Route guard: unauthenticated flow ─────────────────────────────────────
  // Runs only when auth state changes (not on every pathname change).
  // This avoids re-fetching /api/auth/setup-required on every redirect.
  useEffect(() => {
    if (isLoading) return;
    if (token) return; // handled by the second effect below
    if (PUBLIC_PATHS.has(pathname)) return; // Allow public paths without auth check

    fetch("/api/auth/setup-required", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.setup_required) {
          router.replace("/setup");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, token]); // intentionally excludes pathname & router to avoid re-triggering

  // ── Route guard: authenticated flow ───────────────────────────────────────
  // Handles redirects for logged-in users based on current pathname.
  useEffect(() => {
    if (isLoading || !token) return;

    // During development, keep the landing and login screens accessible even
    // when a session is saved in the browser. This allows testing the landing
    // journey without clearing the current workspace.
    if (process.env.NODE_ENV === "development" && DEMO_PATHS.has(pathname)) return;

    if (PUBLIC_PATHS.has(pathname)) {
      // Already logged in, don't stay on login/setup pages
      router.replace("/workspaces");
      return;
    }

    // If authenticated but no workspace selected → go to workspace picker
    if (!workspace && pathname !== "/workspaces") {
      router.replace("/workspaces");
    }
  }, [isLoading, token, workspace, pathname, router]);

  // ── authFetch helper ───────────────────────────────────────────────────────
  const authFetch = useCallback(
    (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers);
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      if (options.body && !isFormData && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (workspace) headers.set("X-Workspace", workspace.name);

      return fetch(url, { ...options, headers });
    },
    [token, workspace]
  );

  // ── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Login failed.");

      const { token: newToken, user: newUser } = data;
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      localStorage.removeItem(WORKSPACE_KEY);
      setToken(newToken);
      setUser(newUser);
      setWorkspace(null);
      // Always go to workspace picker after login
      router.replace("/workspaces");
    },
    [router]
  );

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    setToken(null);
    setUser(null);
    setWorkspace(null);
    router.replace("/login");
  }, [token, router]);

  // ── setActiveWorkspace ────────────────────────────────────────────────────
  const setActiveWorkspace = useCallback((ws: Workspace) => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    setWorkspace(ws);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, workspace, token, isLoading, login, logout, setActiveWorkspace, authFetch }),
    [user, workspace, token, isLoading, login, logout, setActiveWorkspace, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
