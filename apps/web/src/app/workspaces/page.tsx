"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/components/AuthProvider";
import "./workspaces.css";

interface Workspace {
  name: string;
  created_at: string | null;
  size_bytes: number;
  owner: string;
  path: string;
  datasets_path?: string;
}

declare global {
  interface Window {
    biomolDesktop?: {
      selectWorkspaceParent: () => Promise<string | null>;
    };
  }
}

interface UserRecord {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US");
}

export default function WorkspacesPage() {
  const router = useRouter();
  const { user: currentUser, workspace: activeWorkspace, token, isLoading: authLoading, logout, setActiveWorkspace, clearActiveWorkspace } = useAuth();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"workspaces" | "users">("workspaces");
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsParent, setNewWsParent] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [externalPathsEnabled, setExternalPathsEnabled] = useState(false);
  const [isLocalBrowser, setIsLocalBrowser] = useState(false);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createUserErr, setCreateUserErr] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<Workspace | null>(null);
  const [workspaceDeleteError, setWorkspaceDeleteError] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  const [uploadTarget, setUploadTarget] = useState<Workspace | null>(null);
  const [datasetPath, setDatasetPath] = useState("");
  const [datasetUploadError, setDatasetUploadError] = useState("");
  const [datasetUploadSuccess, setDatasetUploadSuccess] = useState("");
  const [uploadingDataset, setUploadingDataset] = useState(false);
  const [selectingDatasetFolder, setSelectingDatasetFolder] = useState(false);

  const authHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }),
    [token]
  );

  const fetchWorkspaces = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/workspaces", { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setWorkspaces(data.workspaces ?? []);
        setExternalPathsEnabled(Boolean(data.external_paths_enabled));
      }
    } catch { /* ignore */ }
  }, [token, authHeaders]);

  const fetchUsers = useCallback(async () => {
    if (!token || !currentUser?.is_admin) return;
    try {
      const res = await apiFetch("/api/users", { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
    } catch { /* ignore */ }
  }, [token, currentUser, authHeaders]);

  useEffect(() => {
    if (authLoading || !token) return;
    setLoading(true);
    Promise.all([fetchWorkspaces(), fetchUsers()]).finally(() => setLoading(false));
  }, [authLoading, token, fetchWorkspaces, fetchUsers]);

  useEffect(() => {
    setIsLocalBrowser(
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    );
  }, []);

  const handleSelectWorkspace = (ws: Workspace) => {
    setActiveWorkspace(ws as import("@/components/AuthProvider").Workspace);
    router.replace("/");
  };

  const openDatasetImport = (workspace: Workspace) => {
    setUploadTarget(workspace);
    setDatasetPath("");
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
  };

  const closeDatasetImport = () => {
    if (uploadingDataset) return;
    setUploadTarget(null);
    setDatasetPath("");
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
  };

  const handleSelectDatasetFolder = async () => {
    setDatasetUploadError("");
    setSelectingDatasetFolder(true);
    try {
      if (window.biomolDesktop) {
        const selected = await window.biomolDesktop.selectWorkspaceParent();
        if (selected) setDatasetPath(selected);
        return;
      }
      const res = await apiFetch("/api/filesystem/native-picker", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || data.status === "error") throw new Error(data.message ?? "Unable to open the folder picker.");
      if (data.status === "ok" && data.path) setDatasetPath(data.path);
    } catch (error: unknown) {
      setDatasetUploadError(error instanceof Error ? error.message : "Unable to select the folder.");
    } finally {
      setSelectingDatasetFolder(false);
    }
  };

  const handleDatasetImport = async () => {
    if (!uploadTarget || !datasetPath || !token) return;
    setUploadingDataset(true);
    setDatasetUploadError("");
    setDatasetUploadSuccess("");

    try {
      const response = await apiFetch(`/api/workspaces/${encodeURIComponent(uploadTarget.name)}/attach-datasets`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ datasets_path: datasetPath }),
      });
      const data = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : {};
      if (!response.ok) {
        throw new Error(data.message ?? "The datasets folder was rejected by the server.");
      }
      // Persist the server-confirmed workspace before navigating so every
      // home-page request is immediately scoped to the attached datasets.
      setActiveWorkspace((data.workspace ?? uploadTarget) as import("@/components/AuthProvider").Workspace);
      router.replace("/");
      return;
    } catch (error: unknown) {
      setDatasetUploadError(error instanceof Error ? error.message : "Unable to import the dataset.");
    } finally {
      setUploadingDataset(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if ((externalPathsEnabled || isLocalBrowser) && !newWsParent) {
      setCreateError("Choose the workspace folder using the system dialog.");
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: newWsName, storage_parent: newWsParent })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create workspace.");
      setShowCreate(false); setNewWsName(""); setNewWsParent(""); fetchWorkspaces();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Error.");
    } finally { setCreating(false); }
  };

  const handleSelectWorkspaceParent = async () => {
    setCreateError("");
    setSelectingFolder(true);
    try {
      if (window.biomolDesktop) {
        const selected = await window.biomolDesktop.selectWorkspaceParent();
        if (selected) setNewWsParent(selected);
        return;
      }

      const res = await apiFetch("/api/filesystem/native-picker", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message ?? "Unable to open the folder picker.");
      }
      if (data.status === "ok" && data.path) setNewWsParent(data.path);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Unable to select the folder.");
    } finally {
      setSelectingFolder(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserErr(""); setCreatingUser(true);
    try {
      const res = await apiFetch("/api/users", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create user.");
      setShowCreateUser(false); setNewUsername(""); setNewPassword(""); fetchUsers();
    } catch (err: unknown) {
      setCreateUserErr(err instanceof Error ? err.message : "Error.");
    } finally { setCreatingUser(false); }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm !== deleteTarget.username) { setDeleteError("Username does not match."); return; }
    setDeleteError(""); setDeleting(true);
    try {
      const res = await apiFetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE", headers: authHeaders(), body: JSON.stringify({ confirm_username: deleteConfirm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete user.");
      setDeleteTarget(null); setDeleteStep(1); setDeleteConfirm(""); fetchUsers();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Error.");
    } finally { setDeleting(false); }
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceDeleteTarget) return;
    setWorkspaceDeleteError("");
    setDeletingWorkspace(true);
    try {
      const res = await apiFetch(`/api/workspaces/${encodeURIComponent(workspaceDeleteTarget.name)}`, {
        method: "DELETE", headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete workspace.");
      if (activeWorkspace?.name === workspaceDeleteTarget.name) clearActiveWorkspace();
      setWorkspaceDeleteTarget(null);
      await fetchWorkspaces();
    } catch (error: unknown) {
      setWorkspaceDeleteError(error instanceof Error ? error.message : "Unable to delete the workspace.");
    } finally {
      setDeletingWorkspace(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="workspaces-page workspaces-loading" aria-live="polite">
        <div className="workspaces-loader" aria-hidden="true" />
        <p>Loading workspaces...</p>
      </main>
    );
  }

  return (
    <main className="workspaces-page">
      <div className="workspaces-shell">
        <header className="workspaces-header">
          <div className="workspaces-brand">
            <div className="workspaces-brand-mark" aria-hidden="true">
              <Image src="/img/icon.png" alt="" width={42} height={42} priority />
            </div>
            <div>
              <span className="workspaces-product">BioMolExplorer</span>
              <h1>Workspaces</h1>
              <p>Select a workspace to continue your research.</p>
            </div>
          </div>

          <div className="workspaces-session">
            <div className="workspaces-user">
              <span className="workspaces-user-avatar" aria-hidden="true">
                {currentUser?.username?.charAt(0).toUpperCase()}
              </span>
              <span className="workspaces-user-copy">
                <strong>{currentUser?.username}</strong>
                <small>{currentUser?.is_admin ? "Administrator" : "Researcher"}</small>
              </span>
            </div>
            <button onClick={() => logout()} className="workspaces-logout" type="button">
              <i className="fas fa-sign-out-alt" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

      <nav className="workspaces-tabs" aria-label="Instance sections">
        <button
          className={`workspaces-tab ${activeTab === "workspaces" ? "is-active" : ""}`}
          type="button"
          aria-current={activeTab === "workspaces" ? "page" : undefined}
          onClick={() => setActiveTab("workspaces")}
        >
          <i className="fas fa-folder-open" aria-hidden="true" />
          My workspaces
        </button>
        {currentUser?.is_admin && (
          <button
            className={`workspaces-tab ${activeTab === "users" ? "is-active" : ""}`}
            type="button"
            aria-current={activeTab === "users" ? "page" : undefined}
            onClick={() => setActiveTab("users")}
          >
            <i className="fas fa-users" aria-hidden="true" />
            Users
          </button>
        )}
      </nav>

      {activeTab === "workspaces" && (
        <section className="workspaces-content" aria-labelledby="workspaces-list-title">
          <div className="workspaces-section-heading">
            <div>
              <span className="workspaces-eyebrow">Your projects</span>
              <h2 id="workspaces-list-title">Choose where you want to work</h2>
            </div>
            <button className="workspaces-primary-button" type="button" onClick={() => { setShowCreate(true); setCreateError(""); setNewWsName(""); setNewWsParent(""); }}>
              <i className="fas fa-plus" aria-hidden="true" />
              New workspace
            </button>
          </div>

          <div className="workspaces-grid">
            {workspaces.length === 0 ? (
              <div className="workspaces-empty">
                <i className="far fa-folder-open" aria-hidden="true" />
                <h3>No workspaces yet</h3>
                <p>Create your first workspace to organize your research data.</p>
              </div>
            ) : (
              workspaces.map(ws => (
                <article className="workspace-card" key={ws.name}>
                  <button
                    className="workspace-card-main"
                    type="button"
                    onClick={() => handleSelectWorkspace(ws)}
                    aria-label={`Open workspace ${ws.name}`}
                  >
                    <span className="workspace-card-icon" aria-hidden="true">
                      <i className="fas fa-folder" />
                    </span>
                    <span className="workspace-card-body">
                      <strong>{ws.name}</strong>
                      <span className="workspace-card-meta">
                        <span><i className="far fa-calendar" aria-hidden="true" /> {formatDate(ws.created_at)}</span>
                        <span><i className="fas fa-database" aria-hidden="true" /> {formatBytes(ws.size_bytes)}</span>
                      </span>
                      <span className="workspace-card-path" title={ws.path}>
                        <i className="fas fa-folder-tree" aria-hidden="true" /> {ws.path}
                      </span>
                    </span>
                    <i className="fas fa-arrow-right workspace-card-arrow" aria-hidden="true" />
                  </button>
                  <button
                    className="workspace-card-import"
                    type="button"
                    onClick={() => openDatasetImport(ws)}
                  >
                    <i className="fas fa-file-import" aria-hidden="true" />
                    Use existing dataset
                  </button>
                  <button
                    className="workspace-card-delete"
                    type="button"
                    onClick={() => {
                      setWorkspaceDeleteTarget(ws);
                      setWorkspaceDeleteError("");
                    }}
                  >
                    <i className="far fa-trash-alt" aria-hidden="true" />
                    Delete workspace
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === "users" && currentUser?.is_admin && (
        <section className="workspaces-content" aria-labelledby="users-list-title">
          <div className="workspaces-section-heading">
            <div>
              <span className="workspaces-eyebrow">Administration</span>
              <h2 id="users-list-title">Instance users</h2>
            </div>
            <button className="workspaces-primary-button" type="button" onClick={() => { setShowCreateUser(true); setCreateUserErr(""); setNewUsername(""); setNewPassword(""); }}>
              <i className="fas fa-user-plus" aria-hidden="true" />
              New user
            </button>
          </div>

          <div className="workspaces-table-wrap">
            <table className="workspaces-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Created on</th>
                  <th className="workspaces-table-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong></td>
                    <td><span className={`workspace-role ${u.is_admin ? "is-admin" : ""}`}>{u.is_admin ? "Administrator" : "User"}</span></td>
                    <td>{formatDate(u.created_at)}</td>
                    <td className="workspaces-table-actions">
                      {!u.is_admin && u.id !== currentUser.id && (
                        <button
                          className="workspaces-delete-button"
                          type="button"
                          onClick={() => { setDeleteTarget(u); setDeleteStep(1); setDeleteConfirm(""); setDeleteError(""); }}
                        >
                          <i className="far fa-trash-alt" aria-hidden="true" />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {uploadTarget && (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal workspace-dataset-modal" role="dialog" aria-modal="true" aria-labelledby="dataset-import-title">
            <div className="workspace-modal-heading">
              <span className="workspace-modal-icon" aria-hidden="true"><i className="fas fa-database" /></span>
              <div>
                <span>Workspace: {uploadTarget.name}</span>
                <h3 id="dataset-import-title">Use existing dataset</h3>
              </div>
            </div>

            <div className="workspace-dataset-guidance">
              <p>
                Select the root folder named exactly <strong>datasets</strong>. The workspace will use it directly:
                no file is uploaded or copied.
              </p>
              <pre aria-label="Required dataset structure">{`datasets/
├── PDB/
│   └── TargetName/
│       ├── pdb_codes.csv
│       ├── XXXX.pdb
│       └── Prepared/          (optional; never empty)
└── ChEMBL/
    ├── bioactivity/Target/*.csv
    ├── DrugBank/*.csv
    ├── molecules/Target/*.csv
    ├── similars/Target/*.csv
    └── targets/*.csv`}</pre>
              <ul>
                <li>PDB, ChEMBL and ZINC pages will read and write directly in this folder.</li>
                <li>Any missing PDB, ChEMBL or ZINC directory will be created automatically.</li>
                <li>The linked folder must remain available and writable while this workspace is in use.</li>
              </ul>
            </div>

            <button type="button" className={`workspace-dataset-picker ${uploadingDataset ? "is-disabled" : ""}`} onClick={handleSelectDatasetFolder} disabled={uploadingDataset || selectingDatasetFolder}>
              <i className="fas fa-folder-open" aria-hidden="true" />
              <span>
                <strong>Choose the datasets folder</strong>
                <small>{selectingDatasetFolder ? "Opening system dialog..." : datasetPath || "Select it with the system dialog."}</small>
              </span>
            </button>

            {datasetPath && (
              <div className="workspace-dataset-summary" role="status">
                <i className="fas fa-check-circle" aria-hidden="true" />
                <div>
                  <strong>Local folder selected</strong>
                  <span>{datasetPath}</span>
                </div>
              </div>
            )}

            {datasetUploadSuccess && (
              <div className="workspace-dataset-summary" role="status">
                <i className="fas fa-check-circle" aria-hidden="true" />
                <div><strong>Import complete</strong><span>{datasetUploadSuccess}</span></div>
              </div>
            )}

            {datasetUploadError && <p className="workspace-modal-error" role="alert">{datasetUploadError}</p>}
            <div className="workspace-modal-actions">
              <button type="button" className="workspaces-secondary-button" onClick={closeDatasetImport} disabled={uploadingDataset}>
                {datasetUploadSuccess ? "Close" : "Cancel"}
              </button>
              {!datasetUploadSuccess && (
                <button
                  type="button"
                  className="workspaces-primary-button"
                  onClick={handleDatasetImport}
                  disabled={!datasetPath || uploadingDataset}
                >
                  {uploadingDataset ? <><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Linking datasets...</> : "Use this dataset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="create-workspace-title">
            <div className="workspace-modal-heading">
              <span className="workspace-modal-icon" aria-hidden="true"><i className="fas fa-folder-plus" /></span>
              <div><span>New project</span><h3 id="create-workspace-title">Create workspace</h3></div>
            </div>
            {createError && <p className="workspace-modal-error" role="alert">{createError}</p>}
            <form onSubmit={handleCreateWorkspace}>
              <div className="workspace-form-field">
                <label htmlFor="workspace-name">Workspace name</label>
                <input 
                  id="workspace-name"
                  type="text" 
                  value={newWsName} 
                  onChange={(e) => setNewWsName(e.target.value)} 
                  placeholder="e.g. Project_2026"
                  required 
                  autoFocus 
                />
                <small>Use a short, easy-to-recognize name.</small>
              </div>
              {(externalPathsEnabled || isLocalBrowser) && <div className="workspace-form-field">
                <span className="workspace-form-label">Folder where the workspace will be created</span>
                <div className="workspace-path-picker">
                  <div
                    id="workspace-parent"
                    className={`workspace-selected-path ${newWsParent ? "" : "is-empty"}`}
                    role="status"
                    aria-live="polite"
                    title={newWsParent || undefined}
                  >
                    <i className="fas fa-folder" aria-hidden="true" />
                    <span>{newWsParent || "No folder selected"}</span>
                  </div>
                  <button
                    type="button"
                    className="workspaces-secondary-button"
                    onClick={handleSelectWorkspaceParent}
                    disabled={selectingFolder}
                  >
                    {selectingFolder ? "Opening..." : "Choose folder"}
                  </button>
                </div>
                <small>A new subfolder named after the workspace will be created.</small>
              </div>}
              <div className="workspace-modal-actions">
                <button type="button" className="workspaces-secondary-button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button
                  type="submit"
                  className="workspaces-primary-button"
                  disabled={creating || ((externalPathsEnabled || isLocalBrowser) && !newWsParent)}
                >
                  {creating ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateUser && (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="workspace-modal-heading">
              <span className="workspace-modal-icon" aria-hidden="true"><i className="fas fa-user-plus" /></span>
              <div><span>Administration</span><h3 id="create-user-title">Create user</h3></div>
            </div>
            {createUserErr && <p className="workspace-modal-error" role="alert">{createUserErr}</p>}
            <form onSubmit={handleCreateUser}>
              <div className="workspace-form-field">
                <label htmlFor="new-username">Username</label>
                <input id="new-username" type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
              <div className="workspace-form-field">
                <label htmlFor="new-password">Password</label>
                <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                <small>At least 8 characters.</small>
              </div>
              <div className="workspace-modal-actions">
                <button type="button" className="workspaces-secondary-button" onClick={() => setShowCreateUser(false)}>Cancel</button>
                <button type="submit" className="workspaces-primary-button" disabled={creatingUser}>{creatingUser ? "Creating..." : "Create user"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {workspaceDeleteTarget && (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal workspace-modal-danger" role="alertdialog" aria-modal="true" aria-labelledby="delete-workspace-title">
            <div className="workspace-modal-heading">
              <span className="workspace-modal-icon" aria-hidden="true"><i className="fas fa-exclamation-triangle" /></span>
              <div><span>Irreversible action</span><h3 id="delete-workspace-title">Delete workspace</h3></div>
            </div>
            <p>
              Delete <strong>{workspaceDeleteTarget.name}</strong> and its managed results? This cannot be undone.
              {workspaceDeleteTarget.datasets_path && workspaceDeleteTarget.datasets_path !== `${workspaceDeleteTarget.path}/datasets`
                ? " The linked external datasets folder will be preserved."
                : " Its managed datasets will also be deleted."}
            </p>
            {workspaceDeleteError && <p className="workspace-modal-error" role="alert">{workspaceDeleteError}</p>}
            <div className="workspace-modal-actions">
              <button type="button" className="workspaces-secondary-button" onClick={() => setWorkspaceDeleteTarget(null)} disabled={deletingWorkspace}>Cancel</button>
              <button type="button" className="workspaces-danger-button" onClick={handleDeleteWorkspace} disabled={deletingWorkspace}>
                {deletingWorkspace ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="workspace-modal-backdrop">
          <div className="workspace-modal workspace-modal-danger" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title">
            <div className="workspace-modal-heading">
              <span className="workspace-modal-icon" aria-hidden="true"><i className="fas fa-exclamation-triangle" /></span>
              <div><span>Irreversible action</span><h3 id="delete-user-title">Delete user</h3></div>
            </div>
            
            {deleteStep === 1 ? (
              <>
                <p>You are about to delete user <strong>{deleteTarget.username}</strong> and ALL of their workspaces. This action cannot be undone.</p>
                <div className="workspace-modal-actions">
                  <button type="button" className="workspaces-secondary-button" onClick={() => setDeleteTarget(null)}>Cancel</button>
                  <button type="button" className="workspaces-danger-button" onClick={() => setDeleteStep(2)}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <p>Type <strong>{deleteTarget.username}</strong> to confirm:</p>
                {deleteError && <p className="workspace-modal-error" role="alert">{deleteError}</p>}
                <div className="workspace-form-field">
                  <label htmlFor="delete-confirmation">Confirmation</label>
                  <input id="delete-confirmation" className="is-danger" type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={deleteTarget.username} />
                </div>
                <div className="workspace-modal-actions">
                  <button type="button" className="workspaces-secondary-button" onClick={() => setDeleteTarget(null)}>Cancel</button>
                  <button type="button" className="workspaces-danger-button" onClick={handleDeleteUser} disabled={deleting}>{deleting ? "Deleting..." : "Delete permanently"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
