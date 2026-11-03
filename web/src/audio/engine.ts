import { create } from 'zustand';

/**
 * Shared Web Audio graph. Every sound is synthesized, so there are no files to load or license.
 * Browsers block audio until a user gesture, so the graph is built on the first one (see bind.ts).
 */

const KEY = 'lastflag.sound';
const SFX_LEVEL = 0.55;
const MUSIC_LEVEL = 0.22;

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { sfxOn: v.sfxOn !== false, musicOn: v.musicOn !== false };
  } catch {
    return { sfxOn: true, musicOn: true };
  }
};

interface SoundStore {
  sfxOn: boolean;
  musicOn: boolean;
  toggleSfx: () => void;
  toggleMusic: () => void;
  /** Phone header has room for one button: mute everything, or bring everything back. */
  toggleAll: () => void;
}

export const useSound = create<SoundStore>((set) => ({
  ...load(),
  toggleSfx: () => set((s) => ({ sfxOn: !s.sfxOn })),
  toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
  toggleAll: () => set((s) => {
    const on = !(s.sfxOn || s.musicOn);
    return { sfxOn: on, musicOn: on };
  }),
}));

useSound.subscribe(({ sfxOn, musicOn }) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sfxOn, musicOn }));
  } catch {
    // storage blocked: the setting just lasts for this visit
  }
});

export interface Graph {
  ctx: AudioContext;
  sfx: GainNode;
  music: GainNode;
  noise: AudioBuffer;
}

let graph: Graph | null = null;

const makeNoise = (ctx: AudioContext) => {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
};

/** Fade the buses to match the toggles. */
export const applyLevels = () => {
  if (!graph) return;
  const { sfxOn, musicOn } = useSound.getState();
  const t = graph.ctx.currentTime;
  graph.sfx.gain.setTargetAtTime(sfxOn ? SFX_LEVEL : 0, t, 0.02);
  graph.music.gain.setTargetAtTime(musicOn ? MUSIC_LEVEL : 0, t, 0.3);
};

/** Build the graph (first call) and resume it. Call from a user gesture. */
export const unlock = () => {
  if (typeof AudioContext === 'undefined') return null;
  if (!graph) {
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.gain.value = 0;
    music.gain.value = 0;
    sfx.connect(comp);
    music.connect(comp);
    graph = { ctx, sfx, music, noise: makeNoise(ctx) };
    applyLevels();
  }
  if (graph.ctx.state === 'suspended' && !document.hidden) void graph.ctx.resume();
  return graph;
};

/** Pause all audio while the tab is hidden. */
export const suspend = () => {
  if (graph && graph.ctx.state === 'running') void graph.ctx.suspend();
};

/** The graph, when it exists and the tab is visible. Sounds scheduled while hidden would pile up. */
export const live = () => (graph && !document.hidden ? graph : null);

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the note. */
  to?: number;
  at: number;
  dur: number;
  gain: number;
  attack?: number;
  /** Hold the peak this long before the decay. */
  hold?: number;
  /** Lowpass cutoff. */
  lp?: number;
  detune?: number;
}

/** One enveloped oscillator note. */
export const tone = (g: Graph, dest: AudioNode, o: ToneOpts) => {
  const { ctx } = g;
  const attack = o.attack ?? 0.005;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, o.at);
  env.gain.linearRampToValueAtTime(o.gain, o.at + attack);
  env.gain.setValueAtTime(o.gain, o.at + attack + (o.hold ?? 0));
  env.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  let out: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    out = f;
  }
  out.connect(env).connect(dest);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.05);
};

interface NoiseOpts {
  at: number;
  dur: number;
  gain: number;
  type: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency over the sound. */
  to?: number;
  q?: number;
  attack?: number;
}

/** A burst of filtered noise: wind, cracks, rumbles. */
export const noise = (g: Graph, dest: AudioNode, o: NoiseOpts) => {
  const { ctx } = g;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q ?? 0.7;
  f.frequency.setValueAtTime(o.freq, o.at);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
  const env = ctx.createGain();
  const attack = o.attack ?? 0.005;
  env.gain.setValueAtTime(0, o.at);
  env.gain.linearRampToValueAtTime(o.gain, o.at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  src.connect(f).connect(env).connect(dest);
  src.start(o.at, Math.random() * 1.5);
  src.stop(o.at + o.dur + 0.05);
};
