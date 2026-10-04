export type Vec3Tuple = [number, number, number];

export type MoleculeLabel = {
  title: string;
  formula: string;
  description: string;
  position: Vec3Tuple;
  distanceFactor?: number;
};

export type LandingMolecule = {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
  moleculeIndex: number;
  /** Maximum atom radius already converted to scene scale. */
  visualRadius: number;
  label?: MoleculeLabel;
};

export type SceneBounds = {
  min: Vec3Tuple;
  max: Vec3Tuple;
};

/**
 * Single source for the scene layout and camera path. Keeping both parts on
 * the same data prevents a visual change from introducing path collisions
 * without CameraRig knowing about them.
 */
export const LANDING_MOLECULES: readonly LandingMolecule[] = [
  {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 0.7,
    moleculeIndex: 0,
    visualRadius: 5.8,
    label: {
      title: "α-Humuleno",
      formula: "C₁₅H₂₄",
      description: "Componente do óleo essencial de Cordia verbenacea usado no Acheflan, fitomedicamento com P&D 100% nacional.",
      position: [1.5, -2.8, 0],
      distanceFactor: 9,
    },
  },
  {
    position: [19, 6, -8],
    rotation: [0.2, -0.4, 0.1],
    scale: 0.5,
    moleculeIndex: 1,
    visualRadius: 2.93,
    label: {
      title: "Cafeína",
      formula: "C₈H₁₀N₄O₂",
      description: "Principal ativo do medicamento Acheflan, o primeiro medicamento totalmente desenvolvido no Brasil.",
      position: [-1.5, -3.8, 0],
    },
  },
  { position: [-14, -4, -12], rotation: [-0.1, 0.5, 0.2], scale: 0.45, moleculeIndex: 2, visualRadius: 2.83 },
  { position: [-8.5, 11, -15], rotation: [0.4, 0.2, -0.3], scale: 0.58, moleculeIndex: 3, visualRadius: 2.2 },
  { position: [4, 8, -15], rotation: [-0.3, -0.2, 0.4], scale: 0.5, moleculeIndex: 4, visualRadius: 3.44 },
  { position: [-8.5, 5, -16], rotation: [0.1, 0.8, -0.1], scale: 0.65, moleculeIndex: 5, visualRadius: 2.16 },
  { position: [8, 10, -22], rotation: [-0.5, -0.6, 0.3], scale: 0.4, moleculeIndex: 6, visualRadius: 1.8 },
] as const;

/**
 * Volume occupied by the landing tour, with a small margin around every
 * molecule. Atmospheric elements use these bounds instead of orbiting the
 * origin, so their coverage persists through the final camera stops.
 */
export const LANDING_PARTICLE_BOUNDS: SceneBounds = {
  min: [-21, -12, -30],
  max: [19, 17, 8],
};
