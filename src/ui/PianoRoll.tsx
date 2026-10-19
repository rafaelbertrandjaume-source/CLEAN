import { useEffect, useRef, useState } from "react";
import { findClip } from "../state/ops";
import { DRUM_MAP } from "../state/presets";
import { useProject } from "../state/store";
import type { Clip, Note, Track } from "../state/types";

const ROW_H = 12;
const VEL_H = 52;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);

type Drag = { index: number; dBeat: number; dPitch: number; dDur: number } | null;

export function PianoRoll({ track, clip, snap, beatW }: { track: Track; clip: Clip; snap: number; beatW: number }) {
  const beatsPerBar = useProject((s) => s.project.beatsPerBar);
  const edit = useProject((s) => s.edit);
  const lastDur = useRef(snap);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [velDrag, setVelDrag] = useState<{ index: number; vel: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const isDrums = track.instrument.kind === "drums";
  const [lo, hi] = isDrums ? [35, 52] : [24, 96];
  const rows = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  const beats = clip.lengthBars * beatsPerBar;
  const width = beats * beatW;

  // Centre la vue verticale sur les notes du clip quand on change de clip
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ps = clip.notes.map((n) => n.pitch);
    const center = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 60;
    el.scrollTop = (hi - center) * ROW_H - (el.clientHeight - VEL_H) / 2;
    setSelected(null);
  }, [clip.id]);

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
      setSelected(null);
      return;
    }
    setSelected(index);
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

  // Vélocité : on attrape la barre la plus proche du clic puis on la règle verticalement
  const onVelDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = -1;
    let bestDist = 8;
    clip.notes.forEach((n, i) => {
      const dist = Math.abs(n.start * beatW + 1 - x);
      if (dist < bestDist || (dist === bestDist && i === selected)) {
        best = i;
        bestDist = dist;
      }
    });
    if (best < 0) return;
    const velAt = (y: number) => Math.max(1, Math.min(127, Math.round(((r.bottom - 4 - y) / (VEL_H - 10)) * 127)));
    setSelected(best);
    setVelDrag({ index: best, vel: velAt(e.clientY) });
    const onMove = (ev: MouseEvent) => setVelDrag({ index: best, vel: velAt(ev.clientY) });
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setVelDrag(null);
      const vel = velAt(ev.clientY);
      editNotes((ns) => ns.map((n, i) => (i === best ? { ...n, vel } : n)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="piano-roll" ref={scrollRef}>
      <div className="pr-inner" style={{ gridTemplateColumns: `56px ${width}px` }}>
        <div className="pr-keys">
          {rows.map((p) => (
            <div key={p} className={`key ${isDrums ? "drum" : isBlack(p) ? "black" : ""}`} style={{ height: ROW_H }}>
              {isDrums ? (DRUM_MAP[p] ?? "") : p % 12 === 0 ? noteName(p) : ""}
            </div>
          ))}
        </div>
        <div
          className="pr-grid"
          style={{
            width,
            height: rows.length * ROW_H,
            backgroundImage: "linear-gradient(to right, #34343a 1px, transparent 1px), linear-gradient(to right, #222226 1px, transparent 1px)",
            backgroundSize: `${beatW * beatsPerBar}px 100%, ${beatW}px 100%`,
          }}
          onMouseDown={onGridDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {rows.map((p, i) => (
            <div key={p} className={`pr-row ${!isDrums && isBlack(p) ? "black" : ""}`} style={{ top: i * ROW_H, height: ROW_H }} />
          ))}
          {clip.notes.map((n, i) => {
            const d = drag?.index === i ? drag : null;
            const pitch = n.pitch + (d?.dPitch ?? 0);
            if (pitch < lo || pitch > hi) return null;
            const vel = velDrag?.index === i ? velDrag.vel : n.vel;
            return (
              <div
                key={i}
                className={`note ${selected === i ? "selected" : ""}`}
                style={{
                  left: (n.start + (d?.dBeat ?? 0)) * beatW,
                  top: (hi - pitch) * ROW_H + 1,
                  width: Math.max(4, (n.dur + (d?.dDur ?? 0)) * beatW - 2),
                  height: ROW_H - 2,
                  background: track.color,
                  opacity: 0.4 + (vel / 127) * 0.6,
                }}
                title={`${isDrums ? (DRUM_MAP[n.pitch] ?? noteName(n.pitch)) : noteName(n.pitch)} · vélocité ${vel}`}
                onMouseDown={(e) => onNoteDown(e, i, "move")}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="note-resize" onMouseDown={(e) => onNoteDown(e, i, "resize")} />
              </div>
            );
          })}
        </div>
        <div className="vel-corner caps">Vél.</div>
        <div className="vel-lane" style={{ width, height: VEL_H }} onMouseDown={onVelDown} aria-label="Vélocités">
          {clip.notes.map((n, i) => {
            const vel = velDrag?.index === i ? velDrag.vel : n.vel;
            return (
              <div
                key={i}
                className="vel"
                style={{
                  left: n.start * beatW,
                  height: Math.round((vel / 127) * (VEL_H - 10)),
                  background: selected === i ? "var(--text)" : track.color,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
