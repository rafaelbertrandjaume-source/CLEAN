import { useEffect, useState } from "react";
import { engine } from "../engine/engine";

// Position de lecture rafraîchie à chaque image pendant la lecture.
export function usePlayhead(): { beat: number; playing: boolean } {
  const [state, setState] = useState({ beat: engine.positionBeats(), playing: engine.playing });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setState({ beat: engine.positionBeats(), playing: engine.playing });
      if (engine.playing) raf = requestAnimationFrame(loop);
    };
    const off = engine.onChange(() => {
      cancelAnimationFrame(raf);
      loop();
    });
    loop();
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, []);
  return state;
}
