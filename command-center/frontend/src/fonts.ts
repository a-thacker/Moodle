// Self-hosted fonts + icon fonts, bundled into the build instead of loaded from
// Google Fonts / unpkg at runtime. This is what lets the installed PWA render
// fully offline (the CDN links used to be a hard dependency) and drops the
// third-party requests entirely. Vite fingerprints the woff2 files into
// /assets and the service worker precaches them (see vite.config globPatterns).
//
// Only the exact weights the UI uses, latin subset only, to keep the precache
// small.

// Body: Instrument Sans (400/500/600)
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-500.css";
import "@fontsource/instrument-sans/latin-600.css";
// UI sans fallback: Inter (400/500/600)
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
// Display: Space Grotesk (400/500/600/700)
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
// Mono: JetBrains Mono (400/500/700)
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";

// Phosphor icon fonts — only the two weights the app renders (.ph / .ph-fill).
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
