import { useRef } from "react";

export interface KnobSpec {
  min: number;
  max: number;
  step: number;
  log?: boolean;
  label: string;
  format: (v: number) => string;
}

const ARC = 66; // longueur de l'arc de 270° pour r = 14

// Potentiomètre : glisser verticalement (Maj = fin), flèches au clavier, double-clic = défaut.
export function Knob({
  spec,
  value,
  def,
  color,
  onChange,
}: {
  spec: KnobSpec;
  value: number;
  def?: number;
  color: string;
  onChange: (v: number) => void;
}) {
  const { min, max, step, log } = spec;
  const toPos = (v: number) => {
    const p = log ? Math.log(Math.max(v, min) / min) / Math.log(max / min) : (v - min) / (max - min);
    return Math.max(0, Math.min(1, p));
  };
  const fromPos = (p: number) => {
    const c = Math.max(0, Math.min(1, p));
    const v = log ? min * (max / min) ** c : min + c * (max - min);
    return Math.round(v / step) * step;
  };
  const start = useRef<{ y: number; pos: number } | null>(null);
  const pos = toPos(value);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, pos };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const range = e.shiftKey ? 800 : 200;
    const next = fromPos(start.current.pos + (start.current.y - e.clientY) / range);
    if (next !== value) onChange(next);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(fromPos(pos + d * (e.shiftKey ? 0.01 : 0.05)));
  };

  return (
    <div
      className="knob"
      role="slider"
      tabIndex={0}
      aria-label={spec.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={spec.format(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => def !== undefined && onChange(def)}
      onKeyDown={onKeyDown}
    >
      <svg width="36" height="36" viewBox="0 0 38 38" aria-hidden="true">
        <circle cx="19" cy="19" r="14" fill="none" stroke="var(--line)" strokeWidth="3" strokeDasharray={`${ARC} 88`} transform="rotate(135 19 19)" strokeLinecap="round" />
        <circle cx="19" cy="19" r="14" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(ARC * pos).toFixed(1)} 88`} transform="rotate(135 19 19)" strokeLinecap="round" />
        <circle cx="19" cy="19" r="8" fill="var(--raised)" />
      </svg>
      <span className="label">{spec.label}</span>
      <span className="value">{spec.format(value)}</span>
    </div>
  );
}

// ---------- formats ----------
const fr = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
export const fmt = {
  hz: (v: number) => (v >= 1000 ? `${fr(v / 1000)} kHz` : `${Math.round(v)} Hz`),
  sec: (v: number) => (v >= 1 ? `${fr(v, 2)} s` : `${Math.round(v * 1000)} ms`),
  pct: (v: number) => `${Math.round(v * 100)} %`,
  db: (v: number) => `${v > 0 ? "+" : ""}${fr(v)} dB`,
  cents: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} ct`,
  semis: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} st`,
  ratio: (v: number) => `${fr(v)}:1`,
  num: (v: number) => fr(v),
  pan: (v: number) => (Math.abs(v) < 0.01 ? "C" : `${v < 0 ? "G" : "D"} ${Math.round(Math.abs(v) * 100)}`),
  beats: (v: number) => {
    // Durée en beats exprimée en fraction de ronde (0,75 beat = 3/16)
    const sixteenths = Math.round(v * 4);
    let n = sixteenths;
    let d = 16;
    while (n % 2 === 0 && d > 1) {
      n /= 2;
      d /= 2;
    }
    return `${n}/${d}`;
  },
  type: (v: number) => ["LP", "HP", "BP"][Math.round(v)] ?? "LP",
};

const k = (label: string, min: number, max: number, step: number, format: (v: number) => string, log = false): KnobSpec => ({
  label,
  min,
  max,
  step,
  format,
  log,
});

// Spécifications par nom de paramètre (instruments et effets partagent les noms d'enveloppe)
export const SPECS: Record<string, KnobSpec> = {
  oscMix: k("Mix", 0, 1, 0.01, fmt.pct),
  osc2Detune: k("Détune", -50, 50, 1, fmt.cents),
  osc2Semitones: k("Transpo", -24, 24, 1, fmt.semis),
  subLevel: k("Sub", 0, 1, 0.01, fmt.pct),
  noiseLevel: k("Bruit", 0, 1, 0.01, fmt.pct),
  glide: k("Glide", 0, 0.5, 0.005, fmt.sec),
  cutoff: k("Cutoff", 20, 20000, 1, fmt.hz, true),
  resonance: k("Réso", 0.1, 20, 0.1, fmt.num),
  filterEnvAmount: k("Env", 0, 10000, 10, fmt.hz),
  attack: k("Attack", 0.001, 4, 0.001, fmt.sec, true),
  decay: k("Decay", 0.001, 4, 0.001, fmt.sec, true),
  sustain: k("Sustain", 0, 1, 0.01, fmt.pct),
  release: k("Release", 0.001, 6, 0.001, fmt.sec, true),
  gain: k("Gain", 0, 1, 0.01, fmt.pct),
  kickTune: k("Accord", 30, 100, 1, fmt.hz),
  kickDecay: k("Decay", 0.05, 2, 0.01, fmt.sec),
  kickPunch: k("Punch", 0, 1, 0.01, fmt.pct),
  snareTone: k("Ton", 100, 400, 1, fmt.hz),
  snareDecay: k("Decay", 0.03, 0.6, 0.01, fmt.sec),
  snareNoise: k("Timbre", 0, 1, 0.01, fmt.pct),
  hatDecay: k("Decay", 0.01, 0.3, 0.005, fmt.sec),
  hatTone: k("Ton", 3000, 14000, 50, fmt.hz),
  clapDecay: k("Clap", 0.05, 0.6, 0.01, fmt.sec),
  tomTune: k("Toms", 60, 250, 1, fmt.hz),
  volume: k("Volume", -60, 6, 0.5, fmt.db),
  pan: k("Pan", -1, 1, 0.05, fmt.pan),
  // effets
  lowCut: k("Coupe-bas", 20, 1000, 1, fmt.hz, true),
  lowGain: k("Graves", -18, 18, 0.5, fmt.db),
  lowFreq: k("Fréq. B", 40, 500, 1, fmt.hz, true),
  midGain: k("Médium", -18, 18, 0.5, fmt.db),
  midFreq: k("Fréq. M", 200, 8000, 1, fmt.hz, true),
  midQ: k("Q", 0.1, 10, 0.1, fmt.num),
  highGain: k("Aigus", -18, 18, 0.5, fmt.db),
  highFreq: k("Fréq. H", 2000, 16000, 10, fmt.hz, true),
  threshold: k("Seuil", -60, 0, 0.5, fmt.db),
  ratio: k("Ratio", 1, 20, 0.1, fmt.ratio),
  knee: k("Knee", 0, 40, 0.5, fmt.db),
  makeup: k("Gain", 0, 24, 0.5, fmt.db),
  size: k("Taille", 0.2, 8, 0.1, fmt.sec),
  preDelay: k("Pré-délai", 0, 0.2, 0.001, fmt.sec),
  damping: k("Amorti", 500, 16000, 10, fmt.hz, true),
  mix: k("Mix", 0, 1, 0.01, fmt.pct),
  time: k("Temps", 0.125, 4, 0.125, fmt.beats),
  feedback: k("Feedback", 0, 0.95, 0.01, fmt.pct),
  tone: k("Ton", 200, 16000, 10, fmt.hz, true),
  type: k("Type", 0, 2, 1, fmt.type),
  drive: k("Drive", 0, 1, 0.01, fmt.pct),
  rate: k("Vitesse", 0.05, 8, 0.01, (v) => `${fr(v, 2)} Hz`),
  depth: k("Profondeur", 0, 0.01, 0.0001, (v) => `${fr(v * 1000)} ms`),
};

// Les paramètres « decay » de la réverbe et du compresseur n'ont pas la même unité que l'ADSR
export const FX_OVERRIDES: Record<string, Record<string, KnobSpec>> = {
  reverb: { decay: k("Pente", 0.5, 8, 0.1, fmt.num) },
  compressor: { attack: k("Attack", 0, 0.2, 0.001, fmt.sec), release: k("Release", 0.01, 1, 0.01, fmt.sec) },
};
