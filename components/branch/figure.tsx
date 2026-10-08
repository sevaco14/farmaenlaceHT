"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { C } from "./palette";
import { Box, Cylinder, Round } from "./primitives";

export type Activity = "idle" | "texting" | "scanning" | "pointing" | "celebrating";
export type Prop = "phone" | "scanner" | "tablet";

export type Look = {
  build: "feminine" | "masculine" | "neutral";
  skin: string;
  hair: string;
  hairstyle: "short" | "long" | "bun";
  glasses: boolean;
  coat: boolean;
};

type Pose = {
  shoulder: [number, number];
  elbow: [number, number];
  roll: [number, number];
  headPitch: number;
  headYaw: number;
  lean: number;
  hop: number;
};

const REST: Pose = {
  shoulder: [-0.1, -0.1],
  elbow: [-0.15, -0.15],
  roll: [-0.07, 0.07],
  headPitch: 0,
  headYaw: 0,
  lean: 0,
  hop: 0,
};

const CELEBRATION_SECONDS = 3;
const POSE_SECONDS = 0.04;

function poseFor(activity: Activity, prop: Prop, time: number, age: number): Pose {
  switch (activity) {
    case "texting": {
      const tap = Math.sin(time * 11);
      return {
        ...REST,
        shoulder: [-0.62, -0.62],
        elbow: [-1.28 + tap * 0.05, -1.28 - tap * 0.05],
        roll: [0.32, -0.32],
        headPitch: 0.42,
        lean: Math.sin(time * 0.7) * 0.02,
      };
    }
    case "scanning": {
      const sweep = Math.sin(time * 1.7);
      return {
        ...REST,
        shoulder: [-0.2, -1.3 + sweep * 0.1],
        elbow: [-0.25, -0.3],
        roll: [-0.06, 0.05 + sweep * 0.06],
        headPitch: -0.04 + sweep * 0.05,
        headYaw: sweep * 0.12,
      };
    }
    case "pointing": {
      const beat = Math.sin(time * 2.4);
      return {
        ...REST,
        shoulder: [-0.85, -1.5 + beat * 0.08],
        elbow: [-1.15, -0.12],
        roll: [0.18, -0.1],
        headPitch: -0.06,
        headYaw: 0.35 + beat * 0.04,
      };
    }
    case "celebrating": {
      if (age > CELEBRATION_SECONDS) return poseFor("idle", prop, time, age);
      const hop = Math.abs(Math.sin(age * 6.2));
      return {
        ...REST,
        shoulder: [-2.55, -2.55],
        elbow: [-0.25, -0.25],
        roll: [-0.2, 0.2],
        headPitch: -0.22,
        hop: hop * 0.22,
      };
    }
    default: {
      const fidget = Math.sin(time * 1.1) * 0.05;
      const holding = prop === "tablet" ? [-0.9, -0.1] : prop === "phone" ? [-0.1, -0.55] : [-0.1, -0.3];
      return {
        ...REST,
        shoulder: [holding[0] + fidget, holding[1] - fidget],
        elbow: [prop === "tablet" ? -1.2 : -0.15, prop === "phone" ? -1.1 : -0.35],
        headYaw: Math.sin(time * 0.38) * 0.3,
        lean: fidget * 0.4,
      };
    }
  }
}

/** The same pose worked by the other hand. */
function mirrored(pose: Pose): Pose {
  return {
    ...pose,
    shoulder: [pose.shoulder[1], pose.shoulder[0]],
    elbow: [pose.elbow[1], pose.elbow[0]],
    roll: [-pose.roll[1], -pose.roll[0]],
    headYaw: -pose.headYaw,
    lean: -pose.lean,
  };
}

type Joints = {
  body: THREE.Group | null;
  head: THREE.Group | null;
  shoulder: (THREE.Group | null)[];
  elbow: (THREE.Group | null)[];
};

function applyPose(joints: Joints, pose: Pose) {
  if (joints.body) {
    joints.body.position.y = pose.hop;
    joints.body.rotation.set(0, 0, pose.lean);
  }
  joints.head?.rotation.set(pose.headPitch, pose.headYaw, 0);
  for (let side = 0; side < 2; side++) {
    joints.shoulder[side]?.rotation.set(pose.shoulder[side], 0, pose.roll[side]);
    joints.elbow[side]?.rotation.set(pose.elbow[side], 0, 0);
  }
}

function HeldProp({ prop }: { prop: Prop }) {
  if (prop === "phone")
    return (
      <group position={[0, -0.27, 0.06]} rotation={[-0.9, 0, 0]}>
        <Box s={[0.085, 0.16, 0.016]} color={C.phone} roughness={0.35} />
        <Box p={[0, 0.005, 0.009]} s={[0.072, 0.135, 0.004]} color={C.screenLive} emissive={C.screenLive} />
      </group>
    );
  if (prop === "scanner")
    return (
      <group position={[0, -0.3, 0.05]} rotation={[-1.2, 0, 0]}>
        <Box s={[0.07, 0.17, 0.07]} color={C.metalDark} roughness={0.4} />
        <Box p={[0, -0.1, 0.02]} s={[0.1, 0.06, 0.13]} color={C.phone} roughness={0.4} />
        <Box p={[0, -0.11, 0.09]} s={[0.07, 0.03, 0.01]} color={C.laser} emissive={C.laser} />
      </group>
    );
  return (
    <group position={[0.05, -0.26, 0.08]} rotation={[-0.5, 0.25, 0]}>
      <Box s={[0.26, 0.34, 0.02]} color={C.phone} roughness={0.35} />
      <Box p={[0, 0, 0.011]} s={[0.23, 0.3, 0.004]} color={C.screenLive} emissive={C.screenLive} />
    </group>
  );
}

/**
 * One standing person, posed through eight joints the frame loop writes to.
 * The block construction follows the AHQ office figures; the kit is Farmaenlace's
 * navy uniform, with a white coat for the person who works the shelves.
 */
export function Figure({
  look,
  activity,
  since,
  prop,
  seed,
  motion,
  mirror = false,
}: {
  look: Look;
  activity: Activity;
  since: number;
  prop: Prop;
  seed: number;
  motion: boolean;
  /** Works the prop with the other hand, so it faces the camera. */
  mirror?: boolean;
}) {
  const joints = useRef<Joints>({ body: null, head: null, shoulder: [null, null], elbow: [null, null] });
  const pose = (time: number, age: number) => {
    const next = poseFor(activity, prop, time, age);
    return mirror ? mirrored(next) : next;
  };
  const still = useMemo(() => {
    const next = poseFor(activity, prop, 0, CELEBRATION_SECONDS + 1);
    return mirror ? mirrored(next) : next;
  }, [activity, prop, mirror]);
  useLayoutEffect(() => {
    applyPose(joints.current, still);
  }, [still, motion]);

  const clock = useRef(seed * 7.3 + 7);
  const posed = useRef(-1);
  const began = useRef(0);
  useEffect(() => {
    began.current = clock.current;
  }, [activity, since]);

  useFrame((_, delta) => {
    if (!motion) return;
    clock.current += Math.min(delta, 0.05);
    if (clock.current - posed.current <= POSE_SECONDS) return;
    posed.current = clock.current;
    applyPose(joints.current, pose(clock.current, clock.current - began.current));
  });

  const width = look.build === "masculine" ? 0.51 : look.build === "feminine" ? 0.43 : 0.47;
  const handProp = (prop === "tablet" ? 0 : 1) ^ (mirror ? 1 : 0);

  return (
    <group
      ref={(group) => {
        joints.current.body = group;
      }}
    >
      <Round p={[0, 1.12, 0]} s={[width, 0.57, 0.29]} color={C.navyLift} radius={0.105} />
      <Box p={[0, 1.37, 0.03]} s={[0.24, 0.05, 0.22]} color={C.navy} />
      <Box p={[-width * 0.26, 1.25, 0.15]} s={[0.085, 0.04, 0.012]} color={C.paper} />
      {look.coat && (
        <group>
          <Round p={[0, 1.02, 0]} s={[width + 0.05, 0.8, 0.33]} color={C.coat} radius={0.08} />
          <Box p={[0, 1.06, 0.166]} s={[0.12, 0.62, 0.012]} color={C.navyLift} />
          <Box p={[-width * 0.28, 1.25, 0.168]} s={[0.085, 0.04, 0.012]} color={C.navy} />
        </group>
      )}
      <Cylinder p={[0, 1.39, 0]} radius={0.075} height={0.15} color={look.skin} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.14, 0.85, 0]}>
          <Round p={[0, -0.22, 0]} s={[0.175, 0.47, 0.195]} color={C.trousers} radius={0.035} />
          <group position={[0, -0.43, 0]}>
            <Round p={[0, -0.18, 0]} s={[0.16, 0.37, 0.17]} color={C.trousers} radius={0.03} />
            <Round p={[0, -0.35, 0.06]} s={[0.19, 0.12, 0.31]} color={C.shoe} radius={0.035} />
          </group>
        </group>
      ))}

      <group
        position={[0, 1.62, 0]}
        ref={(group) => {
          joints.current.head = group;
        }}
      >
        <Round p={[0, 0, 0]} s={[0.35, 0.4, 0.33]} color={look.skin} radius={0.11} />
        <Round p={[0, 0.135, -0.025]} s={[0.368, 0.175, 0.352]} color={look.hair} radius={0.07} />
        <Box p={[0, 0.055, -0.156]} s={[0.35, 0.2, 0.045]} color={look.hair} />
        {look.hairstyle === "long" && (
          <>
            <Round p={[0.155, -0.1, -0.08]} s={[0.08, 0.32, 0.18]} color={look.hair} radius={0.04} />
            <Round p={[-0.155, -0.1, -0.08]} s={[0.08, 0.32, 0.18]} color={look.hair} radius={0.04} />
            <Round p={[0, -0.08, -0.17]} s={[0.32, 0.36, 0.06]} color={look.hair} radius={0.03} />
          </>
        )}
        {look.hairstyle === "bun" && (
          <Round p={[0, 0.2, -0.17]} s={[0.15, 0.14, 0.13]} color={look.hair} radius={0.06} />
        )}
        <Round p={[0, -0.035, 0.179]} s={[0.071, 0.09, 0.058]} color={look.skin} radius={0.024} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.087, 0.005, 0.167]}>
              <sphereGeometry args={[0.017, 8, 8]} />
              <meshStandardMaterial color={C.ink} />
            </mesh>
            {look.glasses && (
              <Box p={[side * 0.087, 0.012, 0.177]} s={[0.12, 0.07, 0.014]} color={C.metalDark} />
            )}
          </group>
        ))}
      </group>

      {[-1, 1].map((side, i) => (
        <group
          key={side}
          position={[side * (width / 2 + 0.035), 1.29, 0]}
          ref={(group) => {
            joints.current.shoulder[i] = group;
          }}
        >
          <Round p={[0, -0.15, 0]} s={[0.16, 0.31, 0.18]} color={look.coat ? C.coat : C.navyLift} radius={0.045} />
          <group
            position={[0, -0.29, 0]}
            ref={(group) => {
              joints.current.elbow[i] = group;
            }}
          >
            <Round p={[0, -0.11, 0]} s={[0.13, 0.25, 0.14]} color={look.skin} radius={0.04} />
            <Round p={[0, -0.245, 0.02]} s={[0.13, 0.12, 0.135]} color={look.skin} radius={0.04} />
            {i === handProp && <HeldProp prop={prop} />}
          </group>
        </group>
      ))}
    </group>
  );
}
