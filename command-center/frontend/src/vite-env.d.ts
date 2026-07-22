/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Phosphor icon-font entry points resolve (via the package `exports` map) to CSS
// with no type declarations; declare them so the side-effect imports type-check.
declare module "@phosphor-icons/web/regular";
declare module "@phosphor-icons/web/fill";
