import { create } from "zustand";
import type { Project } from "./types";
import { demoProject } from "./demo";

const MAX_HISTORY = 100;
let lastCoalesce: { key: string | null; at: number } = { key: null, at: 0 };

interface ProjectStore {
  project: Project;
  past: Project[];
  future: Project[];
  // Transaction ouverte : les modifications s'accumulent dans une seule entrée d'historique
  // (un tour complet de l'agent = un seul undo).
  txOpen: boolean;
  selectedTrackId: string | null;
  selectedClipId: string | null;

  // coalesce : les éditions successives portant la même clé (geste continu sur un
  // potentiomètre, un fader) forment une seule entrée d'historique.
  edit: (mutate: (draft: Project) => void, opts?: { coalesce?: string }) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  select: (trackId: string | null, clipId?: string | null) => void;
}

export const useProject = create<ProjectStore>((set, get) => ({
  project: demoProject(),
  past: [],
  future: [],
  txOpen: false,
  selectedTrackId: null,
  selectedClipId: null,

  edit: (mutate, opts) => {
    const { project, past, txOpen } = get();
    const draft = structuredClone(project);
    mutate(draft); // peut lever une erreur : l'état reste alors inchangé
    const now = Date.now();
    const merge = !!opts?.coalesce && opts.coalesce === lastCoalesce.key && now - lastCoalesce.at < 1000;
    lastCoalesce = { key: opts?.coalesce ?? null, at: now };
    set({
      project: draft,
      past: txOpen || merge ? past : [...past, project].slice(-MAX_HISTORY),
      future: [],
    });
  },

  beginTransaction: () => {
    const { project, past } = get();
    set({ txOpen: true, past: [...past, project].slice(-MAX_HISTORY), future: [] });
  },

  endTransaction: () => {
    const { past, project } = get();
    // Transaction vide : on retire l'entrée d'historique inutile
    if (past.length && past[past.length - 1] === project) set({ past: past.slice(0, -1) });
    set({ txOpen: false });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1) });
  },

  load: (p) => set({ project: p, past: [], future: [], selectedTrackId: null, selectedClipId: null }),

  select: (trackId, clipId = null) => set({ selectedTrackId: trackId, selectedClipId: clipId }),
}));

export const projectNow = () => useProject.getState().project;
