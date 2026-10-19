// Outils exposés à l'agent. Les définitions sont neutres (nom, description, schéma JSON)
// pour servir à la fois au fournisseur Anthropic et au fournisseur local (LM Studio).
// Les entrées arrivent en streaming (eager_input_streaming) donc ne sont pas validées par
// le serveur : chaque exécuteur valide lui-même et lève une erreur lisible par le modèle.

import { renderProject, measure } from "../engine/render";
import { addClip, addEffect, addTrack, findClip, findTrack, pickKnown, sanitizeNotes } from "../state/ops";
import { DRUM_PRESETS, EFFECT_DEFAULTS, SYNTH_PRESETS, makeInstrument } from "../state/presets";
import { projectNow, useProject } from "../state/store";
import type { EffectType, Note, Project } from "../state/types";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

type Input = Record<string, unknown>;

const NOTE_SCHEMA = {
  type: "array",
  description: "Notes MIDI. start et dur en beats (noires) relatifs au début du clip.",
  items: {
    type: "object",
    properties: {
      pitch: { type: "integer", description: "Hauteur MIDI (60 = C4)" },
      start: { type: "number" },
      dur: { type: "number" },
      vel: { type: "integer", description: "Vélocité 1-127" },
    },
    required: ["pitch", "start", "dur", "vel"],
  },
};

const EFFECT_TYPES = Object.keys(EFFECT_DEFAULTS) as EffectType[];

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_project",
    description:
      "Renvoie l'état complet du projet : tempo, pistes, instruments et leurs paramètres, effets, clips. Les notes ne sont incluses que si include_notes est vrai.",
    input_schema: { type: "object", properties: { include_notes: { type: "boolean" } } },
  },
  {
    name: "get_clip",
    description: "Renvoie toutes les notes d'un clip.",
    input_schema: { type: "object", properties: { clip_id: { type: "string" } }, required: ["clip_id"] },
  },
  {
    name: "set_song",
    description: "Modifie les réglages globaux : nom, tempo, longueur, boucle, volume master (dB), limiteur master.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        bpm: { type: "number" },
        length_bars: { type: "integer" },
        loop_enabled: { type: "boolean" },
        loop_start_bar: { type: "integer" },
        loop_end_bar: { type: "integer" },
        master_volume_db: { type: "number" },
        master_limiter: { type: "boolean" },
      },
    },
  },
  {
    name: "create_track",
    description: `Crée une piste. kind "synth" (presets : ${Object.keys(SYNTH_PRESETS).join(", ")}) ou "drums" (presets : ${Object.keys(DRUM_PRESETS).join(", ")}). Renvoie l'id de la piste.`,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["synth", "drums"] },
        preset: { type: "string" },
      },
      required: ["name", "kind"],
    },
  },
  {
    name: "update_track",
    description: "Modifie le nom, le volume (dB, -60 à +6), le pan (-1 à 1), mute, solo ou la couleur d'une piste.",
    input_schema: {
      type: "object",
      properties: {
        track_id: { type: "string" },
        name: { type: "string" },
        volume_db: { type: "number" },
        pan: { type: "number" },
        mute: { type: "boolean" },
        solo: { type: "boolean" },
        color: { type: "string" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "delete_track",
    description: "Supprime une piste et ses clips.",
    input_schema: { type: "object", properties: { track_id: { type: "string" } }, required: ["track_id"] },
  },
  {
    name: "set_instrument",
    description:
      "Change le son d'une piste. preset remplace tous les paramètres par ceux du preset ; params modifie ensuite des paramètres individuels (fusion partielle, y compris pour ampEnv/filterEnv). Synth : osc1, osc2 (sine|triangle|sawtooth|square), osc2Detune (cents), osc2Semitones, oscMix 0-1, subLevel 0-1, noiseLevel 0-1, filterType (lowpass|highpass|bandpass), cutoff Hz, resonance (Q), filterEnvAmount Hz, filterEnv/ampEnv {attack, decay, sustain 0-1, release} en secondes, glide s, gain 0-1. Drums : kickTune, kickDecay, kickPunch, snareTone, snareDecay, snareNoise, hatDecay, hatTone, clapDecay, tomTune, gain.",
    input_schema: {
      type: "object",
      properties: {
        track_id: { type: "string" },
        preset: { type: "string" },
        params: { type: "object" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "create_clip",
    description:
      "Crée un clip MIDI sur une piste, avec ses notes éventuelles. start_bar est 0-indexé. Les clips d'une même piste ne peuvent pas se chevaucher. Renvoie l'id du clip.",
    input_schema: {
      type: "object",
      properties: {
        track_id: { type: "string" },
        start_bar: { type: "integer" },
        length_bars: { type: "number" },
        name: { type: "string" },
        notes: NOTE_SCHEMA,
      },
      required: ["track_id", "start_bar", "length_bars"],
    },
  },
  {
    name: "write_notes",
    description: "Écrit des notes dans un clip existant. mode replace (défaut) remplace tout, append ajoute.",
    input_schema: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        notes: NOTE_SCHEMA,
        mode: { type: "string", enum: ["replace", "append"] },
      },
      required: ["clip_id", "notes"],
    },
  },
  {
    name: "edit_clip",
    description: "Déplace, redimensionne ou renomme un clip.",
    input_schema: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        start_bar: { type: "integer" },
        length_bars: { type: "number" },
        name: { type: "string" },
      },
      required: ["clip_id"],
    },
  },
  {
    name: "duplicate_clip",
    description: "Copie un clip (notes comprises) aux mesures indiquées sur la même piste. Renvoie les ids créés.",
    input_schema: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        to_bars: { type: "array", items: { type: "integer" } },
      },
      required: ["clip_id", "to_bars"],
    },
  },
  {
    name: "delete_clip",
    description: "Supprime un clip.",
    input_schema: { type: "object", properties: { clip_id: { type: "string" } }, required: ["clip_id"] },
  },
  {
    name: "add_effect",
    description: `Ajoute un effet en fin de chaîne d'une piste (ou à la position donnée). Types et paramètres par défaut : ${EFFECT_TYPES.map((t) => `${t} ${JSON.stringify(EFFECT_DEFAULTS[t])}`).join(" ; ")}. Gains en dB, fréquences en Hz, delay.time en beats, filter.type 0=LP 1=HP 2=BP, mix 0-1.`,
    input_schema: {
      type: "object",
      properties: {
        track_id: { type: "string" },
        type: { type: "string", enum: EFFECT_TYPES },
        params: { type: "object" },
        position: { type: "integer" },
      },
      required: ["track_id", "type"],
    },
  },
  {
    name: "update_effect",
    description: "Modifie les paramètres d'un effet ou le bypass.",
    input_schema: {
      type: "object",
      properties: {
        track_id: { type: "string" },
        effect_id: { type: "string" },
        params: { type: "object" },
        bypass: { type: "boolean" },
      },
      required: ["track_id", "effect_id"],
    },
  },
  {
    name: "remove_effect",
    description: "Retire un effet d'une piste.",
    input_schema: {
      type: "object",
      properties: { track_id: { type: "string" }, effect_id: { type: "string" } },
      required: ["track_id", "effect_id"],
    },
  },
  {
    name: "analyze_mix",
    description:
      "Rend le projet hors temps réel et mesure le crête et le RMS (dBFS) du master et de chaque piste en solo, sur la plage de mesures donnée (par défaut la boucle, sinon tout le morceau). À utiliser pour équilibrer un mix sur des mesures plutôt qu'à l'aveugle.",
    input_schema: {
      type: "object",
      properties: { from_bar: { type: "integer" }, to_bar: { type: "integer" } },
    },
  },
];

// ---------- validation ----------

function str(i: Input, k: string, required = false): string | undefined {
  const v = i[k];
  if (v === undefined || v === null) {
    if (required) throw new Error(`Champ requis manquant : ${k}`);
    return undefined;
  }
  if (typeof v !== "string") throw new Error(`${k} doit être une chaîne`);
  return v;
}

function num(i: Input, k: string, required = false): number | undefined {
  const v = i[k];
  if (v === undefined || v === null) {
    if (required) throw new Error(`Champ requis manquant : ${k}`);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${k} doit être un nombre`);
  return v;
}

function bool(i: Input, k: string): boolean | undefined {
  const v = i[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new Error(`${k} doit être un booléen`);
  return v;
}

function notes(i: Input, k: string, required = false): Note[] | undefined {
  const v = i[k];
  if (v === undefined || v === null) {
    if (required) throw new Error(`Champ requis manquant : ${k}`);
    return undefined;
  }
  if (!Array.isArray(v)) throw new Error(`${k} doit être un tableau de notes`);
  v.forEach((n, idx) => {
    if (typeof n !== "object" || n === null) throw new Error(`Note ${idx} invalide`);
    for (const f of ["pitch", "start", "dur"]) {
      if (typeof (n as Input)[f] !== "number") throw new Error(`Note ${idx} : ${f} manquant ou non numérique`);
    }
  });
  return v as Note[];
}

function obj(i: Input, k: string): Record<string, unknown> | undefined {
  const v = i[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${k} doit être un objet`);
  return v as Record<string, unknown>;
}

// ---------- vues compactes du projet pour le modèle ----------

export function projectSummary(p: Project, includeNotes = false) {
  return {
    name: p.name,
    bpm: p.bpm,
    beatsPerBar: p.beatsPerBar,
    lengthBars: p.lengthBars,
    loop: p.loop,
    master: p.master,
    tracks: p.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      volume_db: t.volume,
      pan: t.pan,
      mute: t.mute,
      solo: t.solo,
      instrument: t.instrument,
      effects: t.effects,
      clips: t.clips.map((c) => ({
        id: c.id,
        name: c.name,
        start_bar: c.startBar,
        length_bars: c.lengthBars,
        ...(includeNotes ? { notes: c.notes } : { note_count: c.notes.length }),
      })),
    })),
  };
}

// Résumé très court injecté à chaque message utilisateur (ids utiles sans appel d'outil).
export function projectBrief(p: Project): string {
  const lines = [`"${p.name}" ${p.bpm} BPM, ${p.beatsPerBar}/4, ${p.lengthBars} mesures, boucle ${p.loop.enabled ? `${p.loop.startBar}-${p.loop.endBar}` : "off"}`];
  for (const t of p.tracks) {
    const clips = t.clips.map((c) => `${c.id}@${c.startBar}+${c.lengthBars}`).join(" ");
    lines.push(`- ${t.id} "${t.name}" ${t.instrument.kind}/${t.instrument.preset} ${t.volume}dB fx[${t.effects.map((e) => `${e.id}:${e.type}`).join(",")}] clips[${clips}]`);
  }
  return lines.join("\n");
}

// ---------- exécution ----------

const edit = (fn: (p: Project) => void) => useProject.getState().edit(fn);

export async function runTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "get_project":
      return JSON.stringify(projectSummary(projectNow(), bool(input, "include_notes") ?? false));

    case "get_clip": {
      const { clip } = findClip(projectNow(), str(input, "clip_id", true)!);
      return JSON.stringify(clip);
    }

    case "set_song": {
      edit((p) => {
        const name = str(input, "name");
        const bpm = num(input, "bpm");
        const len = num(input, "length_bars");
        const le = bool(input, "loop_enabled");
        const ls = num(input, "loop_start_bar");
        const lend = num(input, "loop_end_bar");
        const mv = num(input, "master_volume_db");
        const lim = bool(input, "master_limiter");
        if (name !== undefined) p.name = name;
        if (bpm !== undefined) {
          if (bpm < 20 || bpm > 300) throw new Error("bpm doit être entre 20 et 300");
          p.bpm = bpm;
        }
        if (len !== undefined) p.lengthBars = Math.max(1, Math.round(len));
        if (le !== undefined) p.loop.enabled = le;
        if (ls !== undefined) p.loop.startBar = Math.max(0, Math.round(ls));
        if (lend !== undefined) p.loop.endBar = Math.round(lend);
        if (p.loop.endBar <= p.loop.startBar) throw new Error("loop_end_bar doit être > loop_start_bar");
        if (mv !== undefined) p.master.volume = Math.min(6, mv);
        if (lim !== undefined) p.master.limiter = lim;
      });
      return "ok";
    }

    case "create_track": {
      const kind = str(input, "kind", true);
      if (kind !== "synth" && kind !== "drums") throw new Error('kind doit être "synth" ou "drums"');
      let id = "";
      edit((p) => {
        id = addTrack(p, { name: str(input, "name", true)!, kind, preset: str(input, "preset") }).id;
      });
      return JSON.stringify({ track_id: id });
    }

    case "update_track": {
      edit((p) => {
        const t = findTrack(p, str(input, "track_id", true)!);
        const name = str(input, "name");
        const vol = num(input, "volume_db");
        const pan = num(input, "pan");
        const mute = bool(input, "mute");
        const solo = bool(input, "solo");
        const color = str(input, "color");
        if (name !== undefined) t.name = name;
        if (vol !== undefined) t.volume = Math.max(-60, Math.min(6, vol));
        if (pan !== undefined) t.pan = Math.max(-1, Math.min(1, pan));
        if (mute !== undefined) t.mute = mute;
        if (solo !== undefined) t.solo = solo;
        if (color !== undefined) t.color = color;
      });
      return "ok";
    }

    case "delete_track": {
      const id = str(input, "track_id", true)!;
      edit((p) => {
        findTrack(p, id);
        p.tracks = p.tracks.filter((t) => t.id !== id);
      });
      return "ok";
    }

    case "set_instrument": {
      edit((p) => {
        const t = findTrack(p, str(input, "track_id", true)!);
        const preset = str(input, "preset");
        if (preset !== undefined) {
          const presets = t.instrument.kind === "synth" ? SYNTH_PRESETS : DRUM_PRESETS;
          if (!presets[preset]) throw new Error(`Preset inconnu pour ${t.instrument.kind} : ${preset}. Disponibles : ${Object.keys(presets).join(", ")}`);
          t.instrument = makeInstrument(t.instrument.kind, preset);
        }
        const params = obj(input, "params");
        if (params) mergeParams(t.instrument.params as unknown as Record<string, unknown>, params, "");
      });
      return "ok";
    }

    case "create_clip": {
      let id = "";
      edit((p) => {
        id = addClip(p, str(input, "track_id", true)!, {
          startBar: num(input, "start_bar", true)!,
          lengthBars: num(input, "length_bars", true)!,
          name: str(input, "name"),
          notes: notes(input, "notes"),
        }).id;
      });
      return JSON.stringify({ clip_id: id });
    }

    case "write_notes": {
      let count = 0;
      edit((p) => {
        const { clip } = findClip(p, str(input, "clip_id", true)!);
        const incoming = notes(input, "notes", true)!;
        const mode = str(input, "mode") ?? "replace";
        const merged = mode === "append" ? [...clip.notes, ...incoming] : incoming;
        clip.notes = sanitizeNotes(merged, clip.lengthBars * p.beatsPerBar);
        count = clip.notes.length;
      });
      return JSON.stringify({ note_count: count });
    }

    case "edit_clip": {
      edit((p) => {
        const { track, clip } = findClip(p, str(input, "clip_id", true)!);
        const sb = num(input, "start_bar");
        const lb = num(input, "length_bars");
        const name = str(input, "name");
        if (name !== undefined) clip.name = name;
        if (sb !== undefined || lb !== undefined) {
          const ns = sb !== undefined ? Math.max(0, Math.round(sb)) : clip.startBar;
          const nl = lb ?? clip.lengthBars;
          if (nl <= 0) throw new Error("length_bars doit être > 0");
          const clash = track.clips.find((c) => c !== clip && ns < c.startBar + c.lengthBars && c.startBar < ns + nl);
          if (clash) throw new Error(`Chevauchement avec ${clash.id}`);
          clip.startBar = ns;
          clip.lengthBars = nl;
          clip.notes = sanitizeNotes(clip.notes, nl * p.beatsPerBar);
          track.clips.sort((a, b) => a.startBar - b.startBar);
          p.lengthBars = Math.max(p.lengthBars, ns + nl);
        }
      });
      return "ok";
    }

    case "duplicate_clip": {
      const ids: string[] = [];
      edit((p) => {
        const { track, clip } = findClip(p, str(input, "clip_id", true)!);
        const bars = input.to_bars;
        if (!Array.isArray(bars) || !bars.every((b) => typeof b === "number")) throw new Error("to_bars doit être un tableau d'entiers");
        for (const b of bars as number[]) {
          ids.push(addClip(p, track.id, { startBar: b, lengthBars: clip.lengthBars, name: clip.name, notes: clip.notes }).id);
        }
      });
      return JSON.stringify({ clip_ids: ids });
    }

    case "delete_clip": {
      edit((p) => {
        const { track, clip } = findClip(p, str(input, "clip_id", true)!);
        track.clips = track.clips.filter((c) => c !== clip);
      });
      return "ok";
    }

    case "add_effect": {
      const type = str(input, "type", true) as EffectType;
      let id = "";
      edit((p) => {
        const trackId = str(input, "track_id", true)!;
        const fx = addEffect(p, trackId, type, obj(input, "params") as Record<string, number> | undefined);
        const pos = num(input, "position");
        if (pos !== undefined) {
          const t = findTrack(p, trackId);
          t.effects.pop();
          t.effects.splice(Math.max(0, Math.min(t.effects.length, pos)), 0, fx);
        }
        id = fx.id;
      });
      return JSON.stringify({ effect_id: id });
    }

    case "update_effect": {
      edit((p) => {
        const t = findTrack(p, str(input, "track_id", true)!);
        const fxId = str(input, "effect_id", true)!;
        const fx = t.effects.find((e) => e.id === fxId);
        if (!fx) throw new Error(`Effet introuvable : ${fxId}`);
        Object.assign(fx.params, pickKnown(fx.type, obj(input, "params") as Record<string, number> | undefined));
        const bypass = bool(input, "bypass");
        if (bypass !== undefined) fx.bypass = bypass;
      });
      return "ok";
    }

    case "remove_effect": {
      edit((p) => {
        const t = findTrack(p, str(input, "track_id", true)!);
        const fxId = str(input, "effect_id", true)!;
        if (!t.effects.some((e) => e.id === fxId)) throw new Error(`Effet introuvable : ${fxId}`);
        t.effects = t.effects.filter((e) => e.id !== fxId);
      });
      return "ok";
    }

    case "analyze_mix":
      return JSON.stringify(await analyzeMix(projectNow(), num(input, "from_bar"), num(input, "to_bar")));

    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}

// Fusion récursive avec contrôle des clés : une clé inconnue est une erreur, pas un ajout silencieux.
function mergeParams(target: Record<string, unknown>, patch: Record<string, unknown>, path: string) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in target)) throw new Error(`Paramètre inconnu : ${path}${k}. Valides : ${Object.keys(target).join(", ")}`);
    const cur = target[k];
    if (typeof cur === "object" && cur !== null) {
      if (typeof v !== "object" || v === null) throw new Error(`${path}${k} doit être un objet`);
      mergeParams(cur as Record<string, unknown>, v as Record<string, unknown>, `${path}${k}.`);
    } else if (typeof cur !== typeof v) {
      throw new Error(`${path}${k} doit être de type ${typeof cur}`);
    } else {
      target[k] = v;
    }
  }
}

async function analyzeMix(p: Project, fromBar?: number, toBar?: number) {
  const from = fromBar ?? (p.loop.enabled ? p.loop.startBar : 0);
  const to = toBar ?? (p.loop.enabled ? p.loop.endBar : p.lengthBars);
  const master = measure(await renderProject(p, { fromBar: from, toBar: to }));
  const tracks = [];
  for (const t of p.tracks) {
    if (t.mute) continue;
    // Solo isolé sur une copie : le projet réel n'est pas touché
    const solo = structuredClone(p);
    for (const o of solo.tracks) o.solo = o.id === t.id;
    tracks.push({ track_id: t.id, name: t.name, ...measure(await renderProject(solo, { fromBar: from, toBar: to })) });
  }
  return { range_bars: [from, to], master, tracks, note: "dBFS. RMS calculé sur toute la plage, queue de 3 s incluse." };
}
