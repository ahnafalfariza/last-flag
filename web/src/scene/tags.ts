import { campers } from '../game/store';
import type { Round } from '../game/types';
import { towerTop } from './Tower';

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export interface TentSpot { account: string; principal: number; x: number; z: number; angle: number }

/** Where each camper's tent stands. Shared by the 3D tents and the DOM name tags. */
export const tentSpots = (round: Round): TentSpot[] => {
  const list = campers(round).sort((a, b) => hash(a.account) - hash(b.account));
  const n = Math.max(1, list.length);
  return list.map((c, i) => {
    const angle = Math.PI * 0.2 + (i / n) * Math.PI * 1.65 + (hash(c.account) % 100) / 900;
    const r = 12.4 + (hash(c.account) % 7) / 6;
    return { ...c, x: Math.cos(angle) * r, z: Math.sin(angle) * r, angle };
  });
};

export const TENT_Y = 1.6;
export const flagTagY = (blocks: number) => towerTop(blocks) + 3.3;
