// Moteur temps réel : transport + ordonnanceur à anticipation (pattern "two clocks").
// Un timer JS avance par pas de double-croche et programme les notes sur l'horloge audio.

import { projectNow, useProject } from "../state/store";
import type { Project } from "../state/types";
import { MixGraph } from "./graph";
import type { Voice } from "./instruments";

const LOOKAHEAD = 0.12; // secondes programmées à l'avance
const TICK_MS = 25;
const STEP = 0.25; // beats

class AudioEngine {
  private ctx: AudioContext | null = null;
  private graph: MixGraph | null = null;
  private timer: number | null = null;
  private nextBeat = 0;
  private nextTime = 0;
  private marks: { time: number; beat: number }[] = [];
  private voices: Voice[] = [];
  private listeners = new Set<() => void>();
  playing = false;
  cursorBeat = 0; // position de départ quand on est à l'arrêt

  private ensure(): { ctx: AudioContext; graph: MixGraph } {
    if (!this.ctx || !this.graph) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.graph = new MixGraph(this.ctx);
      this.graph.sync(projectNow());
      useProject.subscribe((s, prev) => {
        if (s.project !== prev.project) this.graph?.sync(s.project);
      });
    }
    return { ctx: this.ctx, graph: this.graph };
  }

  get analyser(): AnalyserNode | null {
    return this.graph?.analyser ?? null;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async play() {
    const { ctx } = this.ensure();
    await ctx.resume();
    if (this.playing) return;
    const p = projectNow();
    this.nextBeat = this.cursorBeat;
    if (p.loop.enabled) {
      const ls = p.loop.startBar * p.beatsPerBar;
      const le = p.loop.endBar * p.beatsPerBar;
      if (this.nextBeat < ls || this.nextBeat >= le) this.nextBeat = ls;
    }
    this.nextTime = ctx.currentTime + 0.05;
    this.marks = [{ time: this.nextTime, beat: this.nextBeat }];
    this.playing = true;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
  }

  stop(rewind = false) {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.playing) this.cursorBeat = rewind ? 0 : this.positionBeats();
    else if (rewind) this.cursorBeat = 0;
    this.playing = false;
    const now = this.ctx?.currentTime ?? 0;
    for (const v of this.voices) v.kill(now);
    this.voices = [];
    this.emit();
  }

  seek(beat: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.cursorBeat = Math.max(0, beat);
    if (wasPlaying) void this.play();
    else this.emit();
  }

  private tick() {
    const ctx = this.ctx!;
    const graph = this.graph!;
    const p: Project = projectNow();
    const spb = 60 / p.bpm;
    const songEnd = p.lengthBars * p.beatsPerBar;

    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const from = this.nextBeat;
      const t0 = this.nextTime;
      graph.schedule(p, from, from + STEP, (beat) => t0 + (beat - from) * spb, (v) => this.voices.push(v));
      this.nextBeat += STEP;
      this.nextTime += STEP * spb;

      if (p.loop.enabled && this.nextBeat >= p.loop.endBar * p.beatsPerBar) {
        this.nextBeat = p.loop.startBar * p.beatsPerBar;
      } else if (!p.loop.enabled && this.nextBeat >= songEnd) {
        // Fin du morceau : on laisse sonner les queues de release puis on s'arrête
        window.setTimeout(() => this.stop(true), (this.nextTime - ctx.currentTime) * 1000);
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        break;
      }
      this.marks.push({ time: this.nextTime, beat: this.nextBeat });
    }

    // Purge des repères et voix trop anciens
    const now = ctx.currentTime;
    while (this.marks.length > 2 && this.marks[1].time <= now) this.marks.shift();
    if (this.voices.length > 512) this.voices = this.voices.slice(-256);
  }

  // Position de lecture (en beats) correspondant à ce qu'on entend maintenant.
  positionBeats(): number {
    if (!this.playing || !this.ctx) return this.cursorBeat;
    const now = this.ctx.currentTime;
    const spb = 60 / projectNow().bpm;
    let m = this.marks[0];
    for (const mk of this.marks) if (mk.time <= now) m = mk;
    if (!m) return this.cursorBeat;
    return m.beat + Math.max(0, now - m.time) / spb;
  }
}

export const engine = new AudioEngine();
