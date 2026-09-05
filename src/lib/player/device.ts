/** Best-effort phone niceties. Every call is optional and swallowed on failure. */

let wakeLock: WakeLockSentinel | null = null;

export async function keepScreenAwake(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  const request = async () => {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      wakeLock = null;
    }
  };
  await request();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!wakeLock || wakeLock.released)) void request();
  });
}

export function tryFullscreen(): void {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
}

export function vibrate(ms = 12): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}
