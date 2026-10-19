import { useEffect, useState } from "react";
import { engine } from "../engine/engine";
import { useProject } from "../state/store";
import { Arrangement } from "./Arrangement";
import { ChatPanel } from "./ChatPanel";
import { DevicePanel } from "./DevicePanel";
import { PianoRoll } from "./PianoRoll";
import { Transport } from "./Transport";

export function App() {
  const [bottom, setBottom] = useState<"editor" | "device">("editor");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        if (engine.playing) engine.stop();
        else void engine.play();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && useProject.getState().selectedClipId) {
        const id = useProject.getState().selectedClipId;
        useProject.getState().edit((p) => {
          for (const t of p.tracks) t.clips = t.clips.filter((c) => c.id !== id);
        });
        useProject.getState().select(useProject.getState().selectedTrackId, null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Transport />
      <div className="main">
        <div className="workspace">
          <Arrangement />
          <div className="bottom">
            <div className="tabs">
              <button className={bottom === "editor" ? "active" : ""} onClick={() => setBottom("editor")}>
                Notes
              </button>
              <button className={bottom === "device" ? "active" : ""} onClick={() => setBottom("device")}>
                Instrument & effets
              </button>
            </div>
            {bottom === "editor" ? <PianoRoll /> : <DevicePanel />}
          </div>
        </div>
        <ChatPanel />
      </div>
    </div>
  );
}
