import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe : Tauri pointe sur devUrl http://localhost:1420
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
