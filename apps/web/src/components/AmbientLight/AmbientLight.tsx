"use client";
import React, { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { SpotLight } from "@react-three/drei";
import * as THREE from "three";
import ParticleField from "../ParticleField/ParticleField";

export default function AmbientLight({ density = "full" }: { density?: "full" | "subtle" }) {
  const blueRef = useRef<THREE.PointLight>(null);
  const purpleRef = useRef<THREE.PointLight>(null);
  const cyanRef = useRef<THREE.PointLight>(null);
  const greenRef = useRef<THREE.PointLight>(null);
  const [spotTarget, setSpotTarget] = React.useState<THREE.Object3D | null>(null);

  const { mouse } = useThree();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // ── Breathing: lights pulse gently ─────────────────────────────────────
    if (blueRef.current)   blueRef.current.intensity   = 80 + Math.sin(t * 1.1) * 25;
    if (purpleRef.current) purpleRef.current.intensity = 60 + Math.sin(t * 0.8 + 1) * 18;
    if (cyanRef.current)   cyanRef.current.intensity   = 60 + Math.sin(t * 0.9 + 2) * 18;
    if (greenRef.current)  greenRef.current.intensity  = 40 + Math.sin(t * 1.3 + 3) * 14;

    // ── Mouse parallax on the lights ────────────────────────────────────────
    const mx = mouse.x * 5;
    const my = mouse.y * 3;

    if (blueRef.current) {
      blueRef.current.position.x = THREE.MathUtils.lerp(blueRef.current.position.x, mx * 0.6, 0.05);
      blueRef.current.position.y = THREE.MathUtils.lerp(blueRef.current.position.y, 8 + my * 0.4, 0.05);
    }
    if (purpleRef.current) {
      purpleRef.current.position.x = THREE.MathUtils.lerp(purpleRef.current.position.x, -6 + mx * -0.4, 0.04);
      purpleRef.current.position.y = THREE.MathUtils.lerp(purpleRef.current.position.y, 3 + my * 0.3, 0.04);
    }
    if (cyanRef.current) {
      cyanRef.current.position.x = THREE.MathUtils.lerp(cyanRef.current.position.x, 6 + mx * 0.4, 0.04);
      cyanRef.current.position.z = THREE.MathUtils.lerp(cyanRef.current.position.z, -3 + mx * -0.2, 0.04);
    }
  });

  return (
    <>
      {/* Target object for the dramatic SpotLight */}
      <object3D ref={setSpotTarget} position={[0, 0, 0]} />

      {/* Ambient base — almost imperceptible, allowing shaders and Environment to dominate */}
      <ambientLight intensity={0.08} color="#0d0919" />

      {/* Main overhead light — cool blue, breathing + mouse */}
      <pointLight ref={blueRef} position={[0, 8, 2]} intensity={80} color="#9686de" decay={1.5} />

      {/* Dramatic overhead SpotLight — creates light cones over the molecule */}
      <SpotLight
        position={[3, 12, 4]}
        intensity={120}
        angle={0.3}
        penumbra={0.8}
        color="#ffffff"
        castShadow
        target={spotTarget || undefined}
        decay={1.2}
        distance={25}
      />

      {/* Left side — purple/violet */}
      <pointLight ref={purpleRef} position={[-6, 3, 3]} intensity={60} color="#705d9d" decay={1.5} />

      {/* Right side — cyan */}
      <pointLight ref={cyanRef} position={[6, 3, -3]} intensity={60} color="#72bfe5" decay={1.5} />

      {/* Bottom rim light — emerald green */}
      <pointLight ref={greenRef} position={[0, -4, -6]} intensity={40} color="#b9afea" decay={2} />

      {/* Warm fill light — amber */}
      <pointLight position={[3, -2, 6]} intensity={22} color="#dc83ad" decay={2} />

      {/* GPU particle system */}
      <ParticleField density={density} />
    </>
  );
}
