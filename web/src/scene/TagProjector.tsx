import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const v = new THREE.Vector3();

/**
 * Lives inside the Canvas. Every frame, projects each DOM element carrying
 * data-x/y/z into screen space and moves it there. Keeps name tags out of the
 * React tree of the scene, so they never fight the renderer on unmount.
 */
export function TagProjector() {
  useFrame(({ camera, size }) => {
    const els = document.querySelectorAll<HTMLElement>('[data-tag]');
    for (const el of els) {
      v.set(Number(el.dataset.x), Number(el.dataset.y), Number(el.dataset.z)).project(camera);
      const behind = v.z > 1;
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
      el.style.opacity = behind ? '0' : '1';
    }
  });
  return null;
}
