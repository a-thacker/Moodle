import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal typing for the Node global (we don't pull in @types/node just for this).
declare const process: { env: Record<string, string | undefined> };

// Dev server proxies /api to the FastAPI backend so the browser talks to one
// origin (no CORS in dev). Point it at a backend with CC_BACKEND, e.g.
//   CC_BACKEND=http://athacker-cc:8000 npm run dev   (the live server, via Tailscale)
// Defaults to a backend running locally on :8000.
const BACKEND = process.env.CC_BACKEND || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
