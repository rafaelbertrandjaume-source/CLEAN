// Opérations sur le projet, partagées par l'interface et l'agent.
// Chaque fonction mute un brouillon et lève une erreur explicite si l'entrée est invalide :
// le message remonte tel quel à l'agent pour qu'il se corrige.

import { EFFECT_DEFAULTS, TRACK_COLORS, makeInstrument } from "./presets";
import type { Clip, Effect, EffectType, Note, Project, Track } from "./types";

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function findTrack(p: Project, trackId: string): Track {
  const t = p.tracks.find((t) => t.id === trackId);
  if (!t) throw new Error(`Piste introuvable : ${trackId}`);
  return t;
}

export function findClip(p: Project, clipId: string): { track: Track; clip: Clip } {
  for (const track of p.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  throw new Error(`Clip introuvable : ${clipId}`);
}

export function addTrack(
  p: Project,
  opts: { name: string; kind: "synth" | "drums"; preset?: string; color?: string },
): Track {
  const track: Track = {
    id: uid("trk"),
    name: opts.name,
    color: opts.color ?? TRACK_COLORS[p.tracks.length % TRACK_COLORS.length],
    instrument: makeInstrument(opts.kind, opts.preset),
    clips: [],
    volume: -3,
    pan: 0,
    mute: false,
    solo: false,
    effects: [],
  };
  p.tracks.push(track);
  return track;
}

export function sanitizeNotes(notes: Note[], clipBeats: number): Note[] {
  return notes
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.start) && Number.isFinite(n.dur))
    .map((n) => ({
      pitch: clamp(Math.round(n.pitch), 0, 127),
      start: clamp(n.start, 0, clipBeats),
      dur: clamp(n.dur, 1 / 64, clipBeats),
      vel: clamp(Math.round(n.vel ?? 100), 1, 127),
    }))
    .filter((n) => n.start < clipBeats)
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

export function addClip(
  p: Project,
  trackId: string,
  opts: { startBar: number; lengthBars: number; name?: string; notes?: Note[] },
): Clip {
  const track = findTrack(p, trackId);
  if (opts.lengthBars <= 0) throw new Error("lengthBars doit être > 0");
  const start = Math.max(0, Math.floor(opts.startBar));
  const end = start + opts.lengthBars;
  const overlap = track.clips.find((c) => start < c.startBar + c.lengthBars && c.startBar < end);
  if (overlap) {
    throw new Error(
      `Chevauchement avec le clip ${overlap.id} (mesures ${overlap.startBar}-${overlap.startBar + overlap.lengthBars}) sur la piste ${track.name}`,
    );
  }
  const clip: Clip = {
    id: uid("clp"),
    name: opts.name ?? track.name,
    startBar: start,
    lengthBars: opts.lengthBars,
    notes: sanitizeNotes(opts.notes ?? [], opts.lengthBars * p.beatsPerBar),
  };
  track.clips.push(clip);
  track.clips.sort((a, b) => a.startBar - b.startBar);
  p.lengthBars = Math.max(p.lengthBars, end);
  return clip;
}

export function addEffect(p: Project, trackId: string, type: EffectType, params?: Record<string, number>): Effect {
  const track = findTrack(p, trackId);
  if (!EFFECT_DEFAULTS[type]) throw new Error(`Type d'effet inconnu : ${type}`);
  const fx: Effect = { id: uid("fx"), type, bypass: false, params: { ...EFFECT_DEFAULTS[type], ...pickKnown(type, params) } };
  track.effects.push(fx);
  return fx;
}

export function pickKnown(type: EffectType, params?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (!(k in EFFECT_DEFAULTS[type])) throw new Error(`Paramètre inconnu pour ${type} : ${k}. Valides : ${Object.keys(EFFECT_DEFAULTS[type]).join(", ")}`);
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Valeur non numérique pour ${type}.${k}`);
    out[k] = v;
  }
  return out;
}

export const beatsToSeconds = (beats: number, bpm: number) => (beats * 60) / bpm;
