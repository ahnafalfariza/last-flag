import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import type { Deposit } from '../game/types';

export const BLOCK = { w: 1.0, h: 0.55 };
export const SUMMIT_Y = 4.8;

/** Tower height in world units for a block count. */
export const towerTop = (blocks: number) => SUMMIT_Y + Math.ceil(blocks / 4) * BLOCK.h;

/** Position of block i in the 2x2 stack. */
export const slot = (i: number) => {
  const layer = Math.floor(i / 4);
  const k = i % 4;
  const sx = (k % 2 === 0 ? -1 : 1) * 0.52;
  const sz = (k < 2 ? -1 : 1) * 0.52;
  const odd = layer % 2 === 1;
  return { x: odd ? sz : sx, z: odd ? -sx : sz, y: SUMMIT_Y + layer * BLOCK.h + BLOCK.h / 2, layer };
};

const sandstone = ['#e9cf98', '#dfc083', '#d4b273', '#eed8a6', '#c9a76a'];
const MAX = 400;
const dummy = new THREE.Object3D();
const color = new THREE.Color();

interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; c: string }

/** One sandstone block per deposit. New blocks drop in; a strike scatters the whole tower. */
export function Tower() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const debrisMesh = useRef<THREE.InstancedMesh>(null);
  const seen = useRef(new Map<number, number>()); // deposit id -> real ms when first seen
  const debris = useRef<Debris[]>([]);
  const lastRound = useRef(useGame.getState().round.id);
  const lastDeposits = useRef<Deposit[]>(useGame.getState().round.deposits);
  const firstFrame = useRef(true);

  const jitter = useMemo(() => Array.from({ length: MAX }, (_, i) => ({ r: ((i * 7919) % 100) / 100 - 0.5, c: sandstone[i % sandstone.length] })), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAX; i++) m.setColorAt(i, color.set(jitter[i].c));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [jitter]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const { round } = useGame.getState();
    const t = performance.now();

    // Round changed: the old tower becomes debris.
    if (round.id !== lastRound.current) {
      const old = lastDeposits.current;
      debris.current = old.slice(-48).map((_, j) => {
        const i = old.length - 1 - j;
        const s = slot(i);
        const a = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 6;
        return { x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 7, vz: Math.sin(a) * sp, rx: Math.random() * 6, ry: Math.random() * 6, c: jitter[i % MAX].c };
      });
      lastRound.current = round.id;
      seen.current.clear();
    }
    lastDeposits.current = round.deposits;

    const n = Math.min(MAX, round.deposits.length);
    for (let i = 0; i < n; i++) {
      const d = round.deposits[i];
      let born = seen.current.get(d.id);
      if (born === undefined) {
        // Blocks already on the hill at load sit in place; blocks that land later drop in.
        born = firstFrame.current ? t - 5000 : t;
        seen.current.set(d.id, born);
      }
      const age = (t - born) / 650;
      const drop = age >= 1 ? 0 : (1 - age) * (1 - age) * 9;
      const squash = age >= 1 && age < 1.25 ? 1 - Math.sin((age - 1) / 0.25 * Math.PI) * 0.08 : 1;
      const s = slot(i);
      dummy.position.set(s.x, s.y + drop, s.z);
      dummy.rotation.set(0, jitter[i].r * 0.08, 0);
      dummy.scale.set(BLOCK.w / squash, BLOCK.h * squash, BLOCK.w / squash);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    firstFrame.current = false;

    // Debris physics.
    const dm = debrisMesh.current;
    if (dm) {
      const list = debris.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.vy -= 18 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.rx += dt * 3; b.ry += dt * 2;
        if (b.y < -3) list.splice(i, 1);
      }
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(b.rx, b.ry, 0);
        dummy.scale.set(BLOCK.w, BLOCK.h, BLOCK.w);
        dummy.updateMatrix();
        dm.setMatrixAt(i, dummy.matrix);
        dm.setColorAt(i, color.set(b.c));
      }
      dm.count = list.length;
      dm.instanceMatrix.needsUpdate = true;
      if (dm.instanceColor) dm.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={debrisMesh} args={[undefined, undefined, 48]} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      {/* summit flagstone */}
      <mesh position={[0, SUMMIT_Y - 0.08, 0]} receiveShadow>
        <cylinderGeometry args={[1.9, 2.1, 0.16, 8]} />
        <meshStandardMaterial color="#b9a98a" flatShading />
      </mesh>
    </group>
  );
}
