// Icônes au trait, reprises de la maquette. Décoratives : le bouton porte l'aria-label.

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

export const IconRewind = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <path d="M3 2v10M11 2 5 7l6 5z" />
  </svg>
);
export const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
  </svg>
);
export const IconStop = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" rx="1" fill="currentColor" />
  </svg>
);
export const IconLoop = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <path d="M2 6V5a2 2 0 0 1 2-2h7l-2-2M12 8v1a2 2 0 0 1-2 2H3l2 2" />
  </svg>
);
export const IconUndo = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <path d="M5 2 2 5l3 3M2 5h6a4 4 0 0 1 0 8H6" />
  </svg>
);
export const IconRedo = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <path d="m9 2 3 3-3 3M12 5H6a4 4 0 0 0 0 8h2" />
  </svg>
);
export const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <path d="M7 2v10M2 7h10" />
  </svg>
);
export const IconGear = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}>
    <circle cx="7" cy="7" r="2" />
    <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" />
  </svg>
);
export const IconClose = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}>
    <path d="m2 2 6 6M8 2 2 8" />
  </svg>
);
export const IconPower = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...stroke}>
    <path d="M6 1v5M3.2 3a4 4 0 1 0 5.6 0" />
  </svg>
);
export const IconChevron = ({ open }: { open?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...stroke} style={{ transform: open ? "rotate(90deg)" : undefined }}>
    <path d="m4 3 3 3-3 3" />
  </svg>
);
export const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...stroke}>
    <circle cx="5" cy="5" r="3.5" />
    <path d="m8 8 3 3" />
  </svg>
);
export const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#141413" strokeWidth="1.8" aria-hidden="true">
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </svg>
);
// Étincelle : marque de tout ce que l'agent a créé ou modifié
export const Spark = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
    <path d="M5 0.5 6 4l3.5 1L6 6 5 9.5 4 6 0.5 5 4 4z" fill="var(--agent)" />
  </svg>
);
