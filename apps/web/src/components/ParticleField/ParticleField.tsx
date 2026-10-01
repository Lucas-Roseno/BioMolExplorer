"use client";
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LANDING_PARTICLE_BOUNDS } from "../../lib/landingScene";

type ParticleDensity = "full" | "subtle";

// Simple random in range
const rng = (min: number, max: number) => Math.random() * (max - min) + min;

export default function ParticleField({ density = "full" }: { density?: ParticleDensity }) {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = density === "subtle" ? 460 : 2200;

  // Generate a soft circular glow texture for particles
  const circleTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  // ── Initial positions, velocities and "orbit" data ──────────────────────────
  const { positions, colors, sizes, velocities, orbits } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const velocities = new Float32Array(particleCount * 3);
    const orbits = new Float32Array(particleCount * 3); // phase, radius, speed

    const palettes = [
      new THREE.Color("#47366d"), // deep purple — primary color
      new THREE.Color("#614a93"), // intermediate violet
      new THREE.Color("#705d9d"), // original navigation violet
      new THREE.Color("#9686de"), // highlight lilac
      new THREE.Color("#b9afea"), // lavanda clara
      new THREE.Color("#72bfe5"), // contrasting blue
    ];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Stratified sampling keeps a consistent visual density across the full
      // landing tour. The former origin-centred sphere made the first molecule
      // much denser than the molecules farther along the camera path.
      const cellsPerAxis = Math.ceil(Math.cbrt(particleCount));
      const cell = i % (cellsPerAxis ** 3);
      const xCell = cell % cellsPerAxis;
      const yCell = Math.floor(cell / cellsPerAxis) % cellsPerAxis;
      const zCell = Math.floor(cell / (cellsPerAxis ** 2));
      const { min, max } = LANDING_PARTICLE_BOUNDS;

      positions[i3 + 0] = THREE.MathUtils.lerp(
        min[0],
        max[0],
        (xCell + rng(0, 1)) / cellsPerAxis
      );
      positions[i3 + 1] = THREE.MathUtils.lerp(
        min[1],
        max[1],
        (yCell + rng(0, 1)) / cellsPerAxis
      );
      positions[i3 + 2] = THREE.MathUtils.lerp(
        min[2],
        max[2],
        (zCell + rng(0, 1)) / cellsPerAxis
      );

      // Color from palette
      const c = palettes[Math.floor(rng(0, palettes.length))];
      colors[i3 + 0] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;

      // Size variation
      sizes[i] = rng(0.5, 2.5);

      // Slow drift velocities
      velocities[i3 + 0] = rng(-0.002, 0.002);
      velocities[i3 + 1] = rng(-0.002, 0.002);
      velocities[i3 + 2] = rng(-0.001, 0.001);

      // Orbital data: [phase, orbit-radius, orbit-speed]
      orbits[i3 + 0] = rng(0, Math.PI * 2); // initial phase
      orbits[i3 + 1] = rng(0.05, 0.25);     // micro-orbit radius
      orbits[i3 + 2] = rng(0.3, 1.5);       // orbit speed
    }

    return { positions, colors, sizes, velocities, orbits };
  }, [particleCount]);

  // ── Geometry ──────────────────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [positions, colors, sizes]);

  // ── Animate particles ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const phase = orbits[i3 + 0];
      const orbitR = orbits[i3 + 1];
      const orbitSpeed = orbits[i3 + 2];

      // Micro-orbit around original position + slow drift
      const ox = Math.cos(t * orbitSpeed + phase) * orbitR;
      const oy = Math.sin(t * orbitSpeed * 0.7 + phase) * orbitR;

      arr[i3 + 0] = positions[i3 + 0] + ox + velocities[i3 + 0] * t * 8;
      arr[i3 + 1] = positions[i3 + 1] + oy + velocities[i3 + 1] * t * 8;
      arr[i3 + 2] = positions[i3 + 2] + velocities[i3 + 2] * t * 8;

      // Reset any particle that leaves the shared landing-tour volume.
      if (
        arr[i3] < LANDING_PARTICLE_BOUNDS.min[0] || arr[i3] > LANDING_PARTICLE_BOUNDS.max[0] ||
        arr[i3 + 1] < LANDING_PARTICLE_BOUNDS.min[1] || arr[i3 + 1] > LANDING_PARTICLE_BOUNDS.max[1] ||
        arr[i3 + 2] < LANDING_PARTICLE_BOUNDS.min[2] || arr[i3 + 2] > LANDING_PARTICLE_BOUNDS.max[2]
      ) {
        arr[i3 + 0] = positions[i3 + 0];
        arr[i3 + 1] = positions[i3 + 1];
        arr[i3 + 2] = positions[i3 + 2];
      }
    }

    posAttr.needsUpdate = true;
    // Keep the field within its coverage bounds while retaining gentle motion.
    pointsRef.current.rotation.y = Math.sin(t * 0.015) * 0.04;
    pointsRef.current.rotation.x = Math.sin(t * 0.008) * 0.12;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        vertexColors
        sizeAttenuation
        size={0.25}
        map={circleTexture}
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
