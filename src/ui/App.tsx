import { useEffect } from "react";
import { engine } from "../engine/engine";
import { useProject } from "../state/store";
import { Arrangement } from "./Arrangement";
import { BottomPanel } from "./BottomPanel";
import { ChatPanel } from "./ChatPanel";
import { Transport } from "./Transport";

export function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "slider") return;
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
        <main className="workspace">
          <Arrangement />
          <BottomPanel />
        </main>
        <ChatPanel />
      </div>
    </div>
  );
}
