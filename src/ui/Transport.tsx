import { useEffect, useRef, useState } from "react";
import { engine } from "../engine/engine";
import { encodeWav, renderProject } from "../engine/render";
import { saveFile } from "../platform";
import { useProject } from "../state/store";
import type { Project } from "../state/types";
import { IconLoop, IconPlay, IconRedo, IconRewind, IconStop, IconUndo } from "./icons";
import { usePlayhead } from "./usePlayhead";

const download = (blob: Blob, name: string) =>
  saveFile(blob, name).catch(() => {
    /* le viewer a refusé ou annulé l'enregistrement */
  });

export function Transport() {
  const project = useProject((s) => s.project);
  const edit = useProject((s) => s.edit);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const { beat, playing } = usePlayhead();
  const [rendering, setRendering] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bpb = project.beatsPerBar;
  const bar = Math.floor(beat / bpb) + 1;
  const beatInBar = Math.floor(beat % bpb) + 1;
  const sixteenth = Math.floor((beat % 1) * 4) + 1;

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
      setNotice(`Projet illisible : ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <header className="transport">
      <div className="brand">
        <span className="logo">CLEAN</span>
        <input aria-label="Nom du projet" value={project.name} onChange={(e) => edit((p) => void (p.name = e.target.value))} />
      </div>

      <div className="group">
        <button className="icon" aria-label="Retour au début" title="Retour au début" onClick={() => engine.seek(0)}>
          <IconRewind />
        </button>
        <button className={`play ${playing ? "on" : ""}`} aria-label={playing ? "Stop" : "Lecture"} title="Lecture / stop (Espace)" onClick={() => (playing ? engine.stop() : engine.play())}>
          {playing ? <IconStop /> : <IconPlay />}
        </button>
        <button className={`loop ${project.loop.enabled ? "on" : ""}`} aria-label="Boucle" title="Boucle (glisser sur la règle pour la définir)" onClick={() => edit((p) => void (p.loop.enabled = !p.loop.enabled))}>
          <IconLoop />
          {project.loop.startBar + 1}–{project.loop.endBar}
        </button>
      </div>

      <div className="timecode">
        <span className="pos" aria-label="Position">
          {String(bar).padStart(3, "0")}.{beatInBar}.{sixteenth}
        </span>
        <label>
          <input
            type="number"
            aria-label="Tempo"
            min={20}
            max={300}
            step={0.01}
            value={project.bpm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 20 && v <= 300) edit((p) => void (p.bpm = v));
            }}
          />
          BPM
        </label>
        <span className="dim">{bpb}/4</span>
        <label>
          <input
            type="number"
            className="small"
            aria-label="Longueur en mesures"
            min={1}
            max={512}
            value={project.lengthBars}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 1) edit((p) => void (p.lengthBars = v));
            }}
          />
          mes.
        </label>
      </div>

      <div className="spacer" />

      <div className="group">
        <button className="icon" disabled={!canUndo} aria-label="Annuler" title="Annuler (⌘Z)" onClick={() => useProject.getState().undo()}>
          <IconUndo />
        </button>
        <button className="icon" disabled={!canRedo} aria-label="Rétablir" title="Rétablir (⇧⌘Z)" onClick={() => useProject.getState().redo()}>
          <IconRedo />
        </button>
        <div className="menu-wrap">
          <button aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            Projet
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button
                onClick={() => {
                  setMenu(false);
                  download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.name || "clean"}.clean.json`);
                }}
              >
                Enregistrer le projet
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  fileRef.current?.click();
                }}
              >
                Ouvrir un projet…
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && openProject(e.target.files[0])} />
        </div>
        {notice && (
          <span role="alert" style={{ color: "var(--error)", fontSize: 12 }} onClick={() => setNotice(null)}>
            {notice}
          </span>
        )}
        <button className="primary" disabled={rendering} onClick={exportWav}>
          {rendering ? "Rendu…" : "Exporter WAV"}
        </button>
      </div>

      <Meter />
    </header>
  );
}

function Meter() {
  const bars = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(2048);
    const hold = [0, 0];
    const loop = () => {
      const an = engine.analysers;
      let maxDb = -60;
      for (let ch = 0; ch < 2; ch++) {
        let peak = 0;
        if (an && engine.playing) {
          an[ch].getFloatTimeDomainData(buf);
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
        }
        hold[ch] = Math.max(peak, hold[ch] * 0.92);
        const db = hold[ch] > 0.001 ? 20 * Math.log10(hold[ch]) : -60;
        maxDb = Math.max(maxDb, db);
        const el = bars[ch].current;
        if (el) {
          el.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
          el.style.background = db > -1 ? "var(--error)" : db > -6 ? "var(--signal)" : "var(--ok)";
        }
      }
      if (label.current) label.current.textContent = maxDb <= -60 ? "-∞ dB" : `${maxDb.toFixed(1)} dB`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="meter" role="img" aria-label="Crête master">
      <div className="bar">
        <div ref={bars[0]} />
      </div>
      <div className="bar">
        <div ref={bars[1]} />
      </div>
      <div className="scale">
        <span>-60</span>
        <span ref={label}>-∞ dB</span>
      </div>
    </div>
  );
}
