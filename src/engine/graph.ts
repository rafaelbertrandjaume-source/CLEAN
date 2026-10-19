// Graphe de mixage : instrument -> effets -> volume -> pan -> bus master -> limiteur.
// Le même code sert au temps réel (AudioContext) et à l'export (OfflineAudioContext).

import type { Project, Track } from "../state/types";
import { createEffect, type FxNode } from "./effects";
import { DrumInstrument, SynthInstrument, type Voice } from "./instruments";

const dbToGain = (db: number) => (db <= -60 ? 0 : 10 ** (db / 20));

class TrackChain {
  input: GainNode;
  private volume: GainNode;
  private panner: StereoPannerNode;
  private fx: FxNode[] = [];
  private fxSignature = "";
  readonly synth = new SynthInstrument();
  readonly drums = new DrumInstrument();

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.input = ctx.createGain();
    this.volume = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.volume.connect(this.panner).connect(dest);
    this.input.connect(this.volume);
  }

  update(track: Track, soloActive: boolean, bpm: number) {
    // Reconstruit la chaîne seulement si la liste ou l'ordre des effets a changé
    const sig = track.effects.map((e) => `${e.id}:${e.type}`).join(",");
    if (sig !== this.fxSignature) {
      this.input.disconnect();
      for (const f of this.fx) f.dispose();
      this.fx = track.effects.map((e) => createEffect(this.ctx, e, bpm));
      let node: AudioNode = this.input;
      for (const f of this.fx) {
        node.connect(f.input);
        node = f.output;
      }
      node.connect(this.volume);
      this.fxSignature = sig;
    }
    track.effects.forEach((e, i) => this.fx[i].update(e.params, e.bypass, bpm));

    const audible = !track.mute && (!soloActive || track.solo);
    const gain = audible ? dbToGain(track.volume) : 0;
    const pan = Math.max(-1, Math.min(1, track.pan));
    if (this.ctx instanceof AudioContext) {
      this.volume.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015);
      this.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.015);
    } else {
      this.volume.gain.value = gain;
      this.panner.pan.value = pan;
    }
  }

  dispose() {
    this.input.disconnect();
    for (const f of this.fx) f.dispose();
    this.panner.disconnect();
  }
}

export class MixGraph {
  readonly masterIn: GainNode;
  readonly analyser: AnalyserNode;
  private limiter: DynamicsCompressorNode;
  private masterGain: GainNode;
  private chains = new Map<string, TrackChain>();
  private limiterOn = true;

  constructor(private ctx: BaseAudioContext) {
    this.masterIn = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.masterGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterIn.connect(this.limiter).connect(this.masterGain);
    this.masterGain.connect(this.analyser).connect(ctx.destination);
  }

  sync(p: Project) {
    const soloActive = p.tracks.some((t) => t.solo);
    const seen = new Set<string>();
    for (const t of p.tracks) {
      seen.add(t.id);
      let chain = this.chains.get(t.id);
      if (!chain) {
        chain = new TrackChain(this.ctx, this.masterIn);
        this.chains.set(t.id, chain);
      }
      chain.update(t, soloActive, p.bpm);
    }
    for (const [id, chain] of this.chains) {
      if (!seen.has(id)) {
        chain.dispose();
        this.chains.delete(id);
      }
    }
    if (p.master.limiter !== this.limiterOn) {
      this.masterIn.disconnect();
      this.masterIn.connect(p.master.limiter ? this.limiter : this.masterGain);
      this.limiterOn = p.master.limiter;
    }
    this.masterGain.gain.value = dbToGain(p.master.volume);
  }

  // Programme toutes les notes dont le début tombe dans [fromBeat, toBeat).
  // timeOf convertit un temps absolu du morceau (en beats) en temps du contexte audio.
  schedule(p: Project, fromBeat: number, toBeat: number, timeOf: (beat: number) => number, onVoice?: (v: Voice) => void) {
    const spb = 60 / p.bpm;
    for (const track of p.tracks) {
      const chain = this.chains.get(track.id);
      if (!chain || track.mute) continue;
      for (const clip of track.clips) {
        const clipStart = clip.startBar * p.beatsPerBar;
        const clipEnd = clipStart + clip.lengthBars * p.beatsPerBar;
        if (clipEnd <= fromBeat || clipStart >= toBeat) continue;
        for (const n of clip.notes) {
          const abs = clipStart + n.start;
          if (abs < fromBeat || abs >= toBeat) continue;
          // La note est coupée à la fin du clip
          const durBeats = Math.min(n.dur, clipEnd - abs);
          const t = timeOf(abs);
          const inst = track.instrument;
          const v =
            inst.kind === "synth"
              ? chain.synth.playNote(this.ctx, chain.input, inst.params, n.pitch, t, durBeats * spb, n.vel)
              : chain.drums.playNote(this.ctx, chain.input, inst.params, n.pitch, t, durBeats * spb, n.vel);
          onVoice?.(v);
        }
      }
    }
  }
}
