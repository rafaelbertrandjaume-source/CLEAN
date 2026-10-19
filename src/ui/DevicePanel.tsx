import { useChat } from "../agent/chat";
import { addEffect, findTrack } from "../state/ops";
import { DRUM_PRESETS, EFFECT_DEFAULTS, SYNTH_PRESETS, makeInstrument } from "../state/presets";
import { useProject } from "../state/store";
import type { DrumParams, EffectType, Envelope, SynthParams, Track } from "../state/types";
import { envPath, fxPath } from "./fxViz";
import { IconClose, IconPower, Spark } from "./icons";
import { FX_OVERRIDES, Knob, SPECS } from "./Knob";

const FX_NAMES: Record<EffectType, string> = {
  eq: "EQ",
  compressor: "Compresseur",
  reverb: "Réverbe",
  delay: "Delay",
  filter: "Filtre",
  distortion: "Distorsion",
  chorus: "Chorus",
};

const WAVES = ["sine", "triangle", "sawtooth", "square"];

export function DevicePanel({ track }: { track: Track }) {
  const edit = useProject((s) => s.edit);
  const bpm = useProject((s) => s.project.bpm);
  const touchedFx = useChat((s) => s.touched.effects);
  const touchedTrack = useChat((s) => s.touched.tracks.has(track.id));
  // Gestes continus : une entrée d'historique par paramètre et par geste
  const set = (key: string, fn: (t: Track) => void) => edit((p) => fn(findTrack(p, track.id)), { coalesce: `${track.id}:${key}` });
  const inst = track.instrument;
  const color = track.color;

  const knob = (key: string, value: number, apply: (t: Track, v: number) => void, def?: number) => (
    <Knob key={key} spec={SPECS[key]} value={value} def={def} color={color} onChange={(v) => set(key, (t) => apply(t, v))} />
  );

  const instParams = inst.params as unknown as Record<string, number | string | Envelope>;
  const presetDefaults = (inst.kind === "synth" ? SYNTH_PRESETS[inst.preset] : DRUM_PRESETS[inst.preset]) as unknown as Record<string, number | Envelope> | undefined;
  const pk = (key: string) =>
    knob(key, instParams[key] as number, (t, v) => void ((t.instrument.params as unknown as Record<string, number>)[key] = v), presetDefaults?.[key] as number | undefined);
  const envKnobs = (envKey: "ampEnv" | "filterEnv") =>
    (["attack", "decay", "sustain", "release"] as const).map((ek) => (
      <Knob
        key={`${envKey}.${ek}`}
        spec={SPECS[ek]}
        value={(instParams[envKey] as Envelope)[ek]}
        def={(presetDefaults?.[envKey] as Envelope | undefined)?.[ek]}
        color={color}
        onChange={(v) => set(`${envKey}.${ek}`, (t) => void ((t.instrument.params as SynthParams)[envKey][ek] = v))}
      />
    ));
  const choice = (key: string, label: string, options: string[]) => (
    <label className="choice" key={key}>
      {label}
      <select value={instParams[key] as string} onChange={(e) => set(key, (t) => void ((t.instrument.params as unknown as Record<string, string>)[key] = e.target.value))}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="rack">
      <div className={`device ${touchedTrack ? "agent" : ""}`}>
        <div className="device-head">
          {touchedTrack && <Spark />}
          <span className="title">{inst.kind === "synth" ? "Synth" : "Drums"}</span>
          <select
            aria-label="Preset"
            value={inst.preset}
            onChange={(e) => edit((p) => void (findTrack(p, track.id).instrument = makeInstrument(inst.kind, e.target.value)))}
          >
            {Object.keys(inst.kind === "synth" ? SYNTH_PRESETS : DRUM_PRESETS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="sections">
          <div className="section">
            <span>Piste</span>
            <div className="knobs">
              {knob("volume", track.volume, (t, v) => void (t.volume = v), 0)}
              {knob("pan", track.pan, (t, v) => void (t.pan = v), 0)}
            </div>
          </div>
          {inst.kind === "synth" ? (
            <>
              <div className="section">
                <span>Oscillateurs</span>
                <div className="knobs">
                  {choice("osc1", "Osc 1", WAVES)}
                  {choice("osc2", "Osc 2", WAVES)}
                  {pk("oscMix")}
                  {pk("osc2Detune")}
                  {pk("osc2Semitones")}
                  {pk("subLevel")}
                  {pk("noiseLevel")}
                  {pk("glide")}
                </div>
              </div>
              <div className="section">
                <span>Filtre</span>
                <div className="knobs">
                  {choice("filterType", "Type", ["lowpass", "highpass", "bandpass"])}
                  {pk("cutoff")}
                  {pk("resonance")}
                  {pk("filterEnvAmount")}
                  {envKnobs("filterEnv")}
                </div>
              </div>
              <div className="section">
                <span>Ampli</span>
                <svg width="150" height="40" viewBox="0 0 150 40" aria-hidden="true" style={{ background: "var(--panel)", borderRadius: 4 }}>
                  <path d={envPath((inst.params as SynthParams).ampEnv, 150, 40)} fill={`${color}1f`} stroke={color} strokeWidth="1.5" />
                </svg>
                <div className="knobs">
                  {envKnobs("ampEnv")}
                  {pk("gain")}
                </div>
              </div>
            </>
          ) : (
            <>
              {(
                [
                  ["Kick", ["kickTune", "kickDecay", "kickPunch"]],
                  ["Snare", ["snareTone", "snareDecay", "snareNoise"]],
                  ["Hats", ["hatTone", "hatDecay"]],
                  ["Clap & toms", ["clapDecay", "tomTune", "gain"]],
                ] as [string, (keyof DrumParams)[]][]
              ).map(([title, keys]) => (
                <div className="section" key={title}>
                  <span>{title}</span>
                  <div className="knobs">{keys.map((key) => pk(key))}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {track.effects.map((fx, idx) => {
        const byAgent = touchedFx.has(fx.id);
        return (
          <div key={fx.id} className={`device ${fx.bypass ? "bypassed" : ""} ${byAgent ? "agent" : ""}`} style={{ width: 176 }}>
            <div className="device-head">
              {byAgent && <Spark />}
              <span className="title">{FX_NAMES[fx.type]}</span>
              <span className="spacer" />
              <button
                className={`power ${fx.bypass ? "" : "on"}`}
                aria-label={fx.bypass ? "Activer" : "Contourner"}
                aria-pressed={!fx.bypass}
                onClick={() => edit((p) => void (findTrack(p, track.id).effects[idx].bypass = !fx.bypass))}
              >
                <IconPower />
              </button>
              <button aria-label="Retirer l’effet" onClick={() => edit((p) => void findTrack(p, track.id).effects.splice(idx, 1))}>
                <IconClose />
              </button>
            </div>
            <div className="fx-viz">
              <svg width="100%" height="54" viewBox="0 0 160 54" preserveAspectRatio="none" aria-hidden="true">
                <path d={fxPath(fx, bpm)} fill="none" stroke="var(--text)" strokeOpacity="0.75" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="knobs">
              {Object.entries(fx.params).map(([key, v]) => (
                <Knob
                  key={key}
                  spec={FX_OVERRIDES[fx.type]?.[key] ?? SPECS[key]}
                  value={v}
                  def={EFFECT_DEFAULTS[fx.type][key]}
                  color="var(--text)"
                  onChange={(nv) => set(`${fx.id}.${key}`, (t) => void (t.effects[idx].params[key] = nv))}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="add-fx">
        <span className="caps" style={{ marginBottom: 4 }}>
          Ajouter
        </span>
        {(Object.keys(EFFECT_DEFAULTS) as EffectType[]).map((type) => (
          <button key={type} onClick={() => edit((p) => void addEffect(p, track.id, type))}>
            {FX_NAMES[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
