// Web Push subscription glue for the installed PWA. Distinct from pwa.ts (which
// handles the *install* prompt): this asks for notification permission and
// registers the browser's push subscription with the backend, so the daily task
// reminders arrive as native notifications.
//
// iOS caveat: Web Push only exists once the app is installed to the Home Screen
// (iOS 16.4+) and launched from there — in a plain Safari tab PushManager is
// absent, so pushSupported() is false and the UI guides the user to install
// first. requestPermission() must also run from a user gesture (a button tap).

import { api } from "./api/client";

/** True when this context can do Web Push at all (SW + Push API present). */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current notification permission, or "unsupported" here. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

// VAPID keys travel as URL-safe base64; subscribe() wants the raw bytes. Build
// the view over an explicit ArrayBuffer so its type is Uint8Array<ArrayBuffer>
// (a BufferSource), which is what applicationServerKey expects.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask permission (must be called from a user gesture on iOS) and register a push
 * subscription with the backend. Returns the resulting permission — callers
 * should check for "granted" before treating it as on.
 */
export async function enablePush(): Promise<NotificationPermission> {
  if (!pushSupported()) throw new Error("Push notifications aren't supported here.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const reg = await navigator.serviceWorker.ready;
  const { public_key } = await api.push.vapidPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // iOS has no silent push; every push shows a notification
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });
  }
  await api.push.subscribe(sub.toJSON());
  return permission;
}

/** Remove this browser's push subscription (local + backend). Best-effort. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe();
  try {
    await api.push.unsubscribe(endpoint);
  } catch {
    /* the browser-side unsubscribe is what matters; the server prunes dead ones */
  }
}

/** Whether this browser currently holds an active push subscription. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) !== null;
}
