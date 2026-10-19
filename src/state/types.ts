// Modèle de projet : source de vérité unique, sérialisable en JSON.
// L'interface, le moteur audio et l'agent lisent et modifient ce même objet.
// Unités : positions de clips en mesures (bars), notes en temps (beats) relatifs au clip.

export type Waveform = "sine" | "triangle" | "sawtooth" | "square";
export type FilterType = "lowpass" | "highpass" | "bandpass";

export interface Envelope {
  attack: number; // secondes
  decay: number;
  sustain: number; // 0..1
  release: number;
}

export interface SynthParams {
  osc1: Waveform;
  osc2: Waveform;
  osc2Detune: number; // cents
  osc2Semitones: number;
  oscMix: number; // 0 = osc1 seul, 1 = osc2 seul
  subLevel: number; // 0..1, sinus une octave en dessous
  noiseLevel: number; // 0..1
  filterType: FilterType;
  cutoff: number; // Hz
  resonance: number; // Q
  filterEnvAmount: number; // Hz ajoutés au cutoff au pic de l'enveloppe
  filterEnv: Envelope;
  ampEnv: Envelope;
  glide: number; // secondes (0 = off)
  gain: number; // 0..1
}

export interface DrumParams {
  kickTune: number; // Hz de base
  kickDecay: number; // s
  kickPunch: number; // 0..1
  snareTone: number; // Hz
  snareDecay: number;
  snareNoise: number; // 0..1
  hatDecay: number;
  hatTone: number; // Hz (filtre passe-haut)
  clapDecay: number;
  tomTune: number;
  gain: number;
}

export type InstrumentKind = "synth" | "drums";

export type Instrument =
  | { kind: "synth"; preset: string; params: SynthParams }
  | { kind: "drums"; preset: string; params: DrumParams };

export type EffectType = "eq" | "compressor" | "reverb" | "delay" | "filter" | "distortion" | "chorus";

export interface Effect {
  id: string;
  type: EffectType;
  bypass: boolean;
  params: Record<string, number>;
}

export interface Note {
  pitch: number; // MIDI 0..127
  start: number; // beats depuis le début du clip
  dur: number; // beats
  vel: number; // 1..127
}

export interface Clip {
  id: string;
  name: string;
  startBar: number; // 0-indexé
  lengthBars: number;
  notes: Note[];
}

export interface Track {
  id: string;
  name: string;
  color: string;
  instrument: Instrument;
  clips: Clip[];
  volume: number; // dB
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  effects: Effect[];
}

export interface Project {
  name: string;
  bpm: number;
  beatsPerBar: number;
  lengthBars: number;
  loop: { enabled: boolean; startBar: number; endBar: number };
  master: { volume: number; limiter: boolean };
  tracks: Track[];
}
