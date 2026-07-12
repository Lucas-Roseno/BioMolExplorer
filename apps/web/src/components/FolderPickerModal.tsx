"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

// ── Types ────────────────────────────────────────────────────────────────────

interface FsEntry {
  name: string;
  type: "dir" | "file";
}

interface BrowseResponse {
  status: string;
  current_path: string;
  parent_path: string | null;
  entries: FsEntry[];
}

export interface FolderPickerModalProps {
  isOpen: boolean;
  /** Path where the picker starts browsing. Defaults to the user's home directory. */
  initialPath?: string;
  /** Called with the selected folder path string when the user confirms. */
  onSelect: (path: string) => void;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FolderPickerModal({
  isOpen,
  initialPath,
  onSelect,
  onClose,
}: FolderPickerModalProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingNative, setOpeningNative] = useState(false);

  const openNativePicker = async () => {
    setOpeningNative(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/filesystem/native-picker`);
      const data = await res.json();
      if (data.status === "ok" && data.path) {
        onSelect(data.path);
        onClose();
      }
    } catch (e) {
      console.error("Failed to open native picker:", e);
    } finally {
      setOpeningNative(false);
    }
  };

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = path
        ? `${API_BASE_URL}/api/filesystem/browse?path=${encodeURIComponent(path)}`
        : `${API_BASE_URL}/api/filesystem/browse`;
      const res = await fetch(url);
      const data: BrowseResponse = await res.json();

      if (data.status !== "ok") {
        setError(data.status || "Unknown error");
        return;
      }

      setCurrentPath(data.current_path);
      setParentPath(data.parent_path);
      setEntries(data.entries);
    } catch (e: any) {
      setError(e.message || "Failed to browse directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      browse(initialPath);
    }
  }, [isOpen, initialPath, browse]);

  if (!isOpen) return null;

  // ── Breadcrumb: split the full absolute path into segments ──
  // e.g. "/home/user/datasets" → ["home", "user", "datasets"]
  const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const handleBreadcrumb = (idx: number) => {
    // Reconstruct path up to the clicked segment index
    const target = "/" + segments.slice(0, idx + 1).join("/");
    browse(target);
  };

  return (
    /* Overlay */
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      {/* Modal box */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "660px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#f8f9fa",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <i className="fas fa-folder-open" style={{ color: "var(--primary-color)", fontSize: "1.2rem" }} />
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#333" }}>
              Select Folder
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.3rem",
              cursor: "pointer",
              color: "#999",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Banner for Native OS Dialog */}
        <div
          style={{
            padding: "12px 22px",
            backgroundColor: "#eef2ff",
            borderBottom: "1px solid #e0e7ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "15px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "#3730a3" }}>
            <i className="fas fa-desktop" style={{ fontSize: "1.1rem" }} />
            <span>Prefer your native Ubuntu File Explorer window? Open it directly on your desktop:</span>
          </div>
          <button
            onClick={openNativePicker}
            disabled={openingNative}
            style={{
              padding: "8px 16px",
              backgroundColor: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: openingNative ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 4px rgba(79, 70, 229, 0.25)",
            }}
          >
            <i className="fas fa-external-link-alt" />
            {openingNative ? "Opening OS Window..." : "Open Native OS Explorer"}
          </button>
        </div>

        {/* Main Explorer Layout: Sidebar + Browser */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: "350px" }}>
          {/* Quick Access Sidebar */}
          <div
            style={{
              width: "180px",
              backgroundColor: "#f8f9fa",
              borderRight: "1px solid #eee",
              padding: "12px 0",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div style={{ padding: "4px 16px 8px", fontSize: "0.72rem", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Quick Access
            </div>
            <button
              onClick={() => browse()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.84rem",
                color: "#333",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#eef2ff")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <i className="fas fa-project-diagram" style={{ color: "#4f46e5", width: "16px" }} />
              <span>Project Root</span>
            </button>
            <button
              onClick={() => browse("/home/lucas-roseno")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.84rem",
                color: "#333",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#eef2ff")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <i className="fas fa-home" style={{ color: "#4f46e5", width: "16px" }} />
              <span>Home (~)</span>
            </button>
            <button
              onClick={() => browse("/")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.84rem",
                color: "#333",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#eef2ff")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <i className="fas fa-hdd" style={{ color: "#4f46e5", width: "16px" }} />
              <span>Root (/)</span>
            </button>
          </div>

          {/* Right Area: Breadcrumbs + Directory List */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Breadcrumb */}
            <div
              style={{
                padding: "10px 18px",
                backgroundColor: "#fdfdfd",
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "2px",
                fontSize: "0.82rem",
                color: "#555",
                minHeight: "38px",
              }}
            >
              {/* Filesystem root ("/") */}
              <button
                onClick={() => browse("/")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--primary-color)",
                  cursor: "pointer",
                  fontWeight: 600,
                  padding: "2px 4px",
                  borderRadius: "4px",
                  fontSize: "0.82rem",
                }}
              >
                /
              </button>

              {segments.map((seg, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span style={{ color: "#ccc" }}>/</span>}
                  <button
                    onClick={() => handleBreadcrumb(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: idx === segments.length - 1 ? "#333" : "var(--primary-color)",
                      fontWeight: idx === segments.length - 1 ? 700 : 400,
                      cursor: idx === segments.length - 1 ? "default" : "pointer",
                      padding: "2px 4px",
                      borderRadius: "4px",
                      fontSize: "0.82rem",
                    }}
                    disabled={idx === segments.length - 1}
                  >
                    {seg}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Directory listing */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
              {loading && (
                <p style={{ textAlign: "center", padding: "30px", color: "#888" }}>
                  Loading…
                </p>
              )}

              {error && (
                <p style={{ textAlign: "center", padding: "20px", color: "#c00", fontSize: "0.9rem" }}>
                  ⚠ {error}
                </p>
              )}

              {!loading && !error && (
                <>
                  {/* Go up */}
                  {parentPath && (
                    <button
                      onClick={() => browse(parentPath)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 18px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        color: "#555",
                        fontSize: "0.9rem",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f4ff")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <i className="fas fa-level-up-alt" style={{ color: "#aaa", width: "16px" }} />
                      <span style={{ fontStyle: "italic", color: "#888" }}>.. (Go up)</span>
                    </button>
                  )}

                  {entries.length === 0 && (
                    <p style={{ textAlign: "center", padding: "30px", color: "#aaa", fontSize: "0.88rem" }}>
                      Empty directory
                    </p>
                  )}

                  {entries.map((entry) => {
                    const isDir = entry.type === "dir";
                    const fullPath = `${currentPath}/${entry.name}`;
                    return (
                      <button
                        key={entry.name}
                        onClick={() => isDir && browse(fullPath)}
                        disabled={!isDir}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 18px",
                          background: "none",
                          border: "none",
                          cursor: isDir ? "pointer" : "default",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          color: isDir ? "#333" : "#bbb",
                          fontSize: "0.88rem",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (isDir) e.currentTarget.style.backgroundColor = "#f0f4ff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <i
                          className={`fas ${isDir ? "fa-folder" : "fa-file"}`}
                          style={{
                            color: isDir ? "#f5a623" : "#ddd",
                            width: "16px",
                            fontSize: "0.9rem",
                          }}
                        />
                        <span>{entry.name}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer — current path display + action buttons */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid #eee",
            backgroundColor: "#f8f9fa",
          }}
        >
          <p
            style={{
              margin: "0 0 12px 0",
              fontSize: "0.78rem",
              color: "#666",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            Selected: <strong>{currentPath || "—"}</strong>
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                padding: "9px 20px",
                background: "none",
                border: "1px solid #ccc",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                color: "#555",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (currentPath) {
                  onSelect(currentPath);
                  onClose();
                }
              }}
              disabled={!currentPath}
              style={{
                padding: "9px 22px",
                backgroundColor: currentPath ? "var(--primary-color)" : "#ccc",
                border: "none",
                borderRadius: "6px",
                cursor: currentPath ? "pointer" : "not-allowed",
                fontWeight: 700,
                color: "#fff",
                boxShadow: currentPath ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                transition: "background 0.2s",
              }}
            >
              Select This Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
