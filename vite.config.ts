import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe : Tauri pointe sur devUrl http://localhost:1420
export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le build peut être servi depuis n'importe quel dossier (Tauri, Artifact)
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
