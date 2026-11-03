import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { accountColor, useGame } from '../game/store';
import { towerTop } from './Tower';

/** The leader's flag on top of the tower. Cloth waves; the whole group rides the tower height. */
export function Flag() {
  const group = useRef<THREE.Group>(null);
  const cloth = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const round = useGame((s) => s.round);
  const target = new THREE.Color();

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const { round } = useGame.getState();
    const top = towerTop(round.deposits.length);
    g.position.y = THREE.MathUtils.damp(g.position.y, top, 6, dt);
    g.visible = round.leader !== null;

    const c = cloth.current;
    if (c) {
      const pos = c.geometry.attributes.position as THREE.BufferAttribute;
      const t = state.clock.elapsedTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i); // 0..1.4 from the pole
        const y = pos.getY(i);
        const k = x / 1.4;
        pos.setZ(i, Math.sin(x * 4 - t * 7) * 0.12 * k + Math.sin(y * 5 + t * 3) * 0.04 * k);
      }
      pos.needsUpdate = true;
      c.geometry.computeVertexNormals();
    }
    if (mat.current && round.leader) {
      target.set(accountColor(round.leader));
      mat.current.color.lerp(target, Math.min(1, dt * 6));
    }
  });

  return (
    <group ref={group} position={[0, towerTop(round.deposits.length), 0]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 2.6, 8]} />
        <meshStandardMaterial color="#5b4a3a" />
      </mesh>
      <mesh position={[0, 2.65, 0]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color="#f2b53b" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh ref={cloth} position={[0.02, 2.1, 0]} castShadow>
        <planeGeometry args={[1.4, 0.9, 16, 10]} />
        <meshStandardMaterial ref={mat} color={round.leader ? accountColor(round.leader) : '#c8362b'} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}
