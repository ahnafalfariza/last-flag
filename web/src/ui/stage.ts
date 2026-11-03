import { useEffect, useState } from 'react';

/** Landmark positions as fractions of each render, measured by eye. */
export interface Landmarks {
  src: string;
  w: number;
  h: number;
  flag: [number, number];
  tower: [number, number];
  tents: [number, number][];
}

export const DAY: Landmarks = {
  src: '/img/hill_day.jpg', w: 1920, h: 1440,
  flag: [0.612, 0.065],
  tower: [0.603, 0.135],
  tents: [[0.395, 0.665], [0.497, 0.665], [0.594, 0.665], [0.668, 0.665]],
};
export const NIGHT: Landmarks = {
  src: '/img/hill_night.jpg', w: 1920, h: 1440,
  flag: [0.66, 0.245],
  tower: [0.625, 0.375],
  tents: [[0.19, 0.76], [0.32, 0.79]],
};
export const PHONE: Landmarks = {
  src: '/img/hill_phone.jpg', w: 960, h: 2080,
  flag: [0.42, 0.3],
  tower: [0.55, 0.2],
  tents: [[0.22, 0.57], [0.62, 0.57]],
};

/** No portrait storm render yet: phones reuse the landscape storm, cropped by object-fit. */
export const PHONE_NIGHT: Landmarks = NIGHT;

export const usePhone = () => {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 720px)');
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
};

/** Size of the stage element, so landmarks can be mapped through object-fit: cover. */
export const useStageSize = (el: HTMLElement | null) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
};

/** Sky to add above a render so its flag sits at least `clear` px down, below the header. */
export const headroom = (lm: Landmarks, stage: { w: number; h: number }, clear: number) => {
  const s = Math.max(stage.w / lm.w, stage.h / lm.h);
  return Math.max(0, Math.round(clear - lm.flag[1] * lm.h * s));
};

/** Maps a fraction of the render to pixels on a stage that shows it with object-fit: cover. */
export const coverPoint = (lm: { w: number; h: number }, stage: { w: number; h: number }, [fx, fy]: [number, number], pos: [number, number] = [0.5, 0.5]) => {
  const s = Math.max(stage.w / lm.w, stage.h / lm.h);
  const dw = lm.w * s;
  const dh = lm.h * s;
  return { x: (stage.w - dw) * pos[0] + fx * dw, y: (stage.h - dh) * pos[1] + fy * dh, s };
};
