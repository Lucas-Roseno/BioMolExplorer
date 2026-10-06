"use client";
import React from "react";
import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import CameraRig from "../CameraRig/CameraRig";
import AmbientLight from "../AmbientLight/AmbientLight";
import ProceduralMolecule from "../ProceduralMolecule/ProceduralMolecule";
import { LANDING_MOLECULES } from "../../lib/landingScene";

type SceneVariant = "landing" | "login";

const SCENE_BACKGROUNDS: Record<SceneVariant, string> = {
  landing:
    "radial-gradient(ellipse at 58% 34%, #dedce3 0%, #c9c5d1 55%, #aea7b9 100%)",
  login:
    "radial-gradient(ellipse at 28% 20%, #dedce3 0%, #c9c5d1 58%, #aea7b9 100%)",
};

export default function CanvasScene({
  children,
  variant = "landing",
}: {
  children?: React.ReactNode;
  variant?: SceneVariant;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        // A negative layer falls behind the document background in some
        // compositors (especially Firefox), hiding the 3D meshes.
        zIndex: 0,
        pointerEvents: "none",
        background: SCENE_BACKGROUNDS[variant],
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [5, 3, 38], fov: 55 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <AmbientLight density={variant === "login" ? "subtle" : "full"} />
        <CameraRig variant={variant} />

        {variant === "landing" ? (
          <>
            {LANDING_MOLECULES.map((molecule) => (
              <group
                key={molecule.moleculeIndex}
                position={molecule.position}
                rotation={molecule.rotation}
              >
                <ProceduralMolecule
                  scale={molecule.scale}
                  moleculeIndex={molecule.moleculeIndex}
                />
                {molecule.label && (
                  <Html
                    position={molecule.label.position}
                    center
                    distanceFactor={molecule.label.distanceFactor}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      role="note"
                      aria-label={[molecule.label.title, molecule.label.formula, molecule.label.description].join(". ")}
                      className="w-72 rounded-xl border border-[#47366d]/15 bg-[#f6f4f8]/72 px-3 py-2 text-[#34274c] shadow-[0_8px_24px_rgba(71,54,109,0.12)] backdrop-blur-md"
                    >
                      <p className="text-[0.65rem] font-bold tracking-[0.12em] uppercase">
                        {molecule.label.title}
                        <span className="ml-2 font-mono font-medium tracking-normal text-[#34274c]/55">
                          {molecule.label.formula}
                        </span>
                      </p>
                      <p className="mt-1 text-[0.58rem] leading-relaxed text-[#34274c]/60">
                        {molecule.label.description}
                      </p>
                    </div>
                  </Html>
                )}
              </group>
            ))}
          </>
        ) : (
          <>
            {/* Molecules flank the form instead of getting lost in the
                background, preserving a composition with depth. */}
            <ProceduralMolecule position={[5, 0.15, -0.6]} scale={0.64} moleculeIndex={7} />
            <group position={[-4, 2, 1]} rotation={[0.25, 0.5, -0.1]}>
              <ProceduralMolecule scale={0.42} moleculeIndex={8} />
            </group>
            <group position={[-6.7, -3.1, 0.1]} rotation={[-0.2, -0.4, 0.15]}>
              <ProceduralMolecule scale={0.39} moleculeIndex={4} />
            </group>
          </>
        )}

        {/* Bloom used a framebuffer that is not available in every Firefox
            driver. The materials already emit light and remain animated
            without this optional step. */}
      </Canvas>
      {children}
    </div>
  );
}
