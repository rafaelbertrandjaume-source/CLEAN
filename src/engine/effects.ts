// Effets en Web Audio natif. Chaque effet expose input/output et se met à jour sans
// reconstruire le graphe (sauf la réverbe, dont la réponse impulsionnelle est régénérée).

import type { Effect } from "../state/types";

export interface FxNode {
  input: AudioNode;
  output: AudioNode;
  update: (params: Record<string, number>, bypass: boolean, bpm: number) => void;
  dispose: () => void;
}

const smooth = (param: AudioParam, value: number, ctx: BaseAudioContext) => {
  if (ctx instanceof AudioContext) param.setTargetAtTime(value, ctx.currentTime, 0.015);
  else param.value = value;
};

// Squelette commun : chemin dry + chemin wet mixés, et bypass.
function wetDry(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const setMix = (mix: number, bypass: boolean) => {
    smooth(dry.gain, bypass ? 1 : 1 - mix, ctx);
    smooth(wet.gain, bypass ? 0 : mix, ctx);
  };
  return { input, output, wet, setMix };
}

export function reverbImpulse(ctx: BaseAudioContext, size: number, decay: number, damping: number): AudioBuffer {
  const len = Math.max(0.1, size) * ctx.sampleRate;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  // Filtre passe-bas à un pôle appliqué au bruit pour simuler l'absorption des aigus
  const a = Math.exp((-2 * Math.PI * damping) / ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      lp = (1 - a) * n + a * lp;
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function distortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = 1 + drive * 50;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function createEffect(ctx: BaseAudioContext, fx: Effect, bpm: number): FxNode {
  switch (fx.type) {
    case "eq": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      const input = ctx.createGain();
      const output = ctx.createGain();
      const bypassPath = ctx.createGain();
      const eqPath = ctx.createGain();
      input.connect(hp).connect(low).connect(mid).connect(high).connect(eqPath).connect(output);
      input.connect(bypassPath).connect(output);
      const update = (p: Record<string, number>, bypass: boolean) => {
        smooth(hp.frequency, p.lowCut, ctx);
        smooth(low.frequency, p.lowFreq, ctx);
        smooth(low.gain, p.lowGain, ctx);
        smooth(mid.frequency, p.midFreq, ctx);
        smooth(mid.gain, p.midGain, ctx);
        smooth(mid.Q, p.midQ, ctx);
        smooth(high.frequency, p.highFreq, ctx);
        smooth(high.gain, p.highGain, ctx);
        smooth(eqPath.gain, bypass ? 0 : 1, ctx);
        smooth(bypassPath.gain, bypass ? 1 : 0, ctx);
      };
      update(fx.params, fx.bypass);
      return { input, output, update, dispose: () => output.disconnect() };
    }

    case "compressor": {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      const bypassPath = ctx.createGain();
      input.connect(comp).connect(makeup).connect(output);
      input.connect(bypassPath).connect(output);
      const update = (p: Record<string, number>, bypass: boolean) => {
        smooth(comp.threshold, p.threshold, ctx);
        smooth(comp.ratio, p.ratio, ctx);
        smooth(comp.attack, p.attack, ctx);
        smooth(comp.release, p.release, ctx);
        smooth(comp.knee, p.knee, ctx);
        smooth(makeup.gain, bypass ? 0 : 10 ** (p.makeup / 20), ctx);
        smooth(bypassPath.gain, bypass ? 1 : 0, ctx);
      };
      update(fx.params, fx.bypass);
      return { input, output, update, dispose: () => output.disconnect() };
    }

    case "reverb": {
      const w = wetDry(ctx);
      const pre = ctx.createDelay(1);
      const conv = ctx.createConvolver();
      w.input.connect(pre).connect(conv).connect(w.wet);
      let irKey = "";
      const update = (p: Record<string, number>, bypass: boolean) => {
        const key = `${p.size}|${p.decay}|${p.damping}`;
        if (key !== irKey) {
          conv.buffer = reverbImpulse(ctx, p.size, p.decay, p.damping);
          irKey = key;
        }
        smooth(pre.delayTime, Math.min(p.preDelay, 1), ctx);
        w.setMix(p.mix, bypass);
      };
      update(fx.params, fx.bypass);
      return { input: w.input, output: w.output, update, dispose: () => w.output.disconnect() };
    }

    case "delay": {
      const w = wetDry(ctx);
      const delay = ctx.createDelay(4);
      const fb = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      w.input.connect(delay).connect(tone).connect(w.wet);
      tone.connect(fb).connect(delay);
      const update = (p: Record<string, number>, bypass: boolean, tempo: number) => {
        smooth(delay.delayTime, Math.min((p.time * 60) / tempo, 4), ctx);
        smooth(fb.gain, Math.min(p.feedback, 0.95), ctx);
        smooth(tone.frequency, p.tone, ctx);
        w.setMix(p.mix, bypass);
      };
      update(fx.params, fx.bypass, bpm);
      return { input: w.input, output: w.output, update, dispose: () => w.output.disconnect() };
    }

    case "filter": {
      const w = wetDry(ctx);
      const f = ctx.createBiquadFilter();
      w.input.connect(f).connect(w.wet);
      const types: BiquadFilterType[] = ["lowpass", "highpass", "bandpass"];
      const update = (p: Record<string, number>, bypass: boolean) => {
        f.type = types[Math.round(p.type)] ?? "lowpass";
        smooth(f.frequency, p.cutoff, ctx);
        smooth(f.Q, p.resonance, ctx);
        w.setMix(p.mix, bypass);
      };
      update(fx.params, fx.bypass);
      return { input: w.input, output: w.output, update, dispose: () => w.output.disconnect() };
    }

    case "distortion": {
      const w = wetDry(ctx);
      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      w.input.connect(shaper).connect(tone).connect(w.wet);
      let lastDrive = -1;
      const update = (p: Record<string, number>, bypass: boolean) => {
        if (p.drive !== lastDrive) {
          shaper.curve = distortionCurve(p.drive);
          lastDrive = p.drive;
        }
        smooth(tone.frequency, p.tone, ctx);
        w.setMix(p.mix, bypass);
      };
      update(fx.params, fx.bypass);
      return { input: w.input, output: w.output, update, dispose: () => w.output.disconnect() };
    }

    case "chorus": {
      const w = wetDry(ctx);
      const d = ctx.createDelay(0.1);
      d.delayTime.value = 0.015;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      w.input.connect(d).connect(w.wet);
      const update = (p: Record<string, number>, bypass: boolean) => {
        smooth(lfo.frequency, p.rate, ctx);
        smooth(depth.gain, p.depth, ctx);
        w.setMix(p.mix, bypass);
      };
      update(fx.params, fx.bypass);
      return {
        input: w.input,
        output: w.output,
        update,
        dispose: () => {
          lfo.stop();
          w.output.disconnect();
        },
      };
    }
  }
}
