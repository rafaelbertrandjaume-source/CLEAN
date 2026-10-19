// Rendu hors temps réel du projet (export WAV, et plus tard analyse du mix par l'agent).

import type { Project } from "../state/types";
import { MixGraph } from "./graph";

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 3;

export async function renderProject(p: Project, opts?: { fromBar?: number; toBar?: number }): Promise<AudioBuffer> {
  const fromBeat = (opts?.fromBar ?? 0) * p.beatsPerBar;
  const toBeat = (opts?.toBar ?? p.lengthBars) * p.beatsPerBar;
  const spb = 60 / p.bpm;
  const seconds = (toBeat - fromBeat) * spb + TAIL_SECONDS;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const graph = new MixGraph(ctx);
  graph.sync(p);
  graph.schedule(p, fromBeat, toBeat, (beat) => (beat - fromBeat) * spb);
  return ctx.startRendering();
}

export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytesPerSample = 3; // 24 bits
  const dataSize = len * ch * bytesPerSample;
  const out = new DataView(new ArrayBuffer(44 + dataSize));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * bytesPerSample, true);
  out.setUint16(32, ch * bytesPerSample, true);
  out.setUint16(34, 24, true);
  str(36, "data");
  out.setUint32(40, dataSize, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
      out.setUint8(o, v & 0xff);
      out.setUint8(o + 1, (v >> 8) & 0xff);
      out.setUint8(o + 2, (v >> 16) & 0xff);
      o += 3;
    }
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}

// Mesures simples du master. Phase 3 : LUFS intégrés (ITU-R BS.1770), spectre, masquage.
export function measure(buf: AudioBuffer) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
      n++;
    }
  }
  // Plancher à -120 dBFS : -Infinity ne survit pas à JSON (il devient null)
  const toDb = (x: number) => Math.max(-120, x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
  return { peakDb: toDb(peak), rmsDb: toDb(Math.sqrt(sum / Math.max(n, 1))) };
}
