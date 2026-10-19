import { addEffect, findTrack } from "../state/ops";
import { DRUM_PRESETS, EFFECT_DEFAULTS, SYNTH_PRESETS, makeInstrument } from "../state/presets";
import { useProject } from "../state/store";
import type { EffectType, Envelope, Track } from "../state/types";

// Plages des curseurs : [min, max, pas, logarithmique]
const RANGES: Record<string, [number, number, number, boolean?]> = {
  osc2Detune: [-50, 50, 1],
  osc2Semitones: [-24, 24, 1],
  oscMix: [0, 1, 0.01],
  subLevel: [0, 1, 0.01],
  noiseLevel: [0, 1, 0.01],
  cutoff: [20, 20000, 1, true],
  resonance: [0.1, 20, 0.1],
  filterEnvAmount: [0, 10000, 10],
  glide: [0, 0.5, 0.005],
  gain: [0, 1, 0.01],
  attack: [0.001, 4, 0.001, true],
  decay: [0.001, 4, 0.001, true],
  sustain: [0, 1, 0.01],
  release: [0.001, 6, 0.001, true],
  kickTune: [30, 100, 1],
  kickDecay: [0.05, 2, 0.01],
  kickPunch: [0, 1, 0.01],
  snareTone: [100, 400, 1],
  snareDecay: [0.03, 0.6, 0.01],
  snareNoise: [0, 1, 0.01],
  hatDecay: [0.01, 0.3, 0.005],
  hatTone: [3000, 14000, 50],
  clapDecay: [0.05, 0.6, 0.01],
  tomTune: [60, 250, 1],
  // effets
  lowCut: [20, 1000, 1, true],
  lowGain: [-18, 18, 0.5],
  lowFreq: [40, 500, 1, true],
  midGain: [-18, 18, 0.5],
  midFreq: [200, 8000, 1, true],
  midQ: [0.1, 10, 0.1],
  highGain: [-18, 18, 0.5],
  highFreq: [2000, 16000, 10, true],
  threshold: [-60, 0, 0.5],
  ratio: [1, 20, 0.1],
  knee: [0, 40, 0.5],
  makeup: [0, 24, 0.5],
  size: [0.2, 8, 0.1],
  preDelay: [0, 0.2, 0.001],
  damping: [500, 16000, 10, true],
  mix: [0, 1, 0.01],
  time: [0.125, 4, 0.125],
  feedback: [0, 0.95, 0.01],
  tone: [200, 16000, 10, true],
  type: [0, 2, 1],
  drive: [0, 1, 0.01],
  rate: [0.05, 8, 0.01],
  depth: [0, 0.01, 0.0001],
};

function Knob({ name, value, onChange }: { name: string; value: number; onChange: (v: number) => void }) {
  const [min, max, step, log] = RANGES[name] ?? [0, Math.max(1, value * 2), 0.01];
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? min * (max / min) ** p : min + p * (max - min));
  const snapStep = (v: number) => Math.round(v / step) * step;
  return (
    <label className="knob">
      <span>{name}</span>
      <input type="range" min={0} max={1} step={0.001} value={toPos(value)} onChange={(e) => onChange(snapStep(fromPos(Number(e.target.value))))} />
      <em>{Number.isInteger(value) ? value : value.toFixed(value < 1 ? 3 : 1)}</em>
    </label>
  );
}

export function DevicePanel() {
  const project = useProject((s) => s.project);
  const trackId = useProject((s) => s.selectedTrackId);
  const edit = useProject((s) => s.edit);
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return <div className="empty-editor">Sélectionne une piste.</div>;

  const set = (fn: (t: Track) => void) => edit((p) => fn(findTrack(p, track.id)));
  const inst = track.instrument;
  const presets = inst.kind === "synth" ? SYNTH_PRESETS : DRUM_PRESETS;

  return (
    <div className="device-panel">
      <div className="device">
        <h4>
          {inst.kind === "synth" ? "Synth" : "Drums"}
          <select value={inst.preset} onChange={(e) => set((t) => void (t.instrument = makeInstrument(inst.kind, e.target.value)))}>
            {Object.keys(presets).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </h4>
        <div className="params">
          {Object.entries(inst.params).map(([k, v]) => {
            if (typeof v === "number")
              return <Knob key={k} name={k} value={v} onChange={(nv) => set((t) => void ((t.instrument.params as unknown as Record<string, number>)[k] = nv))} />;
            if (typeof v === "string") {
              const opts = k === "filterType" ? ["lowpass", "highpass", "bandpass"] : ["sine", "triangle", "sawtooth", "square"];
              return (
                <label key={k} className="knob">
                  <span>{k}</span>
                  <select value={v} onChange={(e) => set((t) => void ((t.instrument.params as unknown as Record<string, string>)[k] = e.target.value))}>
                    {opts.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              );
            }
            const envObj = v as Envelope;
            return (
              <fieldset key={k}>
                <legend>{k}</legend>
                {(Object.keys(envObj) as (keyof Envelope)[]).map((ek) => (
                  <Knob
                    key={ek}
                    name={ek}
                    value={envObj[ek]}
                    onChange={(nv) => set((t) => void ((t.instrument.params as unknown as Record<string, Envelope>)[k][ek] = nv))}
                  />
                ))}
              </fieldset>
            );
          })}
        </div>
      </div>

      {track.effects.map((fx, idx) => (
        <div key={fx.id} className={`device ${fx.bypass ? "bypassed" : ""}`}>
          <h4>
            {fx.type}
            <span className="device-actions">
              <button className={fx.bypass ? "" : "on"} title="Activer / bypass" onClick={() => set((t) => void (t.effects[idx].bypass = !fx.bypass))}>
                ⏻
              </button>
              <button title="Retirer" onClick={() => set((t) => void t.effects.splice(idx, 1))}>
                ×
              </button>
            </span>
          </h4>
          <div className="params">
            {Object.entries(fx.params).map(([k, v]) => (
              <Knob key={k} name={k} value={v} onChange={(nv) => set((t) => void (t.effects[idx].params[k] = nv))} />
            ))}
          </div>
        </div>
      ))}

      <div className="device add-fx">
        <h4>Ajouter</h4>
        {(Object.keys(EFFECT_DEFAULTS) as EffectType[]).map((type) => (
          <button key={type} onClick={() => edit((p) => void addEffect(p, track.id, type))}>
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
