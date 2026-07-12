"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Icon helper ───────────────────────────────────────────────────────────────

function toastIcon(type: ToastType) {
  switch (type) {
    case "success": return "✅";
    case "error":   return "❌";
    case "warning": return "⚠️";
    case "info":    return "ℹ️";
  }
}

function toastColors(type: ToastType): { bg: string; border: string; titleColor: string } {
  switch (type) {
    case "success": return { bg: "#f0fdf4", border: "#86efac", titleColor: "#166534" };
    case "error":   return { bg: "#fef2f2", border: "#fca5a5", titleColor: "#991b1b" };
    case "warning": return { bg: "#fffbeb", border: "#fcd34d", titleColor: "#92400e" };
    case "info":    return { bg: "#eff6ff", border: "#93c5fd", titleColor: "#1e40af" };
  }
}

// ── Single Toast item ─────────────────────────────────────────────────────────

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const colors = toastColors(toast.type);
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 16px",
        borderRadius: "10px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        maxWidth: "420px",
        width: "100%",
        animation: "toast-slide-in 0.25s ease",
      }}
    >
      <span style={{ fontSize: "1.2rem", lineHeight: 1, flexShrink: 0 }}>{toastIcon(toast.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.92rem", color: colors.titleColor }}>
          {toast.title}
        </p>
        {toast.message && (
          <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "#444", lineHeight: 1.5 }}>
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "1rem",
          color: "#888",
          flexShrink: 0,
          lineHeight: 1,
          padding: "2px",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      // Auto-dismiss: errors stay 7s, others 4.5s
      const duration = type === "error" ? 7000 : 4500;
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed, top-right */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          top: "80px",
          right: "20px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>

      {/* Keyframe injected inline once */}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
