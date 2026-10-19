import { useState } from "react";
import { useChat } from "../agent/chat";
import { findClip } from "../state/ops";
import { useProject } from "../state/store";
import { DevicePanel } from "./DevicePanel";
import { Spark } from "./icons";
import { PianoRoll, noteName } from "./PianoRoll";

// Tonalité approximative : la note la plus fréquente sert de repère dans la barre d'outils.
function tonalCenter(pitches: number[]): string | null {
  if (!pitches.length) return null;
  const count = new Map<number, number>();
  for (const p of pitches) count.set(p % 12, (count.get(p % 12) ?? 0) + 1);
  const [pc] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return noteName(pc + 12).replace(/-?\d+$/, "");
}

export function BottomPanel() {
  const [tab, setTab] = useState<"notes" | "device">("notes");
  const [snap, setSnap] = useState(0.25);
  const [beatW, setBeatW] = useState(48);
  const project = useProject((s) => s.project);
  const trackId = useProject((s) => s.selectedTrackId);
  const clipId = useProject((s) => s.selectedClipId);
  const setDraft = useChat((s) => s.setDraft);

  let found: ReturnType<typeof findClip> | null = null;
  try {
    found = clipId ? findClip(project, clipId) : null;
  } catch {
    found = null;
  }
  const track = found?.track ?? project.tracks.find((t) => t.id === trackId) ?? null;
  const clip = found?.clip ?? null;
  const center = clip && track?.instrument.kind === "synth" ? tonalCenter(clip.notes.map((n) => n.pitch)) : null;

  const ask = () => {
    if (!track) return;
    const target = tab === "device" ? `Pour la piste ${track.name}, crée un son : ` : clip ? `Dans le clip ${clip.name} (${track.name}), ` : `Sur la piste ${track.name}, `;
    setDraft(target);
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };

  return (
    <section className="bottom" aria-label="Éditeur">
      <div className="bottom-bar">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
            Notes
          </button>
          <button role="tab" aria-selected={tab === "device"} onClick={() => setTab("device")}>
            Instrument &amp; effets
          </button>
        </div>
        {track && (
          <span className="ctx">
            <i style={{ background: track.color }} />
            {track.name}
            {tab === "notes" && clip ? ` / ${clip.name}` : ""}
          </span>
        )}
        {tab === "notes" && clip && (
          <span className="meta">
            mes. {clip.startBar + 1}–{clip.startBar + clip.lengthBars} · {clip.notes.length} notes{center ? ` · centre ${center}` : ""}
          </span>
        )}
        <div className="spacer" />
        {tab === "notes" && clip && (
          <>
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
          </>
        )}
        {track && (
          <button className="agent-soft" onClick={ask}>
            <Spark />
            {tab === "device" ? "Décrire un son" : "Demander à l’agent"}
          </button>
        )}
      </div>

      {tab === "notes" ? (
        track && clip ? (
          <PianoRoll track={track} clip={clip} snap={snap} beatW={beatW} />
        ) : (
          <div className="empty-editor">Sélectionne un clip, ou double-clique sur une piste pour en créer un.</div>
        )
      ) : track ? (
        <DevicePanel track={track} />
      ) : (
        <div className="empty-editor">Sélectionne une piste.</div>
      )}
    </section>
  );
}
