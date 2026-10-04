"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LANDING_MOLECULES } from "../../lib/landingScene";

type SceneVariant = "landing" | "login";

type CameraStop = {
  moleculeIndex: number;
  direction: THREE.Vector3;
  framing: number;
  targetOffset?: THREE.Vector3;
};

type Transition = {
  lateralOffset: number;
  verticalOffset: number;
  pullBack: number;
};

const LANDING_STOPS: readonly CameraStop[] = [
  // The first framing includes extra breathing room for the molecule label.
  { moleculeIndex: 0, direction: new THREE.Vector3(0.13, 0.08, 1).normalize(), framing: 0.7 },
  // Aim well to the right of the molecule so it stays in the open left
  // margin instead of competing with the second section text.
  {
    moleculeIndex: 1,
    direction: new THREE.Vector3(1.2, 0.5, 1).normalize(),
    framing: 0.8,
    targetOffset: new THREE.Vector3(3, 0, 0),
  },
  { moleculeIndex: 2, direction: new THREE.Vector3(-0.3, 0.1, 1).normalize(), framing: 1 },
  // Frame molecule 3 on the left and the unused molecule 4 on the right
  // of the centered access CTA.
  {
    moleculeIndex: 3,
    direction: new THREE.Vector3(0.22, 0.22, 1).normalize(),
    framing: 2.15,
    targetOffset: new THREE.Vector3(6, -3, 0),
  },
] as const;

// Control points always pull the camera toward the front of the scene before
// moving it sideways, so the path does not cross the molecular volumes.
const TRANSITIONS: readonly Transition[] = [
  { lateralOffset: 4, verticalOffset: 3, pullBack: 11 },
  { lateralOffset: -5, verticalOffset: 4, pullBack: 12 },
  { lateralOffset: 4, verticalOffset: 3, pullBack: 12 },
] as const;

const LOGIN_POSITION = new THREE.Vector3(0.1 , 1, 10);
const LOGIN_TARGET = new THREE.Vector3(0, 0, -2);

function resolveStop(
  stop: CameraStop,
  aspect: number,
  verticalFov: number,
  position: THREE.Vector3,
  target: THREE.Vector3
) {
  const molecule = LANDING_MOLECULES[stop.moleculeIndex];
  const verticalHalfFov = THREE.MathUtils.degToRad(verticalFov) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = (molecule.visualRadius / Math.sin(limitingHalfFov)) * stop.framing;

  target.set(...molecule.position);
  if (stop.targetOffset) target.add(stop.targetOffset);
  position.copy(stop.direction).multiplyScalar(distance).add(target);
}

function quadraticBezier(
  result: THREE.Vector3,
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  t: number
) {
  const inverse = 1 - t;
  result.set(
    inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z
  );
}

export default function CameraRig({ variant = "landing" }: { variant?: SceneVariant }) {
  const { camera } = useThree();
  const rawPointer = useRef({ x: 0, y: 0 });
  const smoothPointer = useRef({ x: 0, y: 0 });
  const reducedMotion = useRef(false);
  const initialized = useRef(false);
  const smoothScrollProgress = useRef(0);
  const currentTarget = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());
  const scratch = useRef({
    startPosition: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    control: new THREE.Vector3(),
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => { reducedMotion.current = mediaQuery.matches; };
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    const onPointerMove = (event: PointerEvent) => {
      rawPointer.current.x = (event.clientX / window.innerWidth - 0.5) * 2;
      rawPointer.current.y = -(event.clientY / window.innerHeight - 0.5) * 2;
    };

    const resetPointer = () => {
      rawPointer.current.x = 0;
      rawPointer.current.y = 0;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", resetPointer);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", resetPointer);
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const isReduced = reducedMotion.current;
    const frameDelta = Math.min(delta, 0.05);

    smoothPointer.current.x = THREE.MathUtils.damp(
      smoothPointer.current.x,
      isReduced ? 0 : rawPointer.current.x,
      5,
      frameDelta
    );
    smoothPointer.current.y = THREE.MathUtils.damp(
      smoothPointer.current.y,
      isReduced ? 0 : rawPointer.current.y,
      5,
      frameDelta
    );

    if (variant === "landing") {
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const pageHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const rawProgress = THREE.MathUtils.clamp(window.scrollY / pageHeight, 0, 1);
      smoothScrollProgress.current = isReduced || !initialized.current
        ? rawProgress
        : THREE.MathUtils.damp(smoothScrollProgress.current, rawProgress, 3.6, frameDelta);

      const scaled = smoothScrollProgress.current * (LANDING_STOPS.length - 1);
      const stopIndex = Math.min(Math.floor(scaled), LANDING_STOPS.length - 1);
      const nextStopIndex = Math.min(stopIndex + 1, LANDING_STOPS.length - 1);
      const segmentProgress = THREE.MathUtils.smootherstep(scaled - stopIndex, 0, 1);
      const vectors = scratch.current;

      resolveStop(
        LANDING_STOPS[stopIndex],
        perspectiveCamera.aspect,
        perspectiveCamera.fov,
        vectors.startPosition,
        vectors.startTarget
      );
      resolveStop(
        LANDING_STOPS[nextStopIndex],
        perspectiveCamera.aspect,
        perspectiveCamera.fov,
        vectors.endPosition,
        vectors.endTarget
      );

      if (stopIndex === nextStopIndex) {
        desiredPosition.current.copy(vectors.startPosition);
      } else {
        const transition = TRANSITIONS[stopIndex];
        vectors.control.set(
          (vectors.startPosition.x + vectors.endPosition.x) / 2 + transition.lateralOffset,
          (vectors.startPosition.y + vectors.endPosition.y) / 2 + transition.verticalOffset,
          Math.max(vectors.startPosition.z, vectors.endPosition.z) + transition.pullBack
        );
        quadraticBezier(
          desiredPosition.current,
          vectors.startPosition,
          vectors.control,
          vectors.endPosition,
          segmentProgress
        );
      }

      desiredTarget.current
        .copy(vectors.startTarget)
        .lerp(vectors.endTarget, segmentProgress);
    } else {
      desiredPosition.current.copy(LOGIN_POSITION);
      desiredTarget.current.copy(LOGIN_TARGET);
      if (!isReduced) desiredPosition.current.y += Math.sin(clock.elapsedTime * 0.22) * 0.18;
    }

    if (!isReduced) {
      // More pronounced, still damped parallax: the mouse gives the scene
      // a tangible sense of depth while scroll remains the main driver.
      const strength = variant === "landing" ? 0.62 : 0.18;
      desiredPosition.current.x += smoothPointer.current.x * strength;
      desiredPosition.current.y += smoothPointer.current.y * strength * 0.58;
      desiredTarget.current.x += smoothPointer.current.x * strength * 0.46;
      desiredTarget.current.y += smoothPointer.current.y * strength * 0.2;
    }

    // Avoid showing the Canvas default position for a few frames, especially
    // on narrow screens where responsive framing requires more distance.
    if (!initialized.current) {
      camera.position.copy(desiredPosition.current);
      currentTarget.current.copy(desiredTarget.current);
      camera.lookAt(currentTarget.current);
      initialized.current = true;
      return;
    }

    const positionBlend = isReduced ? 1 : 1 - Math.exp(-5.5 * frameDelta);
    const targetBlend = isReduced ? 1 : 1 - Math.exp(-6.5 * frameDelta);
    camera.position.lerp(desiredPosition.current, positionBlend);
    currentTarget.current.lerp(desiredTarget.current, targetBlend);
    camera.lookAt(currentTarget.current);
  });

  return null;
}
