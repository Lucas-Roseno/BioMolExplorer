"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

export default function SetupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Setup failed.");
      }
      
      router.push("/login?setup=success");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: "500px" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img src="/img/icon.png" alt="BioMolExplorer Logo" style={{ width: "64px", height: "64px", marginBottom: "1rem" }} />
        <h2 style={{ margin: 0, color: "var(--primary-color)" }}>Welcome to BioMolExplorer</h2>
        <p style={{ color: "#666", marginTop: "0.5rem" }}>Create the initial administrator account to set up the platform.</p>
      </div>

      {error && <div className="error-message" style={{ color: "var(--error-color)", marginBottom: "1rem", textAlign: "center" }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label>Administrator Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="At least 8 characters"
            style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: "2rem" }}>
          <label>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </div>

        <button type="submit" className="submit-btn" style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }} disabled={loading}>
          {loading ? "Setting up..." : "Create Administrator"}
        </button>
      </form>
    </div>
  );
}
