"use client";
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, Cylinder, Float } from "@react-three/drei";
import * as THREE from "three";
import { AnimatedAtomMaterial } from "../Shaders/AtomMaterial";
import { AnimatedBondMaterial } from "../Shaders/BondMaterial";
import { MOLECULES_3D } from "../../lib/molecules3D";

// ─── Types ────────────────────────────────────────────────────────────────────
type Vec3 = [number, number, number];

interface AtomDef {
  position: Vec3;
  radius: number;
  color: string;
  emissive: string;
  fresnelPower?: number;
  pulseSpeed?: number;
}

interface BondDef {
  start: Vec3;
  end: Vec3;
  colorA?: string;
  colorB?: string;
  energySpeed?: number;
}

// Preserves the distinction between chemical elements while using colors with
// enough contrast for the dark background and aligned with the BioMolExplorer palette.
const ELEMENT_COLORS: Record<string, Pick<AtomDef, "color" | "emissive">> = {
  C: { color: "#9686de", emissive: "#47366d" }, // lilac — project's primary color
  H: { color: "#eeeaff", emissive: "#705d9d" }, // white with a lavender tint
  N: { color: "#72bfe5", emissive: "#315c82" }, // contrasting cyan-blue
  O: { color: "#dc83ad", emissive: "#713651" }, // pink to distinguish oxygen
};

function getAtomColors(element: string, color: string, emissive: string) {
  return ELEMENT_COLORS[element] ?? { color, emissive };
}

// ─── Bond helper ─────────────────────────────────────────────────────────────
function Bond({ start, end, colorA = "#705d9d", colorB = "#9686de", energySpeed = 0.55 }: BondDef) {
  const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
  const mid = useMemo(() => new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5), [startVec, endVec]);
  const length = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec]);
  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [startVec, endVec]);
  const euler = useMemo(() => new THREE.Euler().setFromQuaternion(quaternion), [quaternion]);

  return (
    <Cylinder
      args={[0.07, 0.07, length, 12]}
      position={[mid.x, mid.y, mid.z]}
      rotation={[euler.x, euler.y, euler.z]}
    >
      <AnimatedBondMaterial colorA={colorA} colorB={colorB} energySpeed={energySpeed} />
    </Cylinder>
  );
}

function Atom({ position, radius, color, emissive, fresnelPower = 2.0, pulseSpeed = 1.8 }: AtomDef) {
  return (
    <Sphere args={[radius, 32, 32]} position={position}>
      <AnimatedAtomMaterial
        color={color}
        emissive={emissive}
        fresnelPower={fresnelPower}
        pulseSpeed={pulseSpeed}
      />
    </Sphere>
  );
}

// ─── Real Molecule ───────────────────────────────────────────────────────────
export default function ProceduralMolecule({
  position = [0, 0, 0],
  scale = 1.0,
  moleculeIndex = 0,
}: {
  position?: Vec3;
  scale?: number;
  moleculeIndex?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Smooth rotation
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.05;
      groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.03) * 0.04;
      groupRef.current.rotation.z = Math.cos(clock.elapsedTime * 0.02) * 0.02;
    }
  });

  const molecule = MOLECULES_3D[moleculeIndex % MOLECULES_3D.length];

  if (!molecule || !molecule.atoms) return null;

  // Calculate the centroid to center the molecule
  const centroid = molecule.atoms.reduce<Vec3>(
    (acc, atom): Vec3 => [
      acc[0] + atom.position[0] / molecule.atoms.length,
      acc[1] + atom.position[1] / molecule.atoms.length,
      acc[2] + atom.position[2] / molecule.atoms.length,
    ],
    [0, 0, 0]
  );

  return (
    <Float speed={1.1} rotationIntensity={0.18} floatIntensity={0.6} floatingRange={[-0.3, 0.3]}>
      <group ref={groupRef} position={position} scale={scale}>
        {/* Render centered atoms */}
        {molecule.atoms.map((atom, i) => {
          const atomColors = getAtomColors(atom.element, atom.color, atom.emissive);
          const pos: Vec3 = [
            atom.position[0] - centroid[0],
            atom.position[1] - centroid[1],
            atom.position[2] - centroid[2],
          ];
          return (
            <Atom
              key={`atom-${i}`}
              position={pos}
              radius={atom.radius * 1.4}
              color={atomColors.color}
              emissive={atomColors.emissive}
              fresnelPower={2.5}
              pulseSpeed={1.5 + (i % 3) * 0.2}
            />
          );
        })}

        {/* Render Bonds */}
        {molecule.bonds &&
          molecule.bonds.map((bond: { start: number; end: number }, i: number) => {
            const startAtom = molecule.atoms[bond.start];
            const endAtom = molecule.atoms[bond.end];
            if (!startAtom || !endAtom) return null;
            const startColors = getAtomColors(startAtom.element, startAtom.color, startAtom.emissive);
            const endColors = getAtomColors(endAtom.element, endAtom.color, endAtom.emissive);

            const startPos: Vec3 = [
              startAtom.position[0] - centroid[0],
              startAtom.position[1] - centroid[1],
              startAtom.position[2] - centroid[2],
            ];
            const endPos: Vec3 = [
              endAtom.position[0] - centroid[0],
              endAtom.position[1] - centroid[1],
              endAtom.position[2] - centroid[2],
            ];

            return (
              <Bond
                key={`bond-${i}`}
                start={startPos}
                end={endPos}
                colorA={startColors.color}
                colorB={endColors.color}
                energySpeed={0.4 + (i % 4) * 0.1}
              />
            );
          })}
      </group>
    </Float>
  );
}
