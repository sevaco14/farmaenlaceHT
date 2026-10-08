"use client";

import { RoundedBox } from "@react-three/drei";
import { createContext, useContext, useEffect, useMemo } from "react";
import * as THREE from "three";

export type Point = [number, number, number];

/** Below this an object's shadow is a smudge, and casting it is not worth the draw. */
const SHADOW_MIN = 0.3;
const casts = (size: Point) => Math.max(size[0], size[1], size[2]) >= SHADOW_MIN;

type Surfaces = { fabric: THREE.DataTexture; tile: THREE.DataTexture };
export const SurfaceContext = createContext<Surfaces | null>(null);

export function useSurfaces(tile: string, line: string): Surfaces {
  const maps = useMemo(() => {
    const fabricPixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const n = noise - Math.floor(noise);
        const weave = (x % 3 === 0 ? -7 : 0) + (y % 3 === 0 ? -6 : 0);
        const value = Math.min(255, Math.max(0, Math.round(247 + weave + n * 5)));
        const i = (y * 64 + x) * 4;
        fabricPixels[i] = fabricPixels[i + 1] = fabricPixels[i + 2] = value;
        fabricPixels[i + 3] = 255;
      }
    const fabric = new THREE.DataTexture(fabricPixels, 64, 64, THREE.RGBAFormat);
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
    fabric.repeat.set(3, 3);
    fabric.colorSpace = THREE.SRGBColorSpace;
    fabric.needsUpdate = true;

    const size = 128;
    const base = new THREE.Color(tile);
    const rule = new THREE.Color(line);
    const tilePixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const edge = x < 2 || y < 2;
        const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const speck = (noise - Math.floor(noise)) * 0.025;
        const color = edge ? rule : base;
        const i = (y * size + x) * 4;
        tilePixels[i] = Math.round(Math.min(1, color.r - speck) * 255);
        tilePixels[i + 1] = Math.round(Math.min(1, color.g - speck) * 255);
        tilePixels[i + 2] = Math.round(Math.min(1, color.b - speck) * 255);
        tilePixels[i + 3] = 255;
      }
    const tileMap = new THREE.DataTexture(tilePixels, size, size, THREE.RGBAFormat);
    tileMap.wrapS = tileMap.wrapT = THREE.RepeatWrapping;
    tileMap.magFilter = THREE.LinearFilter;
    tileMap.minFilter = THREE.LinearMipmapLinearFilter;
    tileMap.generateMipmaps = true;
    tileMap.anisotropy = 4;
    tileMap.colorSpace = THREE.SRGBColorSpace;
    tileMap.needsUpdate = true;
    return { fabric, tile: tileMap };
  }, [tile, line]);
  useEffect(() => () => Object.values(maps).forEach((map) => map.dispose()), [maps]);
  return maps;
}

export function Box({
  p = [0, 0, 0],
  s,
  color,
  rotation,
  roughness = 0.7,
  metalness = 0,
  emissive,
}: {
  p?: Point;
  s: Point;
  color: string;
  rotation?: Point;
  roughness?: number;
  metalness?: number;
  emissive?: string;
}) {
  return (
    <mesh position={p} rotation={rotation} castShadow={casts(s)} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.6 : 0}
      />
    </mesh>
  );
}

export function Round({
  p = [0, 0, 0],
  s,
  color,
  radius = 0.07,
  rotation,
}: {
  p?: Point;
  s: Point;
  color: string;
  radius?: number;
  rotation?: Point;
}) {
  const surfaces = useContext(SurfaceContext);
  return (
    <RoundedBox
      position={p}
      args={s}
      radius={radius}
      smoothness={3}
      rotation={rotation}
      castShadow={casts(s)}
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.86} map={surfaces?.fabric} />
    </RoundedBox>
  );
}

export function Cylinder({
  p,
  radius,
  height,
  color,
  rotation,
  segments = 18,
}: {
  p: Point;
  radius: number;
  height: number;
  color: string;
  rotation?: Point;
  segments?: number;
}) {
  return (
    <mesh position={p} rotation={rotation} castShadow={casts([radius * 2, height, radius * 2])} receiveShadow>
      <cylinderGeometry args={[radius, radius, height, segments]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}
