"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log internally, never expose to the user
    console.error("[BioMolExplorer] Unhandled render error:", error, info);
  }

  handleReload() {
    this.setState({ hasError: false });
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            padding: "40px 20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              border: "1px solid #f5c6cb",
              borderRadius: "12px",
              padding: "40px",
              maxWidth: "520px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⚠️</div>
            <h2
              style={{
                color: "#721c24",
                marginBottom: "12px",
                fontSize: "1.4rem",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                color: "#555",
                marginBottom: "24px",
                lineHeight: "1.6",
              }}
            >
              An unexpected error occurred while displaying this page.
              Please try refreshing the page. If the problem persists,
              check your network connection and make sure the server is running.
            </p>
            <button
              onClick={() => this.handleReload()}
              style={{
                padding: "10px 28px",
                backgroundColor: "var(--primary-color, #6c5ce7)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "1rem",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
