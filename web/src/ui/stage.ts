import { useEffect, useState } from 'react';

/** Landmark positions as fractions of each render, measured by eye. */
export interface Landmarks {
  src: string;
  w: number;
  h: number;
  flag: [number, number];
  tower: [number, number];
  tents: [number, number][];
  /** Lowest point of the tent art, as a fraction of the render's height. Must stay above the bid bar. */
  foot: number;
  /** Size of the hand-made art inside the render; outpainted renders are bigger than it. Caps the zoom. */
  art: { w: number; h: number };
}

/**
 * The hill renders, outpainted with gpt-image-2: the original 1920x1440 art sits at (720, 200),
 * pasted back untouched, with generated scenery around it. The night one runs further down,
 * because its tents sit lower. The bigger frame is what lets the flag clear the header and the
 * tents clear the bid bar without cropping either.
 */
interface Frame { w: number; h: number }
const ART = { w: 1920, h: 1440, x: 720, y: 200 };
const wide = (src: string, frame: Frame, lm: { flag: [number, number]; tower: [number, number]; tents: [number, number][]; foot: number }): Landmarks => {
  const at = ([x, y]: [number, number]): [number, number] => [(ART.x + x * ART.w) / frame.w, (ART.y + y * ART.h) / frame.h];
  return {
    src, w: frame.w, h: frame.h, art: { w: ART.w, h: ART.h },
    flag: at(lm.flag),
    tower: at(lm.tower),
    tents: lm.tents.map(at),
    foot: at([0, lm.foot])[1],
  };
};

/** Landmarks measured on the original 1920x1440 art, mapped into the wide render. */
export const DAY: Landmarks = wide('/img/hill_day_wide.jpg', { w: 3360, h: 1680 }, {
  flag: [0.612, 0.065],
  tower: [0.603, 0.135],
  tents: [[0.395, 0.665], [0.497, 0.665], [0.594, 0.665], [0.668, 0.665]],
  foot: 0.755,
});
export const NIGHT: Landmarks = wide('/img/hill_night_wide.jpg', { w: 3360, h: 2016 }, {
  flag: [0.66, 0.245],
  tower: [0.625, 0.375],
  tents: [[0.19, 0.76], [0.32, 0.79]],
  foot: 0.915,
});
export const PHONE: Landmarks = {
  src: '/img/hill_phone.jpg', w: 960, h: 2080,
  flag: [0.42, 0.3],
  tower: [0.55, 0.2],
  tents: [[0.22, 0.57], [0.62, 0.57]],
  foot: 0.62,
  art: { w: 960, h: 2080 },
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
    // Measure now too: the observer's first callback waits for a rendered frame.
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
};

/** Where a render is drawn on the stage, in stage pixels. */
export interface Placement { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Places a render so its flag sits at least `top` px down (below the header) and its tents end
 * above `bottom` (the bid bar), always covering the stage. Zooms as close as both allow, but never
 * past the zoom the original art had at full bleed, so big screens look as they always did.
 */
export const fitRender = (lm: Landmarks, stage: { w: number; h: number }, top: number, bottom: number): Placement => {
  const cover = Math.max(stage.w / lm.w, stage.h / lm.h);
  const artCover = Math.max(stage.w / lm.art.w, stage.h / lm.art.h);
  const span = (lm.foot - lm.flag[1]) * lm.h;
  const s = Math.max(cover, Math.min(artCover, (bottom - top) / span));
  const w = lm.w * s;
  const h = lm.h * s;
  const lo = top - lm.flag[1] * h; // highest the render may sit and keep the flag clear
  const hi = bottom - lm.foot * h; // lowest it may sit and keep the tents clear
  // Covering the stage wins: y in [stage.h - h, 0]. Within that, keep flag and tents clear.
  const a = Math.max(lo, stage.h - h);
  const b = Math.min(hi, 0);
  const y = a <= b ? (a + b) / 2 : clamp((lo + hi) / 2, stage.h - h, 0);
  return { x: (stage.w - w) / 2, y, w, h };
};

/** A fraction of the render, in stage pixels, for a placement from `fitRender`. */
export const placePoint = (p: Placement, [fx, fy]: [number, number]) => ({ x: p.x + fx * p.w, y: p.y + fy * p.h });

/** Top edge of the element matching `selector` inside `el`, relative to `el`, tracked as both resize. */
export const useInnerTop = (el: HTMLElement | null, selector: string) => {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const inner = el.querySelector(selector);
      setTop(inner ? inner.getBoundingClientRect().top - el.getBoundingClientRect().top : null);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const inner = el.querySelector(selector);
    if (inner) ro.observe(inner);
    measure();
    return () => ro.disconnect();
  }, [el, selector]);
  return top;
};

/** Maps a fraction of the render to pixels on a stage that shows it with object-fit: cover. */
export const coverPoint = (lm: { w: number; h: number }, stage: { w: number; h: number }, [fx, fy]: [number, number], pos: [number, number] = [0.5, 0.5]) => {
  const s = Math.max(stage.w / lm.w, stage.h / lm.h);
  const dw = lm.w * s;
  const dh = lm.h * s;
  return { x: (stage.w - dw) * pos[0] + fx * dw, y: (stage.h - dh) * pos[1] + fy * dh, s };
};
