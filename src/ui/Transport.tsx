import { useEffect, useRef, useState } from "react";
import { engine } from "../engine/engine";
import { encodeWav, renderProject } from "../engine/render";
import { useProject } from "../state/store";
import type { Project } from "../state/types";
import { usePlayhead } from "./usePlayhead";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Transport() {
  const project = useProject((s) => s.project);
  const edit = useProject((s) => s.edit);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const { beat, playing } = usePlayhead();
  const [rendering, setRendering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bar = Math.floor(beat / project.beatsPerBar) + 1;
  const beatInBar = Math.floor(beat % project.beatsPerBar) + 1;

  const exportWav = async () => {
    setRendering(true);
    try {
      download(encodeWav(await renderProject(project)), `${project.name || "clean"}.wav`);
    } finally {
      setRendering(false);
    }
  };

  const openProject = async (file: File) => {
    try {
      const p = JSON.parse(await file.text()) as Project;
      if (!Array.isArray(p.tracks) || typeof p.bpm !== "number") throw new Error("format inattendu");
      engine.stop(true);
      useProject.getState().load(p);
    } catch (e) {
      alert(`Projet illisible : ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <header className="transport">
      <div className="brand">CLEAN</div>
      <div className="group">
        <button title="Retour au début" onClick={() => engine.seek(0)}>⏮</button>
        <button className={playing ? "on" : ""} title="Lecture / Stop (Espace)" onClick={() => (playing ? engine.stop() : engine.play())}>
          {playing ? "■" : "▶"}
        </button>
        <span className="position">
          {bar}.{beatInBar}
        </span>
      </div>
      <div className="group">
        <label>
          BPM
          <input
            type="number"
            min={20}
            max={300}
            value={project.bpm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 20 && v <= 300) edit((p) => void (p.bpm = v));
            }}
          />
        </label>
        <button
          className={project.loop.enabled ? "on" : ""}
          title="Boucle"
          onClick={() => edit((p) => void (p.loop.enabled = !p.loop.enabled))}
        >
          ⟲ {project.loop.startBar + 1}–{project.loop.endBar}
        </button>
        <label>
          Mesures
          <input
            type="number"
            min={1}
            max={512}
            value={project.lengthBars}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 1) edit((p) => void (p.lengthBars = v));
            }}
          />
        </label>
      </div>
      <div className="group">
        <button disabled={!canUndo} title="Annuler (⌘Z)" onClick={() => useProject.getState().undo()}>↶</button>
        <button disabled={!canRedo} title="Rétablir (⇧⌘Z)" onClick={() => useProject.getState().redo()}>↷</button>
      </div>
      <div className="group">
        <button onClick={() => download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.name || "clean"}.clean.json`)}>
          Enregistrer
        </button>
        <button onClick={() => fileRef.current?.click()}>Ouvrir</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && openProject(e.target.files[0])} />
        <button disabled={rendering} onClick={exportWav}>
          {rendering ? "Rendu…" : "Export WAV"}
        </button>
      </div>
      <Meter />
    </header>
  );
}

function Meter() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(2048);
    let peakHold = 0;
    const loop = () => {
      const a = engine.analyser;
      let peak = 0;
      if (a && engine.playing) {
        a.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
      }
      peakHold = Math.max(peak, peakHold * 0.92);
      const db = peakHold > 0 ? 20 * Math.log10(peakHold) : -60;
      if (ref.current) {
        ref.current.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
        ref.current.style.background = db > -1 ? "var(--danger)" : db > -6 ? "var(--warn)" : "var(--ok)";
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="meter" title="Crête master">
      <div ref={ref} />
    </div>
  );
}
