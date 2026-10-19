import type { DrumParams, EffectType, Envelope, Instrument, SynthParams } from "./types";

const env = (attack: number, decay: number, sustain: number, release: number): Envelope => ({
  attack,
  decay,
  sustain,
  release,
});

const baseSynth: SynthParams = {
  osc1: "sawtooth",
  osc2: "sawtooth",
  osc2Detune: 7,
  osc2Semitones: 0,
  oscMix: 0.5,
  subLevel: 0,
  noiseLevel: 0,
  filterType: "lowpass",
  cutoff: 2400,
  resonance: 1,
  filterEnvAmount: 1500,
  filterEnv: env(0.005, 0.3, 0.2, 0.3),
  ampEnv: env(0.005, 0.2, 0.8, 0.25),
  glide: 0,
  gain: 0.6,
};

export const SYNTH_PRESETS: Record<string, SynthParams> = {
  init: baseSynth,
  bass: {
    ...baseSynth,
    osc1: "sawtooth",
    osc2: "square",
    osc2Semitones: -12,
    oscMix: 0.35,
    subLevel: 0.6,
    cutoff: 380,
    resonance: 4,
    filterEnvAmount: 900,
    filterEnv: env(0.002, 0.18, 0.1, 0.1),
    ampEnv: env(0.003, 0.25, 0.7, 0.08),
    gain: 0.7,
  },
  subBass: {
    ...baseSynth,
    osc1: "sine",
    osc2: "triangle",
    oscMix: 0.15,
    cutoff: 220,
    resonance: 0.7,
    filterEnvAmount: 0,
    ampEnv: env(0.005, 0.1, 1, 0.12),
    gain: 0.8,
  },
  pad: {
    ...baseSynth,
    osc2Detune: 14,
    cutoff: 1400,
    resonance: 0.8,
    filterEnvAmount: 600,
    filterEnv: env(1.2, 1.5, 0.6, 2),
    ampEnv: env(0.9, 1.2, 0.8, 2.5),
    gain: 0.45,
  },
  lead: {
    ...baseSynth,
    osc1: "square",
    osc2: "sawtooth",
    osc2Detune: 10,
    cutoff: 3200,
    resonance: 3,
    filterEnvAmount: 2500,
    filterEnv: env(0.003, 0.25, 0.4, 0.2),
    ampEnv: env(0.004, 0.15, 0.85, 0.2),
    glide: 0.04,
    gain: 0.5,
  },
  pluck: {
    ...baseSynth,
    osc1: "sawtooth",
    osc2: "triangle",
    cutoff: 900,
    resonance: 2,
    filterEnvAmount: 4500,
    filterEnv: env(0.001, 0.18, 0, 0.15),
    ampEnv: env(0.001, 0.35, 0, 0.25),
    gain: 0.6,
  },
  keys: {
    ...baseSynth,
    osc1: "triangle",
    osc2: "sine",
    osc2Semitones: 12,
    oscMix: 0.3,
    cutoff: 2600,
    resonance: 0.7,
    filterEnvAmount: 1200,
    filterEnv: env(0.002, 0.6, 0.2, 0.4),
    ampEnv: env(0.003, 1.2, 0.3, 0.5),
    gain: 0.55,
  },
};

export const DRUM_PRESETS: Record<string, DrumParams> = {
  default: {
    kickTune: 52,
    kickDecay: 0.45,
    kickPunch: 0.6,
    snareTone: 185,
    snareDecay: 0.18,
    snareNoise: 0.7,
    hatDecay: 0.06,
    hatTone: 7500,
    clapDecay: 0.2,
    tomTune: 110,
    gain: 0.8,
  },
  "808": {
    kickTune: 45,
    kickDecay: 1.2,
    kickPunch: 0.3,
    snareTone: 230,
    snareDecay: 0.14,
    snareNoise: 0.55,
    hatDecay: 0.045,
    hatTone: 8500,
    clapDecay: 0.25,
    tomTune: 95,
    gain: 0.8,
  },
  techno: {
    kickTune: 48,
    kickDecay: 0.55,
    kickPunch: 0.9,
    snareTone: 200,
    snareDecay: 0.12,
    snareNoise: 0.85,
    hatDecay: 0.035,
    hatTone: 9000,
    clapDecay: 0.18,
    tomTune: 120,
    gain: 0.8,
  },
};

// Correspondance General MIDI utilisée par la batterie synthétique.
export const DRUM_MAP: Record<number, string> = {
  36: "kick",
  38: "snare",
  37: "rim",
  39: "clap",
  42: "closedHat",
  44: "pedalHat",
  46: "openHat",
  41: "tomLow",
  45: "tomMid",
  48: "tomHigh",
  49: "crash",
  51: "ride",
};

export function makeInstrument(kind: "synth" | "drums", preset?: string): Instrument {
  if (kind === "drums") {
    const name = preset && DRUM_PRESETS[preset] ? preset : "default";
    return { kind, preset: name, params: { ...DRUM_PRESETS[name] } };
  }
  const name = preset && SYNTH_PRESETS[preset] ? preset : "init";
  const p = SYNTH_PRESETS[name];
  return {
    kind,
    preset: name,
    params: { ...p, filterEnv: { ...p.filterEnv }, ampEnv: { ...p.ampEnv } },
  };
}

export const EFFECT_DEFAULTS: Record<EffectType, Record<string, number>> = {
  // Gains en dB, fréquences en Hz
  eq: { lowCut: 20, lowGain: 0, lowFreq: 120, midGain: 0, midFreq: 1000, midQ: 1, highGain: 0, highFreq: 8000 },
  compressor: { threshold: -18, ratio: 4, attack: 0.01, release: 0.15, knee: 6, makeup: 0 },
  reverb: { size: 2.2, decay: 2.5, preDelay: 0.02, damping: 6000, mix: 0.25 },
  // time en beats (0.75 = croche pointée)
  delay: { time: 0.75, feedback: 0.35, tone: 4000, mix: 0.25 },
  filter: { type: 0, cutoff: 1200, resonance: 1, mix: 1 }, // type 0=LP 1=HP 2=BP
  distortion: { drive: 0.4, tone: 5000, mix: 0.5 },
  chorus: { rate: 0.8, depth: 0.004, mix: 0.4 },
};

export const TRACK_COLORS = ["#f2a65a", "#5ab0f2", "#9b7bf2", "#5ad1a4", "#f25a7d", "#e2d35a", "#5ae2e2", "#c98af2"];
