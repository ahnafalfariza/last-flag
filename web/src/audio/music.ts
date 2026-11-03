import { hz, live, noise, tone, useSound, type Graph } from './engine';

/**
 * Generative background music. A light pentatonic loop while bidding is open,
 * a faster minor loop with a pulsing bass and drums during sudden death.
 * Notes are scheduled a little ahead of the audio clock so timing stays tight.
 */

export type Mood = 'day' | 'storm';

interface Style {
  bpm: number;
  /** Per bar: bass root, then the pad voicing. */
  chords: number[][];
  scale: number[];
  padCutoff: number;
  melodyChance: number;
}

const STYLES: Record<Mood, Style> = {
  // C  Am  F  G
  day: {
    bpm: 84,
    chords: [[36, 60, 64, 67], [33, 57, 60, 64], [29, 57, 60, 65], [31, 55, 59, 62]],
    scale: [72, 74, 76, 79, 81, 84],
    padCutoff: 1400,
    melodyChance: 0.4,
  },
  // Am  F  Dm  E
  storm: {
    bpm: 116,
    chords: [[33, 57, 60, 64], [29, 57, 60, 65], [26, 57, 62, 65], [28, 56, 59, 64]],
    scale: [69, 71, 72, 76, 77, 81],
    padCutoff: 700,
    melodyChance: 0.2,
  },
};

const LOOKAHEAD = 0.25;
const STEPS = 8;

let mood: Mood = 'day';
let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;
let bar = 0;
let note = 2;

const playStep = (g: Graph, at: number) => {
  const s = STYLES[mood];
  const stepDur = 60 / s.bpm / 2;
  const [root, ...pad] = s.chords[bar % s.chords.length];
  const out = g.music;

  if (step === 0) {
    const len = stepDur * STEPS;
    for (const m of pad) {
      for (const detune of [-7, 7]) {
        tone(g, out, { type: 'triangle', freq: hz(m), detune, at, dur: len + 0.4, gain: 0.05, attack: 0.5, hold: len - 0.8, lp: s.padCutoff });
      }
    }
  }

  if (mood === 'day') {
    if (step === 0 || step === 4) tone(g, out, { type: 'triangle', freq: hz(root + 12), at, dur: stepDur * 3.5, gain: 0.16, lp: 600 });
    if (step === 0) tone(g, out, { freq: 90, to: 45, at, dur: 0.25, gain: 0.25 });
    if (step % 2 === 1) noise(g, out, { type: 'highpass', freq: 7000, at, dur: 0.05, gain: 0.03 });
  } else {
    tone(g, out, { type: 'sawtooth', freq: hz(root + 12), at, dur: stepDur * 0.9, gain: 0.12, lp: 380 });
    if (step === 0 || step === 4) tone(g, out, { freq: 100, to: 40, at, dur: 0.3, gain: 0.5 });
    if (step === 2 || step === 6) noise(g, out, { type: 'bandpass', freq: 1800, q: 0.8, at, dur: 0.12, gain: 0.12 });
    if (step % 2 === 1) noise(g, out, { type: 'highpass', freq: 8000, at, dur: 0.04, gain: 0.04 });
  }

  if (Math.random() < s.melodyChance) {
    // Random walk on the scale, so the line moves by step more than by leap.
    note = Math.max(0, Math.min(s.scale.length - 1, note + Math.floor(Math.random() * 5) - 2));
    const type = mood === 'day' ? 'triangle' : 'sine';
    tone(g, out, { type, freq: hz(s.scale[note]), at, dur: stepDur * (mood === 'day' ? 1.6 : 2.5), gain: 0.07 });
  }

  nextAt = at + stepDur;
  step = (step + 1) % STEPS;
  if (step === 0) bar++;
};

const pump = () => {
  const g = live();
  if (!g) return;
  const now = g.ctx.currentTime;
  if (nextAt < now) nextAt = now + 0.05;
  while (nextAt < now + LOOKAHEAD) playStep(g, nextAt);
};

/** Start or stop the loop to match the toggle, the tab and the audio graph. */
const sync = () => {
  const run = useSound.getState().musicOn && live() !== null;
  if (run && !timer) {
    pump();
    timer = setInterval(pump, 60);
  } else if (!run && timer) {
    clearInterval(timer);
    timer = null;
  }
};

/** Switch loops, starting the new one on a fresh bar. */
const setMood = (m: Mood) => {
  if (m === mood) return;
  mood = m;
  step = 0;
  bar = 0;
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

export const music = { sync, setMood, stop };
