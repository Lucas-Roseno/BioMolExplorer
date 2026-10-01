"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/apiFetch";
import {
  DatasetSelectionSummary,
  DatasetValidationIssue,
  findEmptySelectedDirectories,
  formatDatasetBytes,
  validateDatasetSelection,
} from "@/lib/datasetImport";
import { useAuth } from "@/components/AuthProvider";
import "./workspaces.css";

interface Workspace {
  name: string;
  created_at: string | null;
  size_bytes: number;
  owner: string;
  path: string;
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
  const { user: currentUser, token, isLoading: authLoading, logout, setActiveWorkspace } = useAuth();

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

  const datasetInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Workspace | null>(null);
  const [datasetSelection, setDatasetSelection] = useState<DatasetSelectionSummary | null>(null);
  const [datasetIssues, setDatasetIssues] = useState<DatasetValidationIssue[]>([]);
  const [datasetUploadError, setDatasetUploadError] = useState("");
  const [datasetUploadSuccess, setDatasetUploadSuccess] = useState("");
  const [uploadingDataset, setUploadingDataset] = useState(false);

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
    setDatasetSelection(null);
    setDatasetIssues([]);
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
    if (datasetInputRef.current) datasetInputRef.current.value = "";
  };

  const closeDatasetImport = () => {
    if (uploadingDataset) return;
    setUploadTarget(null);
    setDatasetSelection(null);
    setDatasetIssues([]);
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
  };

  const handleDatasetFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
    const emptyDirectories = await findEmptySelectedDirectories(input);
    const result = validateDatasetSelection(files, emptyDirectories);
    setDatasetSelection(result.summary);
    setDatasetIssues(result.issues);
  };

  const handleDatasetImport = async () => {
    if (!uploadTarget || !datasetSelection || !token) return;
    setUploadingDataset(true);
    setDatasetUploadError("");
    setDatasetUploadSuccess("");
    setDatasetIssues([]);

    const formData = new FormData();
    datasetSelection.files.forEach((file, index) => {
      formData.append("relative_paths", datasetSelection.paths[index]);
      formData.append("files", file, file.name);
    });
    datasetSelection.emptyDirectories.forEach(directory => formData.append("empty_directories", directory));

    try {
      const response = await apiFetch("/api/workspaces/import-dataset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Workspace": uploadTarget.name,
        },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setDatasetIssues(Array.isArray(data.issues) ? data.issues : []);
        throw new Error(data.message ?? "The dataset was rejected by the server.");
      }
      setDatasetUploadSuccess(
        `${data.file_count ?? datasetSelection.files.length} files imported into ${uploadTarget.name}.`
      );
      setDatasetSelection(null);
      if (datasetInputRef.current) datasetInputRef.current.value = "";
      await fetchWorkspaces();
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
                    Import dataset
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
                <h3 id="dataset-import-title">Import existing dataset</h3>
              </div>
            </div>

            <div className="workspace-dataset-guidance">
              <p>
                Select the root folder named exactly <strong>datasets</strong>. Names are case-sensitive:
                it must contain <strong>PDB</strong>, <strong>ChEMBL</strong>, or both, with no other folder
                at the same level.
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
                <li>When ChEMBL is included, all five folders shown are required, cannot be empty, and must contain the same targets.</li>
                <li>ZIP archives, executables, shortcuts, hidden files, and formats unrelated to biomolecular data are rejected.</li>
                <li>Existing PDB and ChEMBL data in the workspace will not be overwritten.</li>
                <li>No file is written to the destination until validation is complete.</li>
              </ul>
            </div>

            <label className={`workspace-dataset-picker ${uploadingDataset ? "is-disabled" : ""}`}>
              <input
                ref={datasetInputRef}
                type="file"
                multiple
                disabled={uploadingDataset}
                onChange={handleDatasetFolderChange}
                {...({ webkitdirectory: "", directory: "" } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
              />
              <i className="fas fa-folder-open" aria-hidden="true" />
              <span>
                <strong>Choose the datasets folder</strong>
                <small>The entire folder will be validated before upload.</small>
              </span>
            </label>

            {datasetSelection && (
              <div className="workspace-dataset-summary" role="status">
                <i className="fas fa-check-circle" aria-hidden="true" />
                <div>
                  <strong>Valid local structure</strong>
                  <span>
                    {datasetSelection.sources.join(" + ")} · {datasetSelection.files.length.toLocaleString("en-US")} files · {formatDatasetBytes(datasetSelection.totalBytes)}
                  </span>
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
            {datasetIssues.length > 0 && (
              <div className="workspace-dataset-issues" role="alert" aria-label="Items blocking the import">
                <strong>Fix the items below:</strong>
                <ul>
                  {datasetIssues.map((currentIssue, index) => (
                    <li key={`${currentIssue.code}-${currentIssue.path}-${index}`}>
                      <code>{currentIssue.path}</code>
                      <span>{currentIssue.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="workspace-modal-actions">
              <button type="button" className="workspaces-secondary-button" onClick={closeDatasetImport} disabled={uploadingDataset}>
                {datasetUploadSuccess ? "Close" : "Cancel"}
              </button>
              {!datasetUploadSuccess && (
                <button
                  type="button"
                  className="workspaces-primary-button"
                  onClick={handleDatasetImport}
                  disabled={!datasetSelection || uploadingDataset}
                >
                  {uploadingDataset ? <><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Validating and importing...</> : "Import dataset"}
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
