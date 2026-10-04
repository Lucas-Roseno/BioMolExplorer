"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

// Routes where the auth header should NOT be shown
const HIDDEN_PATHS = new Set(["/login", "/setup", "/workspaces"]);

interface SessionInfo {
  username: string;
  is_admin: boolean;
  workspace: string | null;
}

export default function AuthHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    // Hydrate from localStorage on every client navigation
    const userRaw = localStorage.getItem("biomol_user");
    const wsRaw   = localStorage.getItem("biomol_workspace");
    if (!userRaw) {
      setSession(null);
      return;
    }
    try {
      const user = JSON.parse(userRaw);
      const ws   = wsRaw ? JSON.parse(wsRaw) : null;
      setSession({ username: user.username, is_admin: user.is_admin, workspace: ws?.name ?? null });
    } catch {
      setSession(null);
    }
  }, [pathname]); // re-run on every route change so it stays in sync

  if (HIDDEN_PATHS.has(pathname) || !session) return null;

  const handleLogout = async () => {
    const token = localStorage.getItem("biomol_token");
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.clear();
    router.replace("/login");
  };

  return (
    <div style={styles.wrapper}>
      {/* Workspace switcher */}
      {session.workspace && (
        <Link href="/workspaces" style={styles.wsBadge} title="Switch workspace">
          <i className="fas fa-folder-open" style={{ marginRight: 6, opacity: 0.85 }} />
          <span style={styles.wsName}>{session.workspace}</span>
          <i className="fas fa-exchange-alt" style={styles.switchIcon} />
        </Link>
      )}

      {/* User indicator */}
      <div style={styles.userBadge}>
        <i className="fas fa-user-circle" style={{ opacity: 0.85 }} />
        <span>{session.username}</span>
        {session.is_admin && <span style={styles.adminTag}>admin</span>}
      </div>

      {/* Logout */}
      <button
        id="header-logout-btn"
        style={styles.logoutBtn}
        onClick={handleLogout}
        title="Sign out"
      >
        <i className="fas fa-sign-out-alt" />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginLeft: "auto",
    paddingRight: 8,
  },
  wsBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "8px",
    padding: "5px 12px",
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    maxWidth: 220,
    overflow: "hidden",
  },
  wsName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  switchIcon: {
    fontSize: "0.75rem",
    opacity: 0.7,
  },
  userBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "rgba(255,255,255,0.85)",
    fontSize: "0.88rem",
    fontWeight: 600,
  },
  adminTag: {
    background: "#9686de",
    color: "#fff",
    borderRadius: "999px",
    padding: "2px 8px",
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
  },
  logoutBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "#fff",
    borderRadius: "6px",
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: "0.9rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
