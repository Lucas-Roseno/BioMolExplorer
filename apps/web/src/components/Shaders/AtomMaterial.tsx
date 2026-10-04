"use client";
import { shaderMaterial } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three";

// ─── GLSL Vertex ──────────────────────────────────────────────────────────────
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

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
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  uniform float uFresnelPower;
  uniform float uPulseSpeed;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  // Simple hash noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Fresnel: glow on silhouette edges
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), uFresnelPower);

    // Animated noise for energy field effect
    float noise = smoothNoise(vUv * 4.0 + vec2(uTime * 0.3, uTime * 0.2));
    float pulse = 0.5 + 0.5 * sin(uTime * uPulseSpeed + noise * 6.28);

    // Base color with metallic sheen
    vec3 baseColor = uColor;

    // Emissive driven by fresnel + noise pulse
    vec3 emissive = uEmissive * (fresnel * 2.5 + pulse * 0.6);

    // Final color
    vec3 finalColor = baseColor + emissive;

    // Soft transparency on extreme edges (energy field feel)
    float alpha = 0.85 + 0.15 * fresnel;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ─── Shader Material Factory ──────────────────────────────────────────────────
export const AtomShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color("#9686de"),
    uEmissive: new THREE.Color("#47366d"),
    uFresnelPower: 2.5,
    uPulseSpeed: 1.8,
  },
  vertexShader,
  fragmentShader
);

// Register as R3F element
extend({ AtomShaderMaterial });

// ─── Declarative type (R3F ThreeElements augmentation) ───────────────────────
declare module "@react-three/fiber" {
  interface ThreeElements {
    atomShaderMaterial: {
      ref?: React.Ref<THREE.ShaderMaterial>;
      transparent?: boolean;
      attach?: string;
      uTime?: number;
      uColor?: THREE.Color;
      uEmissive?: THREE.Color;
      uFresnelPower?: number;
      uPulseSpeed?: number;
    };
  }
}

// ─── Hook: animated atom material ─────────────────────────────────────────────
export function AnimatedAtomMaterial({
  color,
  emissive,
  fresnelPower = 2.5,
  pulseSpeed = 1.8,
}: {
  color: string;
  emissive: string;
  fresnelPower?: number;
  pulseSpeed?: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (matRef.current) {
      (matRef.current as THREE.ShaderMaterial & { uTime: number }).uTime = clock.elapsedTime;
    }
  });

  return (
    <atomShaderMaterial
      ref={matRef}
      attach="material"
      transparent
      uColor={new THREE.Color(color)}
      uEmissive={new THREE.Color(emissive)}
      uFresnelPower={fresnelPower}
      uPulseSpeed={pulseSpeed}
    />
  );
}
