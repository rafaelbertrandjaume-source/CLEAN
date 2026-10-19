import { useRef, useState } from "react";
import { useChat } from "../agent/chat";
import { engine } from "../engine/engine";
import { addClip, addTrack } from "../state/ops";
import { useProject } from "../state/store";
import type { Clip, Track } from "../state/types";
import { IconClose, Spark } from "./icons";
import { usePlayhead } from "./usePlayhead";

export function Arrangement() {
  const project = useProject((s) => s.project);
  const edit = useProject((s) => s.edit);
  const [barW, setBarW] = useState(50);
  const { beat } = usePlayhead();
  const totalBars = Math.max(project.lengthBars + 8, 32);
  const width = totalBars * barW;
  const loopDrag = useRef<number | null>(null);
  const { loop } = project;

  const barAt = (e: React.MouseEvent, el: HTMLElement) => Math.max(0, Math.floor((e.clientX - el.getBoundingClientRect().left) / barW));

  return (
    <section className="arrangement" aria-label="Arrangement">
      <div className="track-headers">
        <div className="headers-top">
          <span className="caps">Pistes</span>
          <input type="range" min={20} max={120} value={barW} aria-label="Zoom horizontal" onChange={(e) => setBarW(Number(e.target.value))} />
        </div>
        {project.tracks.map((t) => (
          <TrackHeader key={t.id} track={t} />
        ))}
        <div className="add-track">
          <button className="dashed" onClick={() => edit((p) => void addTrack(p, { name: `Synth ${p.tracks.length + 1}`, kind: "synth" }))}>
            + Synth
          </button>
          <button className="dashed" onClick={() => edit((p) => void addTrack(p, { name: "Drums", kind: "drums" }))}>
            + Drums
          </button>
        </div>
      </div>

      <div className="timeline" style={{ width }}>
        <div
          className="ruler"
          title="Clic : déplacer la lecture. Glisser : définir la boucle."
          onMouseDown={(e) => (loopDrag.current = barAt(e, e.currentTarget))}
          onMouseUp={(e) => {
            const start = loopDrag.current;
            loopDrag.current = null;
            if (start === null) return;
            const end = barAt(e, e.currentTarget);
            if (end === start) engine.seek(start * project.beatsPerBar);
            else edit((p) => void (p.loop = { enabled: true, startBar: Math.min(start, end), endBar: Math.max(start, end) + 1 }));
          }}
        >
          {loop.enabled && <div className="loop-bar" style={{ left: loop.startBar * barW, width: (loop.endBar - loop.startBar) * barW }} />}
          {Array.from({ length: totalBars }, (_, i) => (
            <span key={i} style={{ left: i * barW }} className={i % 4 === 0 ? "major" : ""}>
              {i % 4 === 0 || barW > 36 ? i + 1 : ""}
            </span>
          ))}
        </div>
        {loop.enabled && <div className="loop-band" style={{ left: loop.startBar * barW, width: (loop.endBar - loop.startBar) * barW }} />}
        <div className="song-end" style={{ left: project.lengthBars * barW }} />

        {project.tracks.map((t) => (
          <Lane key={t.id} track={t} barW={barW} width={width} />
        ))}

        <div className="playhead" style={{ left: (beat / project.beatsPerBar) * barW }} />
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
  // Position du fader : -60..+6 dB ramené à 0..100 %
  const pct = ((track.volume + 60) / 66) * 100;

  return (
    <div className={`track-header ${selected ? "selected" : ""}`} onMouseDown={() => !selected && select(track.id)}>
      <div className="chip" style={{ background: track.color }} />
      <div className="body">
        <div className="row">
          <input className="track-name" aria-label="Nom de la piste" value={track.name} onChange={(e) => set((t) => void (t.name = e.target.value))} />
          <button className={`ms ${track.mute ? "mute-on" : ""}`} aria-label="Mute" aria-pressed={track.mute} onClick={() => set((t) => void (t.mute = !t.mute))}>
            M
          </button>
          <button className={`ms ${track.solo ? "solo-on" : ""}`} aria-label="Solo" aria-pressed={track.solo} onClick={() => set((t) => void (t.solo = !t.solo))}>
            S
          </button>
          <button
            className="ms del"
            aria-label="Supprimer la piste"
            onClick={(e) => {
              e.stopPropagation();
              edit((p) => void (p.tracks = p.tracks.filter((t) => t.id !== track.id)));
            }}
          >
            <IconClose />
          </button>
        </div>
        <div className="row">
          <span className="inst">{track.instrument.kind === "drums" ? `drums/${track.instrument.preset}` : `synth/${track.instrument.preset}`}</span>
          <input
            type="range"
            className="fader"
            aria-label="Volume"
            min={-60}
            max={6}
            step={0.5}
            value={track.volume}
            style={{ "--c": track.color, "--p": `${pct}%` } as React.CSSProperties}
            onDoubleClick={() => set((t) => void (t.volume = 0))}
            onChange={(e) => set((t) => void (t.volume = Number(e.target.value)))}
          />
          <span className="db">{track.volume <= -60 ? "-∞" : track.volume.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function Lane({ track, barW, width }: { track: Track; barW: number; width: number }) {
  const beatsPerBar = useProject((s) => s.project.beatsPerBar);
  const edit = useProject((s) => s.edit);
  const select = useProject((s) => s.select);

  return (
    <div
      className="lane"
      style={{ width, backgroundSize: `${barW}px 100%` }}
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
        <ClipView key={c.id} clip={c} track={track} barW={barW} beatsPerBar={beatsPerBar} />
      ))}
    </div>
  );
}

function ClipView({ clip, track, barW, beatsPerBar }: { clip: Clip; track: Track; barW: number; beatsPerBar: number }) {
  const edit = useProject((s) => s.edit);
  const select = useProject((s) => s.select);
  const selected = useProject((s) => s.selectedClipId === clip.id);
  const byAgent = useChat((s) => s.touched.clips.has(clip.id));
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
  const muted = track.mute;

  return (
    <div
      className={`clip ${selected ? "selected" : ""} ${byAgent ? "agent" : ""} ${muted ? "muted" : ""}`}
      style={{
        left: (clip.startBar + (drag?.dx ?? 0)) * barW + 1,
        width: Math.max(1, clip.lengthBars + (drag?.dw ?? 0)) * barW - 3,
        background: `${track.color}${muted ? "14" : "26"}`,
        borderColor: `${track.color}88`,
      }}
      title={byAgent ? "Créé ou modifié par l’agent au dernier tour" : undefined}
      onMouseDown={(e) => startDrag(e, "move")}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="clip-name" style={{ color: track.color }}>
        {byAgent && <Spark />}
        {clip.name}
      </div>
      <svg className="notes" viewBox={`0 0 ${beats} 100`} preserveAspectRatio="none" aria-hidden="true">
        {clip.notes.map((n, i) => (
          <rect key={i} x={n.start} width={Math.max(n.dur, beats / 300)} y={90 - ((n.pitch - lo) / range) * 82} height={8} rx={0.05} fill={track.color} />
        ))}
      </svg>
      <div className="resize" onMouseDown={(e) => startDrag(e, "resize")} />
    </div>
  );
}
