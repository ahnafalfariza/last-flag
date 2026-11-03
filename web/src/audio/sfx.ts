import { hz, live, noise, tone, useSound, type Graph } from './engine';

const play = (fn: (g: Graph, t: number) => void) => {
  const g = live();
  if (!g || !useSound.getState().sfxOn) return;
  fn(g, g.ctx.currentTime + 0.01);
};

/** Drop repeats closer than `ms` of real time, so fast game speeds don't turn into noise. */
const throttle = (ms: number, fn: () => void) => {
  let last = 0;
  return () => {
    const t = performance.now();
    if (t - last < ms) return;
    last = t;
    fn();
  };
};

const PLUCKS = [67, 69, 72, 74, 76];

export const sfx = {
  click: () => play((g, t) => tone(g, g.sfx, { type: 'triangle', freq: 1100, to: 700, at: t, dur: 0.05, gain: 0.1 })),

  page: () => play((g, t) => noise(g, g.sfx, { type: 'bandpass', freq: 500, to: 2600, q: 1.4, at: t, dur: 0.3, gain: 0.09, attack: 0.08 })),

  /** You planted the flag: a thud and a rising arpeggio. */
  bidMine: () => play((g, t) => {
    tone(g, g.sfx, { freq: 150, to: 55, at: t, dur: 0.2, gain: 0.5 });
    noise(g, g.sfx, { type: 'bandpass', freq: 900, to: 300, at: t, dur: 0.12, gain: 0.15 });
    [72, 76, 79, 84].forEach((m, i) => {
      tone(g, g.sfx, { type: 'square', freq: hz(m), at: t + 0.06 + i * 0.07, dur: 0.18, gain: 0.06, lp: 3000 });
    });
  }),

  /** Someone else took the lead: one soft pluck. */
  bidOther: throttle(200, () => play((g, t) => {
    const m = PLUCKS[Math.floor(Math.random() * PLUCKS.length)];
    tone(g, g.sfx, { freq: 120, to: 60, at: t, dur: 0.12, gain: 0.18 });
    tone(g, g.sfx, { type: 'triangle', freq: hz(m), at: t, dur: 0.25, gain: 0.09 });
  })),

  /** Grace ran out: wind swells and a falling minor line. */
  stormStart: () => play((g, t) => {
    noise(g, g.sfx, { type: 'lowpass', freq: 120, to: 420, at: t, dur: 3, gain: 0.35, attack: 1.2 });
    tone(g, g.sfx, { type: 'sawtooth', freq: 55, to: 49, at: t, dur: 2.6, gain: 0.12, attack: 0.6, lp: 300 });
    [69, 65, 62].forEach((m, i) => tone(g, g.sfx, { freq: hz(m), at: t + 0.3 + i * 0.35, dur: 1, gain: 0.08 }));
  }),

  /** A sudden-death check that missed: distant thunder. */
  thunder: throttle(700, () => play((g, t) => {
    noise(g, g.sfx, { type: 'lowpass', freq: 180 + Math.random() * 160, to: 70, at: t, dur: 1.2 + Math.random() * 0.6, gain: 0.12 + Math.random() * 0.1, attack: 0.15 });
  })),

  /** Lightning hit: a close crack and a long rumble. */
  strike: () => play((g, t) => {
    noise(g, g.sfx, { type: 'highpass', freq: 1500, at: t, dur: 0.25, gain: 0.55, attack: 0.002 });
    noise(g, g.sfx, { type: 'highpass', freq: 900, at: t + 0.07, dur: 0.35, gain: 0.4, attack: 0.002 });
    noise(g, g.sfx, { type: 'lowpass', freq: 300, to: 80, at: t + 0.05, dur: 3.2, gain: 0.6, attack: 0.04 });
    tone(g, g.sfx, { freq: 70, to: 32, at: t + 0.03, dur: 1.4, gain: 0.45 });
  }),

  win: () => play((g, t) => {
    const notes: [number, number, number][] = [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.3]];
    for (const [m, at, dur] of notes) {
      tone(g, g.sfx, { type: 'square', freq: hz(m), at: t + at, dur, gain: 0.06, lp: 3500 });
      tone(g, g.sfx, { type: 'triangle', freq: hz(m - 12), at: t + at, dur, gain: 0.1 });
    }
    for (const m of [72, 76, 79, 84]) {
      tone(g, g.sfx, { type: 'square', freq: hz(m), at: t + 0.8, dur: 1.2, gain: 0.035, hold: 0.4, lp: 2500 });
    }
  }),

  lose: () => play((g, t) => {
    [72, 67, 64].forEach((m, i) => {
      tone(g, g.sfx, { type: 'triangle', freq: hz(m), at: t + i * 0.25, dur: i === 2 ? 0.9 : 0.3, gain: 0.1 });
    });
  }),

  coin: () => play((g, t) => {
    tone(g, g.sfx, { type: 'square', freq: hz(83), at: t, dur: 0.08, gain: 0.06, hold: 0.06, lp: 5000 });
    tone(g, g.sfx, { type: 'square', freq: hz(88), at: t + 0.08, dur: 0.4, gain: 0.06, hold: 0.05, lp: 5000 });
  }),

  connect: () => play((g, t) => {
    [84, 88, 91].forEach((m, i) => tone(g, g.sfx, { freq: hz(m), at: t + i * 0.06, dur: 0.9, gain: 0.08 }));
  }),
};
