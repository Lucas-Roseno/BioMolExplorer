import React from 'react';
import type { ThreeElements } from '@react-three/fiber';

type PlaceholderBoxProps = Pick<ThreeElements['mesh'], 'position'>;

export default function PlaceholderBox({ position }: PlaceholderBoxProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4f46e5" />
    </mesh>
  );
}
