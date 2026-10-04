"use client";
import React, { useRef, useEffect } from "react";
import gsap from "gsap";

export default function MagneticCursor() {
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring) return;

    let mouseX = 0;
    let mouseY = 0;

    // ── Move dot instantly, ring with lag ────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      gsap.to(dot, {
        x: mouseX,
        y: mouseY,
        duration: 0,
      });

      gsap.to(ring, {
        x: mouseX,
        y: mouseY,
        duration: 0.18,
        ease: "power2.out",
      });
    };

    // ── Magnetic pull on interactive elements ─────────────────────────────────
    const onEnterMagnetic = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Snap ring to center of element
      gsap.to(ring, {
        x: cx,
        y: cy,
        width: rect.width + 16,
        height: rect.height + 16,
        borderRadius: "9999px",
        backgroundColor: "rgba(150, 134, 222, 0.14)",
        duration: 0.35,
        ease: "power3.out",
      });
    };

    const onLeaveMagnetic = () => {
      gsap.to(ring, {
        width: 40,
        height: 40,
        borderRadius: "50%",
        backgroundColor: "transparent",
        duration: 0.35,
        ease: "power3.out",
      });
    };

    // ── Click pulse ──────────────────────────────────────────────────────────
    const onClick = () => {
      gsap.fromTo(
        ring,
        { scale: 1 },
        { scale: 1.5, opacity: 0, duration: 0.4, ease: "power3.out", clearProps: "all" }
      );
    };

    // ── Bind events ──────────────────────────────────────────────────────────
    window.addEventListener("mousemove", onMove);
    window.addEventListener("click", onClick);

    const magneticEls = document.querySelectorAll("[data-magnetic]");
    magneticEls.forEach((el) => {
      el.addEventListener("mouseenter", onEnterMagnetic as EventListener);
      el.addEventListener("mouseleave", onLeaveMagnetic);
    });

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
      magneticEls.forEach((el) => {
        el.removeEventListener("mouseenter", onEnterMagnetic as EventListener);
        el.removeEventListener("mouseleave", onLeaveMagnetic);
      });
    };
  }, []);

  return (
    <>
      {/* Center dot — instantaneous */}
      <div
        ref={cursorDotRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "#b9afea",
          pointerEvents: "none",
          zIndex: 9999,
          transform: "translate(-50%, -50%)",
          mixBlendMode: "difference",
        }}
      />
      {/* Ring — with lag */}
      <div
        ref={cursorRingRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1.5px solid rgba(150, 134, 222, 0.7)",
          pointerEvents: "none",
          zIndex: 9998,
          transform: "translate(-50%, -50%)",
          transition: "background-color 0.2s",
        }}
      />
    </>
  );
}
