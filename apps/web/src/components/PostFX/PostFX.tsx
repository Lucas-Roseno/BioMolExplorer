"use client";
import React from "react";
import {
  EffectComposer,
  Bloom,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

export default function PostFX() {
  return (
    <EffectComposer multisampling={4}>
      {/* Bloom: makes atoms bleed light */}
      <Bloom
        intensity={1.0}
        luminanceThreshold={0.4}
        luminanceSmoothing={0.7}
        mipmapBlur
        radius={0.7}
      />

      {/* Film Grain: analog depth */}
      <Noise
        blendFunction={BlendFunction.SOFT_LIGHT}
        opacity={0.15}
        premultiply
      />
    </EffectComposer>
  );
}
