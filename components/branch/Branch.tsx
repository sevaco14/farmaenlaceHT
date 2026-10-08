"use client";

import { ContactShadows, Html, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import * as THREE from "three";
import { Figure, type Activity, type Look } from "./figure";
import { C, lookFor, type ProductLook } from "./palette";
import { Box, Cylinder, SurfaceContext, useSurfaces, type Point } from "./primitives";

const FONT_BOLD = "/fonts/archivo-800.woff";
const FONT_REGULAR = "/fonts/archivo-400.woff";

export type Shelf = { product: string; category: string; stockPct: number };
export type Message = { id: string; text: string };

export type BranchProps = {
  zone: string;
  product: string;
  category?: string;
  neighbors: Shelf[];
  messages: Message[];
  queries: number;
  stock: number;
  promo: number;
  promoDays?: number;
  alert: boolean;
  released: boolean;
  motion: boolean;
};

const SLOTS_PER_SHELF = 8;
const SHELVES = 4;
const SLOT_COUNT = SLOTS_PER_SHELF * SHELVES;
const slotsFor = (stock: number) => Math.round((Math.max(0, Math.min(100, stock)) / 100) * SLOT_COUNT);

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Fits the orthographic camera to whatever box the stage gives the canvas. */
function Rig() {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const size = useThree((state) => state.size);
  useLayoutEffect(() => {
    camera.zoom = Math.min(size.width / 12.8, size.height / 9.4);
    camera.position.set(13.8, 11.6, 14);
    camera.lookAt(0, 1.35, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Wordmark3D({ position, size, light }: { position: Point; size: number; light: boolean }) {
  const swoosh = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.9 * size, -0.42 * size, 0),
      new THREE.Vector3(-0.6 * size, -0.62 * size, 0),
      new THREE.Vector3(1.6 * size, -0.5 * size, 0),
      new THREE.Vector3(3.1 * size, -0.2 * size, 0),
    ]);
    return new THREE.TubeGeometry(curve, 40, 0.07 * size, 8, false);
  }, [size]);
  useEffect(() => () => swoosh.dispose(), [swoosh]);
  return (
    <group position={position}>
      <Text font={FONT_BOLD} fontSize={size} color={light ? C.paper : C.navy} anchorX="right" anchorY="middle" letterSpacing={-0.04}>
        farma
      </Text>
      <Text font={FONT_REGULAR} fontSize={size} color={light ? "#dfe6f5" : C.gray} anchorX="left" anchorY="middle" letterSpacing={-0.02}>
        enlace
      </Text>
      <mesh geometry={swoosh}>
        <meshBasicMaterial color={C.lime} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Room() {
  return (
    <group>
      <Box p={[0, -0.18, 0]} s={[9.6, 0.36, 6.6]} color={C.slab} roughness={0.9} />
      <Box p={[0, -0.005, 3.27]} s={[9.6, 0.02, 0.06]} color={C.slabEdge} />
      <Floor />
      <Box p={[0, 1.4, -3.06]} s={[9.2, 2.8, 0.12]} color={C.wall} roughness={0.95} />
      <Box p={[-4.66, 1.4, 0.04]} s={[0.12, 2.8, 6.32]} color={C.wall} roughness={0.95} />
      <Box p={[0, 2.6, -2.99]} s={[9.2, 0.4, 0.02]} color={C.navy} roughness={0.8} />
      <Box p={[-4.59, 2.6, 0.04]} s={[0.02, 0.4, 6.2]} color={C.navy} roughness={0.8} />
      <Box p={[0, 0.06, -2.99]} s={[9.2, 0.12, 0.02]} color={C.trim} />
      <Box p={[-4.59, 0.06, 0.04]} s={[0.02, 0.12, 6.2]} color={C.trim} />
      <Wordmark3D position={[-0.4, 2.62, -2.97]} size={0.24} light />
      <group position={[-4.57, 1.72, 1.6]} rotation={[0, Math.PI / 2, 0]}>
        <Box s={[0.62, 0.62, 0.03]} color={C.paper} />
        <Box p={[0, 0, 0.02]} s={[0.16, 0.48, 0.02]} color={C.navy} />
        <Box p={[0, 0, 0.02]} s={[0.48, 0.16, 0.02]} color={C.navy} />
      </group>
      <group position={[-4.57, 1.2, -1.2]} rotation={[0, Math.PI / 2, 0]}>
        <Box s={[1.9, 1.1, 0.04]} color={C.glass} roughness={0.2} metalness={0.1} />
        <Box p={[0, 0, 0.025]} s={[0.04, 1.1, 0.02]} color={C.trim} />
      </group>
    </group>
  );
}

function Floor() {
  const surfaces = useSurfaces(C.tile, C.tileLine);
  const map = useMemo(() => {
    const texture = surfaces.tile.clone();
    texture.repeat.set(15, 10.5);
    texture.needsUpdate = true;
    return texture;
  }, [surfaces.tile]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[0, 0.002, 0.04]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[9.2, 6.32]} />
      <meshStandardMaterial color="#ffffff" map={map} roughness={0.55} />
    </mesh>
  );
}

function GondolaFrame({ x, width }: { x: number; width: number }) {
  return (
    <group position={[x, 0, -2.62]}>
      <Box p={[0, 1.05, -0.2]} s={[width, 2.1, 0.06]} color={C.shelfBack} roughness={0.9} />
      {[-1, 1].map((side) => (
        <Box key={side} p={[(side * width) / 2, 1.05, 0]} s={[0.06, 2.1, 0.46]} color={C.shelfFrame} roughness={0.5} />
      ))}
      <Box p={[0, 0.09, 0.02]} s={[width, 0.18, 0.46]} color={C.shelfFrame} roughness={0.5} />
      {Array.from({ length: SHELVES }, (_, level) => (
        <group key={level}>
          <Box p={[0, 0.5 + level * 0.42, 0.02]} s={[width - 0.06, 0.035, 0.44]} color={C.shelfBoard} roughness={0.4} />
          <Box p={[0, 0.48 + level * 0.42, 0.245]} s={[width - 0.06, 0.05, 0.012]} color={C.paper} />
        </group>
      ))}
    </group>
  );
}

function FillerGondola({ x, seed }: { x: number; seed: number }) {
  const items = useMemo(() => {
    const rand = seeded(seed);
    const list: { p: Point; s: Point; color: string; round: boolean }[] = [];
    for (let level = 0; level < SHELVES; level++) {
      let cursor = -0.92;
      while (cursor < 0.86) {
        const w = 0.12 + rand() * 0.12;
        const h = 0.16 + rand() * 0.16;
        if (rand() > 0.12) {
          list.push({
            p: [x + cursor + w / 2, 0.52 + level * 0.42 + h / 2, -2.6 + rand() * 0.06],
            s: [w, h, 0.16 + rand() * 0.08],
            color: C.stock[Math.floor(rand() * C.stock.length)],
            round: rand() > 0.78,
          });
        }
        cursor += w + 0.025;
      }
    }
    return list;
  }, [seed, x]);
  return (
    <group>
      <GondolaFrame x={x} width={2} />
      {items.map((item, index) =>
        item.round ? (
          <Cylinder key={index} p={item.p} radius={item.s[0] / 2.2} height={item.s[1]} color={item.color} segments={12} />
        ) : (
          <Box key={index} p={item.p} s={item.s} color={item.color} roughness={0.6} />
        ),
      )}
    </group>
  );
}

function ShelfHeader({ x, label, tone }: { x: number; label: string; tone: "watched" | "side" }) {
  const watched = tone === "watched";
  return (
    <group position={[x, 2.36, -2.6]}>
      <Box s={[2.04, 0.42, 0.06]} color={watched ? C.navy : C.paper} />
      <Text
        position={[0, 0, 0.04]}
        font={FONT_BOLD}
        fontSize={watched ? 0.2 : 0.16}
        color={watched ? C.paper : C.navy}
        anchorX="center"
        anchorY="middle"
        letterSpacing={-0.02}
        maxWidth={1.9}
      >
        {label}
      </Text>
    </group>
  );
}

function SideGondola({ x, shelf, seed }: { x: number; shelf: Shelf | undefined; seed: number }) {
  if (!shelf) return <FillerGondola x={x} seed={seed} />;
  const look = lookFor(shelf.product, shelf.category);
  const count = slotsFor(shelf.stockPct);
  return (
    <group>
      <GondolaFrame x={x} width={2} />
      <ShelfHeader x={x} label={shelf.product} tone="side" />
      {Array.from({ length: count }, (_, index) => (
        <ProductUnit key={index} index={index} x={x} look={look} dropAt={null} clockStart={NO_CLOCK} />
      ))}
    </group>
  );
}

const NO_CLOCK: RefObject<number | null> = { current: null };

function slotPosition(index: number, x: number): Point {
  const column = Math.floor(index / SHELVES);
  const level = index % SHELVES;
  return [x - 0.84 + column * 0.24, 0.52 + level * 0.42, -2.58];
}

function ProductUnit({
  index,
  x,
  look,
  dropAt,
  clockStart,
}: {
  index: number;
  x: number;
  look: ProductLook;
  dropAt: number | null;
  clockStart: RefObject<number | null>;
}) {
  const group = useRef<THREE.Group>(null);
  const [px, py, pz] = slotPosition(index, x);
  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    if (dropAt === null || clockStart.current === null) {
      node.visible = true;
      node.position.y = py;
      return;
    }
    const t = (state.clock.elapsedTime - clockStart.current - dropAt) / 0.42;
    node.visible = t > 0;
    node.position.y = py + (1 - easeOut(t)) * 0.9;
  });
  const height = look.shape === "box" ? 0.25 : 0.27;
  return (
    <group ref={group} position={[px, py, pz]}>
      {look.shape === "bottle" ? (
        <>
          <Cylinder p={[0, height / 2, 0]} radius={0.075} height={height} color={look.body} />
          <Cylinder p={[0, height + 0.025, 0]} radius={0.035} height={0.05} color={look.band} />
          <Box p={[0, height * 0.5, 0.072]} s={[0.1, 0.08, 0.008]} color={look.band} />
        </>
      ) : (
        <>
          <Box p={[0, height / 2, 0]} s={look.shape === "box" ? [0.2, height, 0.17] : [0.15, height, 0.1]} color={look.body} roughness={0.5} />
          <Box p={[0, height * 0.62, look.shape === "box" ? 0.087 : 0.052]} s={[look.shape === "box" ? 0.2 : 0.15, 0.05, 0.006]} color={look.band} />
        </>
      )}
    </group>
  );
}

function WatchedGondola({
  x,
  product,
  category,
  count,
  before,
  clockStart,
}: {
  x: number;
  product: string;
  category?: string;
  count: number;
  before: number | null;
  clockStart: RefObject<number | null>;
}) {
  const look = lookFor(product, category);
  return (
    <group>
      <GondolaFrame x={x} width={2} />
      <ShelfHeader x={x} label={product} tone="watched" />
      {Array.from({ length: count }, (_, index) => (
        <ProductUnit
          key={`${product}-${index}`}
          index={index}
          x={x}
          look={look}
          dropAt={before !== null && index >= before ? 0.75 + (index - before) * 0.05 : null}
          clockStart={clockStart}
        />
      ))}
    </group>
  );
}

function Counter() {
  return (
    <group position={[2.75, 0, 1.25]}>
      <Box p={[0, 0.5, 0]} s={[2.5, 1, 0.62]} color={C.counter} roughness={0.5} />
      <Box p={[0, 0.5, 0.315]} s={[2.5, 0.86, 0.012]} color={C.counterFront} roughness={0.6} />
      <Box p={[0, 1.03, 0]} s={[2.6, 0.06, 0.72]} color={C.counterTop} roughness={0.3} />
      <Wordmark3D position={[0.05, 0.58, 0.325]} size={0.17} light />
      <group position={[0.75, 1.06, -0.05]}>
        <Box p={[0, 0.03, 0]} s={[0.22, 0.04, 0.18]} color={C.metalDark} />
        <Box p={[0, 0.2, 0]} s={[0.04, 0.3, 0.04]} color={C.metalDark} />
        <Box p={[0, 0.38, 0.02]} s={[0.44, 0.3, 0.03]} rotation={[0.2, Math.PI, 0]} color={C.screen} roughness={0.3} />
      </group>
      <group position={[-0.7, 1.06, 0.05]}>
        <Box p={[0, 0.04, 0]} s={[0.3, 0.08, 0.22]} color={C.wallShade} />
        <Box p={[0, 0.1, 0]} s={[0.26, 0.04, 0.18]} color={C.paper} />
      </group>
    </group>
  );
}

function PromoTotem({ state, days }: { state: "off" | "season" | "live"; days: number }) {
  const panel = state === "live" ? C.lime : state === "season" ? C.navy : C.promoOff;
  return (
    <group position={[-1.85, 0, 1.75]} rotation={[0, Math.PI / 4, 0]}>
      <Box p={[0, 0.04, 0]} s={[0.7, 0.08, 0.42]} color={C.shelfFrame} />
      <Box p={[0, 0.55, 0]} s={[0.06, 1.0, 0.06]} color={C.metal} metalness={0.4} roughness={0.35} />
      <group position={[0, 1.55, 0]}>
        <Box s={[1.02, 1.12, 0.06]} color={C.paper} />
        <Box p={[0, 0, 0.035]} s={[0.94, 1.04, 0.012]} color={panel} emissive={state === "live" ? C.limeLit : undefined} />
        <Suspense fallback={null}>
          {state === "off" ? (
            <Text position={[0, 0, 0.05]} font={FONT_BOLD} fontSize={0.1} color={C.gray} anchorX="center" anchorY="middle" maxWidth={0.8} textAlign="center">
              Sin promo local
            </Text>
          ) : (
            <group position={[0, 0, 0.05]}>
              <Text position={[0, 0.2, 0]} font={FONT_BOLD} fontSize={0.15} color={state === "live" ? C.navy : C.paper} anchorX="center" anchorY="middle" letterSpacing={-0.03}>
                SmartClub
              </Text>
              <Text position={[0, -0.06, 0]} font={FONT_REGULAR} fontSize={0.085} color={state === "live" ? C.navy : "#c9d3f2"} anchorX="center" anchorY="middle" maxWidth={0.82} textAlign="center">
                {state === "live" ? `Promo simulada · ${days} días` : "Promo de temporada"}
              </Text>
            </group>
          )}
        </Suspense>
      </group>
    </group>
  );
}

function Pallet({ dropping, clockStart }: { dropping: boolean; clockStart: RefObject<number | null> }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    if (!dropping || clockStart.current === null) {
      node.position.y = 0;
      node.scale.set(1, 1, 1);
      return;
    }
    const t = (state.clock.elapsedTime - clockStart.current) / 0.7;
    node.position.y = (1 - easeOut(t)) * 4.2;
    const squash = t > 1 && t < 1.35 ? Math.sin(((t - 1) / 0.35) * Math.PI) * 0.08 : 0;
    node.scale.set(1 + squash, 1 - squash, 1 + squash);
  });
  return (
    <group ref={group} position={[-0.2, 0, 0.2]} rotation={[0, -0.2, 0]}>
      {[-0.38, 0, 0.38].map((x) => (
        <Box key={x} p={[x, 0.06, 0]} s={[0.12, 0.12, 0.92]} color={C.palletDark} />
      ))}
      <Box p={[0, 0.15, 0]} s={[0.96, 0.05, 0.92]} color={C.pallet} />
      {[-0.23, 0.23].flatMap((x) =>
        [-0.21, 0.21].flatMap((z) =>
          [0, 1].map((level) => (
            <group key={`${x}-${z}-${level}`} position={[x, 0.36 + level * 0.36, z]}>
              <Box s={[0.44, 0.34, 0.4]} color={C.carton} roughness={0.85} />
              <Box p={[0, 0.171, 0]} s={[0.08, 0.004, 0.4]} color={C.cartonTape} />
            </group>
          )),
        ),
      )}
    </group>
  );
}

function ScanBeam({ on, from, to }: { on: boolean; from: Point; to: Point }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return { mid: a.add(b).multiplyScalar(0.5), quaternion, length: direction.length() };
  }, [from, to]);
  useFrame((state) => {
    if (material.current) material.current.opacity = 0.45 + Math.sin(state.clock.elapsedTime * 9) * 0.3;
  });
  if (!on) return null;
  return (
    <mesh position={beam.mid} quaternion={beam.quaternion}>
      <cylinderGeometry args={[0.008, 0.008, beam.length, 6]} />
      <meshBasicMaterial ref={material} color={C.laser} transparent opacity={0.6} toneMapped={false} />
    </mesh>
  );
}

const BEAM_FROM: Point = [-1.57, 1.2, -1.69];
const BEAM_TO: Point = [-0.95, 1.02, -2.36];

const LOOKS: Record<"wa" | "inv" | "pro", Look> = {
  wa: { build: "feminine", skin: C.skinTones[2], hair: C.hairColors[0], hairstyle: "long", glasses: false, coat: false },
  inv: { build: "masculine", skin: C.skinTones[1], hair: C.hairColors[2], hairstyle: "short", glasses: true, coat: true },
  pro: { build: "neutral", skin: C.skinTones[0], hair: C.hairColors[1], hairstyle: "bun", glasses: false, coat: false },
};

type Tone = "alert" | "calm" | "released";

function Pill({ code, text, tone }: { code: string; text: string; tone: Tone }) {
  return (
    <div className="agent-pill" data-tone={tone} aria-hidden="true">
      <b>{code}</b>
      <span>{text}</span>
    </div>
  );
}

function Bubbles({ messages, active }: { messages: Message[]; active: boolean }) {
  if (!active || messages.length === 0) return null;
  return (
    <div className="chat-stream" aria-hidden="true">
      {messages
        .slice(0, 2)
        .reverse()
        .map((message) => (
          <p key={message.id} className="chat-bubble">
            <b>WA</b>
            {message.text}
          </p>
        ))}
    </div>
  );
}

function Scene(props: BranchProps) {
  const { product, category, neighbors, messages, queries, stock, promo, promoDays = 0, alert, released, motion } = props;
  const clock = useThree((state) => state.clock);
  const clockStart = useRef<number | null>(null);
  const previous = useRef({ released, stock });
  const [drop, setDrop] = useState<{ before: number; key: number } | null>(null);
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    const was = previous.current;
    previous.current = { released, stock };
    if (!released) {
      setDrop(null);
      setSettled(true);
      clockStart.current = null;
      return;
    }
    if (was.released) return;
    if (!motion) {
      setSettled(true);
      return;
    }
    clockStart.current = clock.elapsedTime;
    setDrop({ before: slotsFor(was.stock), key: Date.now() });
    setSettled(false);
  }, [released, stock, motion, clock]);

  // Stock keeps changing while the simulation runs. Its updates must not cancel
  // the timer that completes the approval animation.
  useEffect(() => {
    if (!drop || !motion) {
      setSettled(true);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), 2700);
    return () => window.clearTimeout(id);
  }, [drop, motion]);

  const celebrating = released && settled && drop !== null;
  const since = drop?.key ?? 0;
  const activity = (busy: Activity): Activity => (celebrating ? "celebrating" : alert ? busy : "idle");
  const waActivity: Activity = celebrating ? "celebrating" : alert || queries >= 60 ? "texting" : "idle";
  const promoState = promo >= 100 ? (settled ? "live" : "off") : promo >= 50 ? "season" : "off";
  const count = slotsFor(stock);

  return (
    <group>
      <Room />
      <SideGondola x={-2.95} shelf={neighbors[0]} seed={11} />
      <WatchedGondola
        key={product}
        x={-0.75}
        product={product}
        category={category}
        count={count}
        before={drop?.before ?? null}
        clockStart={clockStart}
      />
      <SideGondola x={1.45} shelf={neighbors[1]} seed={29} />
      <Counter />
      <PromoTotem state={promoState} days={promoDays} />
      {released && <Pallet dropping={drop !== null} clockStart={clockStart} />}
      <ScanBeam on={alert && !released} from={BEAM_FROM} to={BEAM_TO} />

      <group position={[2.9, 0, 0.5]} rotation={[0, 0.25, 0]}>
        <Figure look={LOOKS.wa} activity={waActivity} since={since} prop="phone" seed={1} motion={motion} />
        <Html position={[0, 2.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <Pill code="WA" text={queries >= 60 ? "Pico de consultas" : "Consultas estables"} tone={queries >= 60 && !released ? "alert" : "calm"} />
        </Html>
        <Html position={[0.55, 2.55, -0.55]} zIndexRange={[19, 0]} style={{ pointerEvents: "none" }}>
          <Bubbles messages={messages} active={!released} />
        </Html>
      </group>

      <group position={[-2.15, 0, -1.75]} rotation={[0, 2.0, 0]}>
        <Figure look={LOOKS.inv} activity={activity("scanning")} since={since} prop="scanner" seed={2} motion={motion} mirror />
        <Html position={[0, 2.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <Pill
            code="INV"
            text={released ? `Stock simulado · ${stock}%` : `Stock ${stock}%`}
            tone={released ? "released" : stock < 30 ? "alert" : "calm"}
          />
        </Html>
      </group>

      <group position={[-3.05, 0, 1.25]} rotation={[0, 0.45, 0]}>
        <Figure look={LOOKS.pro} activity={activity("pointing")} since={since} prop="tablet" seed={4} motion={motion} />
        <Html position={[0, 2.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <Pill
            code="PRO"
            text={promo >= 100 ? `SmartClub simulado · ${promoDays} días` : promo >= 50 ? "Promo vigente" : "Sin promo local"}
            tone={promo >= 100 ? "released" : alert ? "alert" : "calm"}
          />
        </Html>
      </group>
    </group>
  );
}

export function Branch(props: BranchProps) {
  return (
    <Canvas
      orthographic
      flat
      shadows="soft"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [14, 11.2, 14], zoom: 60, near: 0.1, far: 100 }}
    >
      <Rig />
      <hemisphereLight args={["#f2f5ff", "#3a4a8a", 1.15]} />
      <directionalLight
        position={[5, 11, 7]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 5, 3]} intensity={0.35} />
      <SurfaceProvider>
        <Suspense fallback={null}>
          <Scene key={`${props.zone}:${props.product}`} {...props} />
        </Suspense>
      </SurfaceProvider>
      <ContactShadows position={[0, -0.37, 0]} scale={18} blur={2.6} opacity={0.5} far={2} color="#00103d" frames={1} />
    </Canvas>
  );
}

function SurfaceProvider({ children }: { children: ReactNode }) {
  const surfaces = useSurfaces(C.tile, C.tileLine);
  return <SurfaceContext.Provider value={surfaces}>{children}</SurfaceContext.Provider>;
}
