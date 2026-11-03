import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { graceFraction, useGame } from '../game/store';

/**
 * The sun is the grace timer: noon right after a flag, horizon when grace runs out.
 * The storm is night: sun gone, blue moonlight, stars, lightning on every bell.
 */
export function SkyDome() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const flashLight = useRef<THREE.PointLight>(null);
  const sunMesh = useRef<THREE.Mesh>(null);
  const skyPos = useRef(new THREE.Vector3(40, 60, -30));
  const night = useRef(0);
  const scene = useThree((s) => s.scene);
  const stars = useRef<THREE.Group>(null);
  const skyRef = useRef<{ material: THREE.ShaderMaterial } | null>(null);

  useFrame((_, dt) => {
    const { round, now, params, flash } = useGame.getState();
    const f = graceFraction(round, now, params);
    const armed = round.state === 'Armed';
    const elevation = armed ? -0.12 : THREE.MathUtils.lerp(0.04, 1.15, f);
    const azimuth = THREE.MathUtils.lerp(-1.1, 0.5, 1 - f);
    const target = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)).multiplyScalar(80);
    skyPos.current.lerp(target, Math.min(1, dt * 2));
    night.current = THREE.MathUtils.damp(night.current, armed ? 1 : 0, 1.6, dt);
    const nf = night.current;
    const low = Math.max(0, 1 - f); // how low the sun hangs

    if (skyRef.current) {
      const u = skyRef.current.material.uniforms;
      u.sunPosition.value.copy(skyPos.current);
      u.turbidity.value = THREE.MathUtils.lerp(6, 20, nf);
      u.rayleigh.value = THREE.MathUtils.lerp(1.2 + low * 1.5, 0.2, nf);
      u.mieCoefficient.value = THREE.MathUtils.lerp(0.005 + low * 0.02, 0.001, nf);
    }
    if (sun.current) {
      sun.current.position.copy(skyPos.current);
      sun.current.intensity = (1 - nf) * THREE.MathUtils.lerp(0.9, 2.6, f);
      sun.current.color.setHSL(0.09 + f * 0.05, THREE.MathUtils.lerp(0.9, 0.2, f), THREE.MathUtils.lerp(0.55, 0.95, f));
    }
    if (sunMesh.current) {
      sunMesh.current.position.copy(skyPos.current).multiplyScalar(1.6);
      sunMesh.current.visible = nf < 0.9;
      (sunMesh.current.material as THREE.MeshBasicMaterial).color.setHSL(0.1, 1, THREE.MathUtils.lerp(0.62, 0.9, f));
    }
    if (moon.current) moon.current.intensity = nf * 0.55;
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(0.5 + f * 0.3, 0.12, nf);
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.7, 0.18, nf);
      hemi.current.color.setHSL(0.6, 0.6, THREE.MathUtils.lerp(0.8, 0.2, nf));
    }
    if (flashLight.current) flashLight.current.intensity = flash * flash * 900;
    if (stars.current) stars.current.visible = nf > 0.4;

    const fogColor = new THREE.Color().setHSL(nf > 0.5 ? 0.65 : 0.58, nf > 0.5 ? 0.5 : 0.55, THREE.MathUtils.lerp(0.78 - low * 0.15, 0.06, nf) + flash * 0.4);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogColor);
      scene.fog.near = THREE.MathUtils.lerp(70, 35, nf);
      scene.fog.far = THREE.MathUtils.lerp(170, 95, nf);
    }
  });

  return (
    <>
      <Sky ref={skyRef as never} distance={450} sunPosition={[40, 60, -30]} />
      <group ref={stars} visible={false}>
        <Stars radius={200} depth={40} count={2500} factor={5} fade speed={0.6} />
      </group>
      <mesh ref={sunMesh}>
        <sphereGeometry args={[7, 20, 20]} />
        <meshBasicMaterial color="#ffd27a" fog={false} />
      </mesh>
      <ambientLight ref={ambient} intensity={0.6} />
      <hemisphereLight ref={hemi} args={['#bcd8ff', '#4e8a3b', 0.7]} />
      <directionalLight ref={sun} castShadow intensity={2} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30, 10, 200]} />
      </directionalLight>
      <directionalLight ref={moon} position={[-40, 50, 30]} color="#8fb0ff" intensity={0} />
      <pointLight ref={flashLight} position={[0, 40, 0]} color="#e8f0ff" intensity={0} distance={200} decay={1.2} />
      <fog attach="fog" args={['#cfe3f7', 70, 170]} />
    </>
  );
}
