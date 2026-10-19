import { useEffect, useRef, useState } from "react";
import { findClip } from "../state/ops";
import { DRUM_MAP } from "../state/presets";
import { useProject } from "../state/store";
import type { Note } from "../state/types";

const ROW_H = 12;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);

export function PianoRoll() {
  const project = useProject((s) => s.project);
  const clipId = useProject((s) => s.selectedClipId);
  const edit = useProject((s) => s.edit);
  const [beatW, setBeatW] = useState(48);
  const [snap, setSnap] = useState(0.25);
  const lastDur = useRef(0.25);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ index: number; dBeat: number; dPitch: number; dDur: number } | null>(null);

  let found: ReturnType<typeof findClip> | null = null;
  try {
    found = clipId ? findClip(project, clipId) : null;
  } catch {
    found = null;
  }
  const isDrums = found?.track.instrument.kind === "drums";
  const [lo, hi] = isDrums ? [35, 52] : [24, 96];
  const rows = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);

  // Centre la vue verticale sur les notes du clip à l'ouverture
  useEffect(() => {
    if (!found || !scrollRef.current) return;
    const ps = found.clip.notes.map((n) => n.pitch);
    const center = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 60;
    scrollRef.current.scrollTop = (hi - center) * ROW_H - scrollRef.current.clientHeight / 2;
  }, [clipId]);

  if (!found) return <div className="empty-editor">Sélectionne un clip (double-clic sur une piste pour en créer un).</div>;

  const { clip, track } = found;
  const beats = clip.lengthBars * project.beatsPerBar;
  const width = beats * beatW;

  const editNotes = (fn: (notes: Note[]) => Note[]) =>
    edit((p) => {
      const c = findClip(p, clip.id).clip;
      c.notes = fn(c.notes)
        .filter((n) => n.start >= 0 && n.start < beats && n.pitch >= 0 && n.pitch <= 127)
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    });

  const onGridDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const beat = Math.floor((e.clientX - r.left) / beatW / snap) * snap;
    const pitch = hi - Math.floor((e.clientY - r.top) / ROW_H);
    editNotes((ns) => [...ns, { pitch, start: beat, dur: lastDur.current, vel: 100 }]);
  };

  const onNoteDown = (e: React.MouseEvent, index: number, mode: "move" | "resize") => {
    e.stopPropagation();
    if (e.button === 2 || e.altKey) {
      editNotes((ns) => ns.filter((_, i) => i !== index));
      return;
    }
    const x0 = e.clientX;
    const y0 = e.clientY;
    const calc = (ev: MouseEvent) => {
      const dBeat = Math.round((ev.clientX - x0) / beatW / snap) * snap;
      const dPitch = -Math.round((ev.clientY - y0) / ROW_H);
      return mode === "move" ? { index, dBeat, dPitch, dDur: 0 } : { index, dBeat: 0, dPitch: 0, dDur: dBeat };
    };
    const onMove = (ev: MouseEvent) => setDrag(calc(ev));
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDrag(null);
      const d = calc(ev);
      if (!d.dBeat && !d.dPitch && !d.dDur) return;
      editNotes((ns) =>
        ns.map((n, i) => {
          if (i !== index) return n;
          const dur = Math.max(snap, n.dur + d.dDur);
          if (mode === "resize") lastDur.current = dur;
          return { ...n, start: Math.max(0, n.start + d.dBeat), pitch: n.pitch + d.dPitch, dur };
        }),
      );
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="piano-roll">
      <div className="pr-toolbar">
        <span style={{ color: track.color }}>{track.name}</span> / {clip.name} · {clip.notes.length} notes
        <label>
          Grille
          <select value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
            <option value={0.125}>1/32</option>
            <option value={1 / 3}>1/8T</option>
          </select>
        </label>
        <label>
          Zoom
          <input type="range" min={16} max={160} value={beatW} onChange={(e) => setBeatW(Number(e.target.value))} />
        </label>
        <span className="hint">Clic : ajouter · glisser : déplacer · bord droit : durée · clic droit ou ⌥clic : supprimer</span>
      </div>
      <div className="pr-body" ref={scrollRef}>
        <div className="pr-keys">
          {rows.map((p) => (
            <div key={p} className={`key ${isBlack(p) ? "black" : ""}`} style={{ height: ROW_H }}>
              {isDrums ? (DRUM_MAP[p] ?? "") : p % 12 === 0 ? noteName(p) : ""}
            </div>
          ))}
        </div>
        <div
          className="pr-grid"
          style={{
            width,
            height: rows.length * ROW_H,
            backgroundSize: `${beatW}px ${ROW_H}px, ${beatW * project.beatsPerBar}px 100%`,
          }}
          onMouseDown={onGridDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {rows.map((p, i) => (isBlack(p) ? <div key={p} className="black-row" style={{ top: i * ROW_H, height: ROW_H }} /> : null))}
          {clip.notes.map((n, i) => {
            const d = drag?.index === i ? drag : null;
            const pitch = n.pitch + (d?.dPitch ?? 0);
            if (pitch < lo || pitch > hi) return null;
            return (
              <div
                key={i}
                className="note"
                style={{
                  left: (n.start + (d?.dBeat ?? 0)) * beatW,
                  top: (hi - pitch) * ROW_H,
                  width: Math.max(4, (n.dur + (d?.dDur ?? 0)) * beatW - 1),
                  height: ROW_H - 1,
                  background: track.color,
                  opacity: 0.35 + (n.vel / 127) * 0.65,
                }}
                title={`${noteName(n.pitch)} vel ${n.vel}`}
                onMouseDown={(e) => onNoteDown(e, i, "move")}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="note-resize" onMouseDown={(e) => onNoteDown(e, i, "resize")} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
