"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import CanvasScene from "@/components/CanvasScene/CanvasScene";
import "./login.css";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <CanvasScene variant="login" />
      <Link className="login-back" href="/3d-demo">← Back to overview</Link>

      <section className="login-panel" aria-labelledby="login-title">
        <Link className="login-brand" href="/3d-demo" aria-label="BioMolExplorer overview">
          <span className="login-brand-mark" aria-hidden="true">B</span>
          <span>BioMolExplorer</span>
        </Link>

        <p className="login-eyebrow">Research workspace</p>
        <h1 id="login-title" className="login-title">Continue the discovery process.</h1>
        <p className="login-description">
          Sign in to access your workspace and continue from biological evidence to molecular prioritization.
        </p>

        {error && <div className="login-error" role="alert">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
          </div>

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in to workspace"}
          </button>
        </form>

        <p className="login-meta">Secure workspace access · BioMolExplorer</p>
      </section>
    </main>
  );
}
