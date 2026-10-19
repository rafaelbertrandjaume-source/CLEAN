// Instruments synthétiques en Web Audio pur. Chaque note crée ses propres nœuds
// (polyphonie illimitée) et se nettoie seule à la fin de sa release.
// Phase 2 : ces instruments natifs cohabiteront avec des instruments Faust générés.

import { DRUM_MAP } from "../state/presets";
import type { DrumParams, Envelope, SynthParams } from "../state/types";

export interface Voice {
  kill: (when: number) => void;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

export const midiToHz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

// Enveloppe ADSR sans cancelAndHoldAtTime (absent de WebKit, donc de Tauri sur macOS) :
// la valeur au moment du relâchement est calculée analytiquement.
function applyEnvelope(
  param: AudioParam,
  env: Envelope,
  t: number,
  dur: number,
  base: number,
  peak: number,
): number {
  const a = Math.min(Math.max(env.attack, 0.001), dur);
  const tc = Math.max(env.decay, 0.001) / 3;
  const sus = base + (peak - base) * env.sustain;
  const tr = t + dur;
  param.setValueAtTime(base, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(sus, t + a, tc);
  const atRelease = sus + (peak - sus) * Math.exp(-(tr - t - a) / tc);
  param.setValueAtTime(atRelease, tr);
  param.setTargetAtTime(base, tr, Math.max(env.release, 0.005) / 4);
  return tr + Math.max(env.release, 0.005) * 1.2 + 0.05;
}

export class SynthInstrument {
  private lastHz: number | null = null;

  playNote(
    ctx: BaseAudioContext,
    dest: AudioNode,
    p: SynthParams,
    pitch: number,
    t: number,
    dur: number,
    vel: number,
  ): Voice {
    const hz = midiToHz(pitch);
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = p.filterType;
    filter.Q.value = p.resonance;
    filter.connect(amp).connect(dest);

    const sources: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, mult: number, detuneCents: number, level: number) => {
      if (level <= 0) return;
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detuneCents;
      if (p.glide > 0 && this.lastHz) {
        o.frequency.setValueAtTime(this.lastHz * mult, t);
        o.frequency.exponentialRampToValueAtTime(hz * mult, t + p.glide);
      } else {
        o.frequency.setValueAtTime(hz * mult, t);
      }
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(filter);
      sources.push(o);
    };
    osc(p.osc1, 1, 0, 1 - p.oscMix);
    osc(p.osc2, 1, p.osc2Semitones * 100 + p.osc2Detune, p.oscMix);
    osc("sine", 0.5, 0, p.subLevel);
    if (p.noiseLevel > 0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx);
      n.loop = true;
      const g = ctx.createGain();
      g.gain.value = p.noiseLevel * 0.5;
      n.connect(g).connect(filter);
      sources.push(n);
    }
    this.lastHz = hz;

    const velGain = (vel / 127) * p.gain * 0.7;
    const end = applyEnvelope(amp.gain, p.ampEnv, t, dur, 0, velGain);
    const cutBase = clampHz(p.cutoff);
    applyEnvelope(filter.frequency, p.filterEnv, t, dur, cutBase, clampHz(p.cutoff + p.filterEnvAmount));

    for (const s of sources) {
      s.start(t);
      s.stop(end);
    }
    sources[sources.length - 1]?.addEventListener("ended", () => amp.disconnect());

    return {
      kill: (when) => {
        amp.gain.cancelScheduledValues(when);
        amp.gain.setTargetAtTime(0, when, 0.01);
        for (const s of sources) {
          try {
            s.stop(when + 0.06);
          } catch {
            /* déjà arrêtée */
          }
        }
      },
    };
  }
}

const clampHz = (hz: number) => Math.min(20000, Math.max(20, hz));

export class DrumInstrument {
  playNote(
    ctx: BaseAudioContext,
    dest: AudioNode,
    p: DrumParams,
    pitch: number,
    t: number,
    _dur: number,
    vel: number,
  ): Voice {
    const out = ctx.createGain();
    out.gain.value = (vel / 127) * p.gain;
    out.connect(dest);
    const sources: AudioScheduledSourceNode[] = [];
    let end = t + 0.1;
    let last: AudioScheduledSourceNode | null = null;
    const track = (src: AudioScheduledSourceNode, stopAt: number) => {
      sources.push(src);
      if (stopAt >= end) {
        end = stopAt;
        last = src;
      }
    };

    const tone = (type: OscillatorType, f0: number, f1: number, sweep: number, decay: number, level: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + sweep);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.02);
      track(o, t + decay + 0.02);
    };

    const noise = (
      ftype: BiquadFilterType,
      freq: number,
      q: number,
      decay: number,
      level: number,
      offset = 0,
    ) => {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx);
      const f = ctx.createBiquadFilter();
      f.type = ftype;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      const t0 = t + offset;
      g.gain.setValueAtTime(level, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      n.connect(f).connect(g).connect(out);
      n.start(t0, Math.random());
      n.stop(t0 + decay + 0.02);
      track(n, t0 + decay + 0.02);
    };

    switch (DRUM_MAP[pitch]) {
      case "kick":
        tone("sine", p.kickTune * (1 + p.kickPunch * 5), p.kickTune, 0.06, p.kickDecay, 1);
        noise("highpass", 3000, 0.7, 0.012, 0.4 * p.kickPunch);
        break;
      case "snare":
        tone("triangle", p.snareTone * 1.6, p.snareTone, 0.03, p.snareDecay * 0.7, 0.6 * (1 - p.snareNoise * 0.5));
        noise("highpass", 1400, 0.8, p.snareDecay, 0.7 * p.snareNoise);
        break;
      case "rim":
        tone("square", 1700, 1600, 0.005, 0.03, 0.4);
        break;
      case "clap":
        for (const off of [0, 0.011, 0.022]) noise("bandpass", 1200, 1.5, 0.012, 0.8, off);
        noise("bandpass", 1100, 1.2, p.clapDecay, 0.7, 0.03);
        break;
      case "closedHat":
      case "pedalHat":
        noise("highpass", p.hatTone, 1, p.hatDecay, 0.45);
        noise("bandpass", 10000, 2, p.hatDecay * 0.8, 0.25);
        break;
      case "openHat":
        noise("highpass", p.hatTone, 1, p.hatDecay * 6, 0.4);
        noise("bandpass", 10000, 2, p.hatDecay * 5, 0.2);
        break;
      case "tomLow":
        tone("sine", p.tomTune * 1.4, p.tomTune * 0.8, 0.15, 0.4, 0.9);
        break;
      case "tomMid":
        tone("sine", p.tomTune * 1.9, p.tomTune * 1.1, 0.15, 0.35, 0.9);
        break;
      case "tomHigh":
        tone("sine", p.tomTune * 2.5, p.tomTune * 1.5, 0.15, 0.3, 0.9);
        break;
      case "crash":
        noise("highpass", 4500, 0.7, 1.8, 0.4);
        break;
      case "ride":
        noise("bandpass", 7000, 1.5, 1.2, 0.3);
        tone("square", 520, 520, 0.01, 0.6, 0.04);
        break;
      default:
        // Note hors carte : petit bip accordé, pour que rien ne soit silencieux sans raison
        tone("triangle", midiToHz(pitch), midiToHz(pitch), 0.01, 0.15, 0.4);
    }

    // La source qui s'arrête en dernier libère la sortie de la voix
    (last as AudioScheduledSourceNode | null)?.addEventListener("ended", () => out.disconnect());

    return {
      kill: (when) => {
        out.gain.cancelScheduledValues(when);
        out.gain.setTargetAtTime(0, when, 0.01);
        for (const s of sources) {
          try {
            s.stop(when + 0.06);
          } catch {
            /* déjà arrêtée */
          }
        }
      },
    };
  }
}
