import { useRef, useState } from "react";
import { engine } from "../engine/engine";
import { addClip, addTrack } from "../state/ops";
import { useProject } from "../state/store";
import type { Clip, Track } from "../state/types";
import { usePlayhead } from "./usePlayhead";

const LANE_H = 56;

export function Arrangement() {
  const project = useProject((s) => s.project);
  const edit = useProject((s) => s.edit);
  const [barW, setBarW] = useState(48);
  const { beat } = usePlayhead();
  const totalBars = Math.max(project.lengthBars + 8, 32);
  const width = totalBars * barW;
  const loopDrag = useRef<number | null>(null);

  const barAt = (e: React.MouseEvent, el: HTMLElement) => Math.max(0, Math.floor((e.clientX - el.getBoundingClientRect().left) / barW));

  return (
    <section className="arrangement">
      <div className="track-headers">
        <div className="ruler-spacer">
          <input type="range" min={20} max={120} value={barW} title="Zoom" onChange={(e) => setBarW(Number(e.target.value))} />
        </div>
        {project.tracks.map((t) => (
          <TrackHeader key={t.id} track={t} />
        ))}
        <div className="add-track">
          <button onClick={() => edit((p) => void addTrack(p, { name: `Synth ${p.tracks.length + 1}`, kind: "synth" }))}>+ Synth</button>
          <button onClick={() => edit((p) => void addTrack(p, { name: "Drums", kind: "drums" }))}>+ Drums</button>
        </div>
      </div>

      <div className="timeline-scroll">
        <div className="timeline" style={{ width }}>
          <div
            className="ruler"
            title="Clic : déplacer la lecture. Glisser : définir la boucle."
            onMouseDown={(e) => {
              loopDrag.current = barAt(e, e.currentTarget);
            }}
            onMouseUp={(e) => {
              const start = loopDrag.current;
              loopDrag.current = null;
              if (start === null) return;
              const end = barAt(e, e.currentTarget);
              if (end === start) engine.seek(start * project.beatsPerBar);
              else
                edit((p) => {
                  p.loop = { enabled: true, startBar: Math.min(start, end), endBar: Math.max(start, end) + 1 };
                });
            }}
          >
            {project.loop.enabled && (
              <div className="loop-region" style={{ left: project.loop.startBar * barW, width: (project.loop.endBar - project.loop.startBar) * barW }} />
            )}
            {Array.from({ length: totalBars }, (_, i) => (
              <span key={i} style={{ left: i * barW }} className={i % 4 === 0 ? "major" : ""}>
                {i % 4 === 0 || barW > 36 ? i + 1 : ""}
              </span>
            ))}
            <div className="song-end" style={{ left: project.lengthBars * barW }} />
          </div>

          {project.tracks.map((t) => (
            <Lane key={t.id} track={t} barW={barW} width={width} />
          ))}

          <div className="playhead" style={{ left: (beat / project.beatsPerBar) * barW }} />
        </div>
      </div>
    </section>
  );
}

function TrackHeader({ track }: { track: Track }) {
  const edit = useProject((s) => s.edit);
  const selected = useProject((s) => s.selectedTrackId === track.id);
  const select = useProject((s) => s.select);
  const set = (fn: (t: Track) => void) =>
    edit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    });

  return (
    <div className={`track-header ${selected ? "selected" : ""}`} style={{ height: LANE_H, borderLeftColor: track.color }} onClick={() => select(track.id)}>
      <div className="row">
        <input className="track-name" value={track.name} onChange={(e) => set((t) => void (t.name = e.target.value))} />
        <button className={track.mute ? "on mute" : ""} onClick={() => set((t) => void (t.mute = !t.mute))} title="Mute">M</button>
        <button className={track.solo ? "on solo" : ""} onClick={() => set((t) => void (t.solo = !t.solo))} title="Solo">S</button>
        <button
          title="Supprimer la piste"
          onClick={(e) => {
            e.stopPropagation();
            edit((p) => void (p.tracks = p.tracks.filter((t) => t.id !== track.id)));
          }}
        >
          ×
        </button>
      </div>
      <div className="row">
        <span className="kind">{track.instrument.kind === "drums" ? "drums" : track.instrument.preset}</span>
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={track.volume}
          title={`${track.volume} dB`}
          onChange={(e) => set((t) => void (t.volume = Number(e.target.value)))}
        />
        <input
          type="range"
          className="pan"
          min={-1}
          max={1}
          step={0.05}
          value={track.pan}
          title={`Pan ${track.pan}`}
          onDoubleClick={() => set((t) => void (t.pan = 0))}
          onChange={(e) => set((t) => void (t.pan = Number(e.target.value)))}
        />
      </div>
    </div>
  );
}

function Lane({ track, barW, width }: { track: Track; barW: number; width: number }) {
  const project = useProject((s) => s.project);
  const edit = useProject((s) => s.edit);
  const select = useProject((s) => s.select);

  return (
    <div
      className="lane"
      style={{ height: LANE_H, width, backgroundSize: `${barW}px 100%` }}
      onDoubleClick={(e) => {
        const bar = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / barW);
        try {
          let id = "";
          edit((p) => void (id = addClip(p, track.id, { startBar: bar, lengthBars: 1 }).id));
          select(track.id, id);
        } catch {
          /* chevauchement : rien à faire */
        }
      }}
    >
      {track.clips.map((c) => (
        <ClipView key={c.id} clip={c} track={track} barW={barW} beatsPerBar={project.beatsPerBar} />
      ))}
    </div>
  );
}

function ClipView({ clip, track, barW, beatsPerBar }: { clip: Clip; track: Track; barW: number; beatsPerBar: number }) {
  const edit = useProject((s) => s.edit);
  const select = useProject((s) => s.select);
  const selected = useProject((s) => s.selectedClipId === clip.id);
  const [drag, setDrag] = useState<{ dx: number; dw: number } | null>(null);

  const startDrag = (e: React.MouseEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    select(track.id, clip.id);
    const x0 = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const d = Math.round((ev.clientX - x0) / barW);
      setDrag(mode === "move" ? { dx: d, dw: 0 } : { dx: 0, dw: d });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDrag(null);
      const d = Math.round((ev.clientX - x0) / barW);
      if (!d) return;
      try {
        edit((p) => {
          const t = p.tracks.find((x) => x.id === track.id)!;
          const c = t.clips.find((x) => x.id === clip.id)!;
          const ns = mode === "move" ? Math.max(0, c.startBar + d) : c.startBar;
          const nl = mode === "resize" ? Math.max(1, c.lengthBars + d) : c.lengthBars;
          if (t.clips.some((o) => o !== c && ns < o.startBar + o.lengthBars && o.startBar < ns + nl)) throw new Error("overlap");
          c.startBar = ns;
          c.lengthBars = nl;
          p.lengthBars = Math.max(p.lengthBars, ns + nl);
        });
      } catch {
        /* chevauchement refusé */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beats = clip.lengthBars * beatsPerBar;
  const pitches = clip.notes.map((n) => n.pitch);
  const lo = Math.min(...pitches, 127);
  const hi = Math.max(...pitches, 0);
  const range = Math.max(hi - lo, 1);

  return (
    <div
      className={`clip ${selected ? "selected" : ""}`}
      style={{
        left: (clip.startBar + (drag?.dx ?? 0)) * barW,
        width: Math.max(1, clip.lengthBars + (drag?.dw ?? 0)) * barW - 2,
        background: `${track.color}33`,
        borderColor: track.color,
      }}
      onMouseDown={(e) => startDrag(e, "move")}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="clip-name" style={{ background: track.color }}>{clip.name}</div>
      <svg viewBox={`0 0 ${beats} 100`} preserveAspectRatio="none">
        {clip.notes.map((n, i) => (
          <rect key={i} x={n.start} width={Math.max(n.dur, beats / 200)} y={88 - ((n.pitch - lo) / range) * 76} height={6} fill={track.color} />
        ))}
      </svg>
      <div className="resize" onMouseDown={(e) => startDrag(e, "resize")} />
    </div>
  );
}
