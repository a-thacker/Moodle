import { useRegisterSW } from "virtual:pwa-register/react";

// Registers the service worker and, when a new build is waiting, shows a small
// toast so the user reloads on their own terms (we use registerType "prompt",
// never an automatic swap). Mounted once, high in the tree (App.tsx).
export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Sit above the iOS home indicator when installed standalone.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderRadius: "var(--radius-md, 12px)",
        background: "var(--color-surface, #232532)",
        color: "var(--color-neutral-100, #fff)",
        boxShadow: "var(--shadow-lg, 0 8px 30px rgba(0,0,0,0.4))",
        fontFamily: "var(--font-body)",
        fontSize: "14px",
      }}
    >
      <span>A new version is ready.</span>
      <button className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button
        className="btn btn-ghost"
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </button>
    </div>
  );
}
