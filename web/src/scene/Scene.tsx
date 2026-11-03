import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ComponentRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { Terrain } from './Terrain';
import { Tower, towerTop } from './Tower';
import { Flag } from './Flag';
import { Tents } from './Tents';
import { SkyDome } from './SkyDome';
import { Storm } from './Storm';
import { TagProjector } from './TagProjector';
import { TagLayer } from './TagLayer';

/** Camera follows the tower top; shakes on the strike. */
function Rig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const shake = useRef(0);
  const lastStrike = useRef<number | null>(null);
  useFrame(({ camera }, dt) => {
    const { round, strike } = useGame.getState();
    const c = controls.current;
    if (!c) return;
    const top = towerTop(round.deposits.length);
    c.target.y = THREE.MathUtils.damp(c.target.y, 2.5 + top * 0.45, 2, dt);
    if (strike && strike.at !== lastStrike.current) { lastStrike.current = strike.at; shake.current = 1; }
    if (shake.current > 0.01) {
      shake.current = THREE.MathUtils.damp(shake.current, 0, 3, dt);
      camera.position.x += (Math.random() - 0.5) * shake.current * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake.current * 0.6;
    }
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      target={[0, 5, 0]}
      enablePan={false}
      enableDamping
      minDistance={16}
      maxDistance={44}
      minPolarAngle={0.85}
      maxPolarAngle={1.42}
      autoRotate
      autoRotateSpeed={0.25}
    />
  );
}

export function Scene() {
  return (
    <div className="scene">
      <Canvas shadows camera={{ position: [19, 11, 24], fov: 42, near: 0.5, far: 500 }} dpr={[1, 1.75]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <Suspense fallback={null}>
          <SkyDome />
          <Terrain />
          <Tower />
          <Flag />
          <Tents />
          <Storm />
          <Rig />
          <TagProjector />
        </Suspense>
      </Canvas>
      <TagLayer />
    </div>
  );
}
