"use client";
import { shaderMaterial } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three";

// ─── GLSL Vertex ──────────────────────────────────────────────────────────────
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ─── GLSL Fragment ─────────────────────────────────────────────────────────────
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uEnergySpeed;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    // ─── Energy flow: pulse traveling along the bond (Y = UV.y)
    float flow = fract(vUv.y - uTime * uEnergySpeed);

    // ─── Multiple overlapping energy bands
    float bolt1 = smoothstep(0.06, 0.0, abs(flow - 0.5)) * 2.5;
    float bolt2 = smoothstep(0.03, 0.0, abs(fract(flow * 3.0) - 0.5)) * 1.0;
    float bolt3 = smoothstep(0.08, 0.0, abs(fract(flow * 1.3 + 0.3) - 0.5)) * 0.6;
    float energy = bolt1 + bolt2 + bolt3;

    // ─── Base color interpolated from A → B along the bond
    vec3 baseColor = mix(uColorA, uColorB, vUv.y);

    // ─── Fresnel: edges glow more (creates a luminous tube appearance)
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);

    // ─── Tube center glow: darker edges
    float rimDark = 1.0 - pow(1.0 - abs(dot(vNormal, viewDir)), 0.6);

    // ─── Final composition: dense base + pulsing energy + Fresnel rim
    vec3 finalColor = baseColor * (0.55 + fresnel * 0.45 + rimDark * 0.1)
                    + uColorB * energy * 1.2;

    // ─── Alpha: more opaque at the center, edges with a pure glow
    float alpha = 0.72 + fresnel * 0.2 + energy * 0.15;

    gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
  }
`;

// ─── Shader Material Factory ──────────────────────────────────────────────────
export const BondShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color("#705d9d"),
    uColorB: new THREE.Color("#9686de"),
    uEnergySpeed: 0.6,
  },
  vertexShader,
  fragmentShader
);

extend({ BondShaderMaterial });

// ─── Declarative type (R3F ThreeElements augmentation) ───────────────────────
declare module "@react-three/fiber" {
  interface ThreeElements {
    bondShaderMaterial: {
      ref?: React.Ref<THREE.ShaderMaterial>;
      transparent?: boolean;
      attach?: string;
      uTime?: number;
      uColorA?: THREE.Color;
      uColorB?: THREE.Color;
      uEnergySpeed?: number;
    };
  }
}

// ─── Animated Bond Material ───────────────────────────────────────────────────
export function AnimatedBondMaterial({
  colorA = "#705d9d",
  colorB = "#9686de",
  energySpeed = 0.6,
}: {
  colorA?: string;
  colorB?: string;
  energySpeed?: number;
}) {
  const ref = useRef<THREE.ShaderMaterial & { uTime: number }>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.uTime = clock.elapsedTime;
    }
  });

  return (
    <bondShaderMaterial
      ref={ref}
      attach="material"
      transparent
      uColorA={new THREE.Color(colorA)}
      uColorB={new THREE.Color(colorB)}
      uEnergySpeed={energySpeed}
    />
  );
}
