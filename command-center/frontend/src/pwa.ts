// PWA install glue. Two jobs:
//   1. Capture the Android/Chrome `beforeinstallprompt` event the moment it
//      fires (it can arrive before React mounts), stash it, and expose a tiny
//      subscribe/prompt API so a Settings button can trigger the native install
//      sheet on demand.
//   2. Small platform helpers so the UI can show the right thing: iOS Safari
//      has no install prompt (the user must use Share → Add to Home Screen),
//      and an already-installed app shouldn't advertise "Install" at all.
//
// Service-worker registration + the update toast live in the React layer
// (useRegisterSW in components/PwaUpdater.tsx); this module is UI-framework
// agnostic on purpose so it can run at import time from main.tsx.

// The browser's install event, minimally typed (not in lib.dom yet).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's mini-infobar; we drive install from our own button.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  // Once installed, drop the stashed prompt so the button hides itself.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** True when the app is running as an installed standalone PWA. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes standalone here instead of via display-mode.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** True on iOS/iPadOS Safari, which has no programmatic install prompt. */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac; detect it by touch support.
  const iPadOS = ua.includes("Macintosh") && "ontouchend" in document;
  return iOS || iPadOS;
}

/** Whether a native install prompt is currently available to fire. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Fire the stashed native install prompt; resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  // The event can only be used once.
  deferredPrompt = null;
  notify();
  return outcome === "accepted";
}

/** Subscribe to install-availability changes; returns an unsubscribe fn. */
export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
