import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Minimal typing for the Node global (we don't pull in @types/node just for this).
declare const process: { env: Record<string, string | undefined> };

// Dev server proxies /api to the FastAPI backend so the browser talks to one
// origin (no CORS in dev). Point it at a backend with CC_BACKEND, e.g.
//   CC_BACKEND=http://athacker-cc:8000 npm run dev   (the live server, via Tailscale)
// Defaults to a backend running locally on :8000.
const BACKEND = process.env.CC_BACKEND || "http://localhost:8000";

export default defineConfig({
  plugins: [
    react(),
    // Installable PWA: the app opens standalone (its own window, no browser
    // chrome) once added to the home screen. `registerType: "prompt"` means we
    // never swap versions under the user's feet — the app surfaces a "reload to
    // update" toast when a new service worker is waiting (see src/pwa.ts).
    VitePWA({
      registerType: "prompt",
      // The `.ico` isn't managed by the plugin; list the assets it should copy
      // through to the build as-is (icons live in public/).
      includeAssets: ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png"],
      manifest: {
        name: "Command Center",
        short_name: "Command",
        description: "Your personal command center — grades, deadlines, groceries, and more.",
        // Standalone: launches like a native app, no address bar or tabs.
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait",
        // Nocturne dark theme (--color-bg). Colors the splash + status bar.
        theme_color: "#161826",
        background_color: "#161826",
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Padded safe-zone icon so Android doesn't crop the logo on a mask.
          { src: "/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (hashed JS/CSS/HTML). Unknown routes fall
        // back to index.html so client-side routing works offline.
        navigateFallback: "/index.html",
        // Never let the SW answer for the API: this is live, auth-gated data, so
        // a cached response would be stale or leak across sessions. Let it hit
        // the network and surface the app's normal error states when offline.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
      // Enable the SW in `vite dev` too, so install/standalone can be tested
      // locally (still requires a secure context — localhost counts).
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
