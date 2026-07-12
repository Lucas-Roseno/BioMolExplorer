"use client";

import React, { useState } from "react";

interface InfoTooltipProps {
  content: React.ReactNode;
  position?: "top" | "bottom" | "right";
}

export default function InfoTooltip({ content, position = "top" }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className="info-tooltip-wrapper"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginLeft: "6px",
        verticalAlign: "middle",
      }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <button
        type="button"
        aria-label="Information"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--primary-color, #6c5ce7)",
          fontSize: "0.95rem",
          lineHeight: 1,
        }}
      >
        <i className="fas fa-info-circle" aria-hidden="true"></i>
      </button>

      {isVisible && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: position === "top" ? "calc(100% + 8px)" : undefined,
            top: position === "bottom" ? "calc(100% + 8px)" : undefined,
            transform: "translateX(-50%)",
            backgroundColor: "#1e293b",
            color: "#f8fafc",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: "normal",
            lineHeight: "1.4",
            width: "max-content",
            maxWidth: "260px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
            zIndex: 1000,
            whiteSpace: "normal",
            textAlign: "left",
            pointerEvents: "none",
            animation: "info-tooltip-fade-in 0.15s ease-out",
          }}
        >
          {content}
          {/* Arrow */}
          <span
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: position === "top" ? "-5px" : undefined,
              top: position === "bottom" ? "-5px" : undefined,
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: position === "top" ? "5px solid #1e293b" : undefined,
              borderBottom: position === "bottom" ? "5px solid #1e293b" : undefined,
            }}
          />
        </span>
      )}

      <style jsx>{`
        @keyframes info-tooltip-fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </span>
  );
}
