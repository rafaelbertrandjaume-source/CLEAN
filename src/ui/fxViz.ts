// Petites visualisations d'effet (160×54), calculées à partir des vrais paramètres.

import type { Effect, Envelope } from "../state/types";

const W = 160;
const H = 54;

let probe: OfflineAudioContext | null = null;
const ctx = () => (probe ??= new OfflineAudioContext(1, 1, 44100));

// Réponse en fréquence réelle d'une chaîne de BiquadFilterNode, en dB, sur une échelle log 20 Hz – 20 kHz
function response(filters: BiquadFilterNode[], range = 24): string {
  const n = 80;
  const freqs = new Float32Array(n);
  for (let i = 0; i < n; i++) freqs[i] = 20 * 1000 ** (i / (n - 1));
  const total = new Float32Array(n).fill(0);
  const mag = new Float32Array(n);
  const phase = new Float32Array(n);
  for (const f of filters) {
    f.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < n; i++) total[i] += 20 * Math.log10(Math.max(mag[i], 1e-5));
  }
  return Array.from(total, (db, i) => {
    const x = (i / (n - 1)) * W;
    const y = H / 2 - (Math.max(-range, Math.min(range, db)) / range) * (H / 2 - 4);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function biquad(type: BiquadFilterType, freq: number, gain = 0, q = 1): BiquadFilterNode {
  const f = ctx().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.gain.value = gain;
  f.Q.value = q;
  return f;
}

export function fxPath(fx: Effect, bpm: number): string {
  const p = fx.params;
  switch (fx.type) {
    case "eq":
      return response([
        biquad("highpass", p.lowCut, 0, 0.7),
        biquad("lowshelf", p.lowFreq, p.lowGain),
        biquad("peaking", p.midFreq, p.midGain, p.midQ),
        biquad("highshelf", p.highFreq, p.highGain),
      ]);
    case "filter":
      return response([biquad((["lowpass", "highpass", "bandpass"] as const)[Math.round(p.type)] ?? "lowpass", p.cutoff, 0, p.resonance)]);
    case "compressor": {
      // Courbe de transfert entrée/sortie de -60 à 0 dB
      const pts: string[] = [];
      for (let i = 0; i <= 40; i++) {
        const inDb = -60 + (i / 40) * 60;
        const over = inDb - p.threshold;
        const outDb = (over > 0 ? p.threshold + over / p.ratio : inDb) + p.makeup;
        pts.push(`${i ? "L" : "M"}${((i / 40) * W).toFixed(1)} ${(H - ((Math.min(outDb, 0) + 60) / 60) * H).toFixed(1)}`);
      }
      return pts.join(" ");
    }
    case "delay": {
      // Répétitions : une barre par écho, amplitude = feedback^n
      const step = (p.time * 60) / bpm;
      const span = 2.5; // secondes visibles
      let d = `M0 ${H} L0 4 L1 4 L1 ${H}`;
      for (let n = 1, a = p.feedback; n < 40 && n * step < span; n++, a *= p.feedback) {
        const x = (n * step * W) / span;
        const y = H - Math.max(a, 0.02) * (H - 8);
        d += ` M${x.toFixed(1)} ${H} L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    }
    case "reverb": {
      const pts: string[] = [];
      const pre = Math.min(p.preDelay / p.size, 0.3);
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        const a = t < pre ? 0 : Math.pow(1 - (t - pre) / (1 - pre), p.decay);
        pts.push(`${i ? "L" : "M"}${(t * W).toFixed(1)} ${(H - 4 - a * (H - 10)).toFixed(1)}`);
      }
      return pts.join(" ");
    }
    case "distortion": {
      const k = 1 + p.drive * 50;
      const pts: string[] = [];
      for (let i = 0; i <= 50; i++) {
        const x = (i / 50) * 2 - 1;
        const y = Math.tanh(k * x) / Math.tanh(k);
        pts.push(`${i ? "L" : "M"}${(((x + 1) / 2) * W).toFixed(1)} ${(H / 2 - y * (H / 2 - 4)).toFixed(1)}`);
      }
      return pts.join(" ");
    }
    case "chorus": {
      const pts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * 2; // 2 secondes
        const y = Math.sin(2 * Math.PI * p.rate * t) * Math.min(p.depth / 0.01, 1);
        pts.push(`${i ? "L" : "M"}${((i / 60) * W).toFixed(1)} ${(H / 2 - y * (H / 2 - 6)).toFixed(1)}`);
      }
      return pts.join(" ");
    }
  }
}

// Enveloppe ADSR dessinée sur une largeur donnée (sustain tenu sur un temps fixe)
export function envPath(env: Envelope, w: number, h: number): string {
  const hold = 0.4;
  const total = env.attack + env.decay + hold + env.release;
  const sx = (t: number) => 6 + (t / total) * (w - 12);
  const sy = (v: number) => h - 4 - v * (h - 10);
  const a = env.attack;
  const d = a + env.decay;
  const s = d + hold;
  return `M${sx(0)} ${sy(0)} L${sx(a)} ${sy(1)} L${sx(d)} ${sy(env.sustain)} L${sx(s)} ${sy(env.sustain)} L${sx(total)} ${sy(0)}`;
}
