import { useMemo } from 'react';
import * as THREE from 'three';

/** Deterministic pseudo-random, so the hill looks the same every load. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
};

/** Three grassy terraces, a wide meadow, trees and rocks. Low-poly, flat shaded. */
export function Terrain() {
  const terraces = useMemo(() => {
    const geos = [
      { r: 15, h: 1.6, y: 0.8, color: '#5f9f45' },
      { r: 10.2, h: 1.6, y: 2.4, color: '#6cb04f' },
      { r: 6, h: 1.6, y: 4.0, color: '#7bbf5a' },
    ].map((t) => {
      const g = new THREE.CylinderGeometry(t.r, t.r + 1.4, t.h, 28, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const rand = rng(Math.floor(t.r * 100));
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (Math.abs(y - t.h / 2) < 0.01) {
          pos.setX(i, pos.getX(i) * (1 + (rand() - 0.5) * 0.08));
          pos.setZ(i, pos.getZ(i) * (1 + (rand() - 0.5) * 0.08));
          pos.setY(i, y + (rand() - 0.5) * 0.12);
        }
      }
      g.computeVertexNormals();
      return { geometry: g, ...t };
    });
    return geos;
  }, []);

  const trees = useMemo(() => {
    const rand = rng(7);
    const out: { pos: [number, number, number]; s: number; shade: string }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 18 + rand() * 20;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (z > 12 && Math.abs(x) < 14) continue; // keep the camera side clear
      out.push({ pos: [x, 0, z], s: 0.8 + rand() * 0.9, shade: ['#2f7a3c', '#3a8a44', '#2b6e3a'][i % 3] });
    }
    return out;
  }, []);

  const rocks = useMemo(() => {
    const rand = rng(21);
    return Array.from({ length: 14 }, (_, i) => {
      const a = rand() * Math.PI * 2;
      const ring = i % 3;
      const r = [16.5, 11.5, 7.2][ring] + rand() * 0.8;
      return { pos: [Math.cos(a) * r, [0.3, 1.9, 3.5][ring], Math.sin(a) * r] as [number, number, number], s: 0.35 + rand() * 0.5, rot: rand() * 3 };
    });
  }, []);

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[90, 48]} />
        <meshStandardMaterial color="#4e8a3b" flatShading />
      </mesh>
      {terraces.map((t) => (
        <mesh key={t.r} geometry={t.geometry} position={[0, t.y, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={t.color} flatShading roughness={1} />
        </mesh>
      ))}
      {trees.map((t, i) => (
        <group key={i} position={t.pos} scale={t.s}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.26, 1.8, 6]} />
            <meshStandardMaterial color="#6b4a2e" flatShading />
          </mesh>
          <mesh position={[0, 2.6, 0]} castShadow>
            <coneGeometry args={[1.3, 2.6, 7]} />
            <meshStandardMaterial color={t.shade} flatShading />
          </mesh>
          <mesh position={[0, 3.9, 0]} castShadow>
            <coneGeometry args={[0.85, 1.8, 7]} />
            <meshStandardMaterial color={t.shade} flatShading />
          </mesh>
        </group>
      ))}
      {rocks.map((r, i) => (
        <mesh key={i} position={r.pos} scale={r.s} rotation={[r.rot, r.rot * 1.3, 0]} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#8d8f93" flatShading />
        </mesh>
      ))}
    </group>
  );
}
