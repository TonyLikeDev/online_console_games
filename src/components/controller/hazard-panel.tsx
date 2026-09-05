"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NEUTRAL_INPUT, type InputState } from "@/lib/protocol";
import { vibrate } from "@/lib/player/device";

export const HAZARD_COOLDOWN_MS = 8000;

/**
 * What an eliminated player's phone turns into: one big button that fires the
 * game's hazard. The game enforces the cooldown too; this one is for feedback.
 */
export function HazardPanel({ label, onChange }: { label: string; onChange: (state: InputState) => void }) {
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const held = useRef(false);

  useEffect(() => {
    if (readyAt <= now) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [readyAt, now]);

  const remaining = Math.max(0, readyAt - now);
  const ready = remaining === 0;

  const press = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (!ready || held.current) return;
    held.current = true;
    vibrate(20);
    onChange({ ...NEUTRAL_INPUT, a: true });
    const t = Date.now();
    setReadyAt(t + HAZARD_COOLDOWN_MS);
    setNow(t);
  };
  const release = () => {
    if (!held.current) return;
    held.current = false;
    onChange(NEUTRAL_INPUT);
  };

  return (
    <div className="controller-surface flex h-full w-full flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-muted">You&apos;re out, but not done</p>
      <div
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex aspect-square w-[min(60vw,50vh,420px)] items-center justify-center rounded-full border-b-8 text-3xl font-black transition-transform duration-75 ${
          ready ? "border-amber-800 bg-amber-400 text-background" : "border-slate-900 bg-slate-700 text-slate-400"
        }`}
      >
        {ready ? label : `${(remaining / 1000).toFixed(1)}s`}
      </div>
      <p className="text-muted">Drop a ball on the survivors.</p>
    </div>
  );
}
