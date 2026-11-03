import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { towerTop } from './Tower';

const RAIN = 2200;

/** Rain, torches on the tower, and a lightning bolt for every bell. Only while the storm is up. */
export function Storm() {
  const rain = useRef<THREE.Points>(null);
  const bolt = useRef<THREE.Line>(null);
  const torches = useRef<THREE.Group>(null);
  const lastThunder = useRef<number>(-1);
  const boltUntil = useRef(0);
  const fade = useRef(0);

  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN * 3);
    for (let i = 0; i < RAIN; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const boltGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    return g;
  }, []);

  useFrame((state, dt) => {
    const { round, thunder, strike } = useGame.getState();
    const armed = round.state === 'Armed';
    fade.current = THREE.MathUtils.damp(fade.current, armed ? 1 : 0, 2, dt);
    const f = fade.current;

    if (rain.current) {
      rain.current.visible = f > 0.02;
      (rain.current.material as THREE.PointsMaterial).opacity = f * 0.55;
      const pos = rain.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < RAIN; i++) {
        let y = pos.getY(i) - dt * 28;
        if (y < 0) y += 40;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    if (torches.current) {
      torches.current.visible = f > 0.05;
      torches.current.position.y = towerTop(round.deposits.length);
      torches.current.children.forEach((c, i) => {
        const l = c.children[1] as THREE.PointLight | undefined;
        if (l) l.intensity = f * (10 + Math.sin(state.clock.elapsedTime * 11 + i * 2.1) * 3 + Math.random() * 2);
      });
    }

    // New bell: draw a bolt. A miss lands on the hillside; the strike hits the tower.
    const latest = thunder[0];
    if (latest && latest.id !== lastThunder.current) {
      lastThunder.current = latest.id;
      const hit = latest.struck || (strike && strike.at === latest.at);
      const top = towerTop(round.deposits.length);
      const tx = hit ? 0 : (Math.random() - 0.5) * 44;
      const tz = hit ? 0 : (Math.random() - 0.5) * 44;
      const ty = hit ? top + 2.6 : 1.5;
      const sx = tx + (Math.random() - 0.5) * 16;
      const sz = tz + (Math.random() - 0.5) * 16;
      const pos = boltGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 14; i++) {
        const k = i / 13;
        const jx = i === 0 || i === 13 ? 0 : (Math.random() - 0.5) * 4;
        const jz = i === 0 || i === 13 ? 0 : (Math.random() - 0.5) * 4;
        pos.setXYZ(i, THREE.MathUtils.lerp(sx, tx, k) + jx, THREE.MathUtils.lerp(48, ty, k), THREE.MathUtils.lerp(sz, tz, k) + jz);
      }
      pos.needsUpdate = true;
      boltUntil.current = performance.now() + (hit ? 700 : 160);
    }
    if (bolt.current) bolt.current.visible = performance.now() < boltUntil.current;
  });

  return (
    <group>
      <points ref={rain} geometry={rainGeo} visible={false}>
        <pointsMaterial color="#cfe3ff" size={0.08} transparent opacity={0} depthWrite={false} />
      </points>
      <primitive object={new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: '#f4f8ff', fog: false }))} ref={bolt} visible={false} />
      <group ref={torches} visible={false}>
        {[[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].map(([x, z], i) => (
          <group key={i} position={[x, 0.2, z]}>
            <mesh position={[0, 0.45, 0]}>
              <coneGeometry args={[0.16, 0.5, 6]} />
              <meshBasicMaterial color="#ffb347" />
            </mesh>
            <pointLight color="#ff9a3c" intensity={0} distance={14} decay={2} position={[0, 0.7, 0]} />
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
              <meshStandardMaterial color="#3b2a1a" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
