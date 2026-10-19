import { addClip, addEffect, addTrack } from "./ops";
import type { Note, Project } from "./types";

// Petit projet de départ pour entendre quelque chose dès l'ouverture.
export function demoProject(): Project {
  const p: Project = {
    name: "Sans titre",
    bpm: 122,
    beatsPerBar: 4,
    lengthBars: 8,
    loop: { enabled: true, startBar: 0, endBar: 4 },
    master: { volume: -3, limiter: true },
    tracks: [],
  };

  const drums = addTrack(p, { name: "Drums", kind: "drums", preset: "techno" });
  const dn: Note[] = [];
  for (let b = 0; b < 16; b++) {
    dn.push({ pitch: 36, start: b, dur: 0.25, vel: 118 });
    dn.push({ pitch: 42, start: b + 0.5, dur: 0.125, vel: 80 });
    if (b % 2 === 1) dn.push({ pitch: 39, start: b, dur: 0.25, vel: 100 });
  }
  addClip(p, drums.id, { startBar: 0, lengthBars: 4, name: "Beat", notes: dn });

  const bass = addTrack(p, { name: "Bass", kind: "synth", preset: "bass" });
  const roots = [45, 45, 41, 43]; // A, A, F, G
  const bn: Note[] = [];
  roots.forEach((r, bar) => {
    for (const s of [0.5, 1.5, 2.5, 3.5]) bn.push({ pitch: r - 12, start: bar * 4 + s, dur: 0.4, vel: 105 });
  });
  addClip(p, bass.id, { startBar: 0, lengthBars: 4, name: "Bassline", notes: bn });

  const pad = addTrack(p, { name: "Pad", kind: "synth", preset: "pad" });
  const chords = [
    [57, 60, 64],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  const pn: Note[] = chords.flatMap((c, bar) => c.map((pitch) => ({ pitch, start: bar * 4, dur: 4, vel: 80 })));
  addClip(p, pad.id, { startBar: 0, lengthBars: 4, name: "Chords", notes: pn });
  addEffect(p, pad.id, "reverb", { mix: 0.35 });
  pad.volume = -10;

  return p;
}
