"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NEUTRAL_INPUT, inputEquals, type InputState } from "@/lib/protocol";
import type { ButtonColor, ControllerLayout } from "@/lib/games";
import { vibrate } from "@/lib/player/device";

type Btn = keyof InputState;

const KEYMAP: Record<string, Btn> = {
  ArrowLeft: "l",
  ArrowRight: "r",
  ArrowUp: "u",
  ArrowDown: "d",
  a: "l",
  d: "r",
  w: "u",
  s: "d",
  " ": "a",
  j: "a",
  Enter: "a",
  Shift: "b",
  k: "b",
};

const COLORS: Record<ButtonColor, { idle: string; active: string }> = {
  green: { idle: "bg-emerald-600 border-emerald-900", active: "bg-emerald-400 border-emerald-800" },
  red: { idle: "bg-rose-600 border-rose-900", active: "bg-rose-400 border-rose-800" },
  blue: { idle: "bg-sky-600 border-sky-900", active: "bg-sky-400 border-sky-800" },
  yellow: { idle: "bg-amber-500 border-amber-800", active: "bg-amber-300 border-amber-700" },
};

/** Eight compass sectors, starting at "right" and going counter-clockwise. */
const SECTORS: ReadonlyArray<Partial<InputState>> = [
  { r: true },
  { r: true, u: true },
  { u: true },
  { l: true, u: true },
  { l: true },
  { l: true, d: true },
  { d: true },
  { r: true, d: true },
];
const PAD_DEADZONE_PX = 22;

function padDirection(cx: number, cy: number, x: number, y: number): Partial<InputState> | null {
  const dx = x - cx;
  const dy = cy - y; // screen y grows downward
  if (Math.hypot(dx, dy) < PAD_DEADZONE_PX) return null;
  let sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  sector = ((sector % 8) + 8) % 8;
  return SECTORS[sector];
}

function buttonAt(x: number, y: number): Btn | null {
  const el = document.elementFromPoint(x, y);
  const btn = el?.closest<HTMLElement>("[data-btn]")?.dataset.btn;
  return btn === "l" || btn === "r" || btn === "u" || btn === "d" || btn === "a" || btn === "b" ? btn : null;
}

type Tracked =
  | { kind: "pad"; cx: number; cy: number; dir: Partial<InputState> | null }
  | { kind: "btn"; btn: Btn | null };

/**
 * Multi-touch gamepad. Tracks every active pointer, so one thumb can sweep the
 * pad while the other holds an action button. Sends only when the pressed set
 * changes, which keeps the message count tiny.
 */
export function Gamepad({
  layout,
  onChange,
  disabled = false,
}: {
  layout: ControllerLayout;
  onChange: (state: InputState) => void;
  disabled?: boolean;
}) {
  const pointers = useRef(new Map<number, Tracked>());
  const keys = useRef(new Set<Btn>());
  const last = useRef<InputState>(NEUTRAL_INPUT);
  const [pressed, setPressed] = useState<InputState>(NEUTRAL_INPUT);

  const recompute = useCallback(() => {
    const s: InputState = { ...NEUTRAL_INPUT };
    for (const t of pointers.current.values()) {
      if (t.kind === "btn") {
        if (t.btn) s[t.btn] = true;
      } else if (t.dir) {
        Object.assign(s, t.dir);
      }
    }
    for (const b of keys.current) s[b] = true;
    if (inputEquals(s, last.current)) return;
    const newlyPressed = (Object.keys(s) as Btn[]).some((k) => s[k] && !last.current[k]);
    last.current = s;
    setPressed(s);
    onChange(s);
    if (newlyPressed) vibrate();
  }, [onChange]);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    const pad = (e.target as HTMLElement).closest<HTMLElement>('[data-zone="pad"]');
    if (pad) {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      pointers.current.set(e.pointerId, { kind: "pad", cx, cy, dir: padDirection(cx, cy, e.clientX, e.clientY) });
    } else {
      pointers.current.set(e.pointerId, { kind: "btn", btn: buttonAt(e.clientX, e.clientY) });
    }
    recompute();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const t = pointers.current.get(e.pointerId);
    if (!t) return;
    if (t.kind === "pad") {
      t.dir = padDirection(t.cx, t.cy, e.clientX, e.clientY);
    } else {
      t.btn = buttonAt(e.clientX, e.clientY);
    }
    recompute();
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    recompute();
  };

  // Keyboard for desktop testing, plus a safety release when the tab hides.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const b = KEYMAP[e.key];
      if (!b) return;
      e.preventDefault();
      keys.current.add(b);
      recompute();
    };
    const ku = (e: KeyboardEvent) => {
      const b = KEYMAP[e.key];
      if (!b) return;
      keys.current.delete(b);
      recompute();
    };
    const releaseAll = () => {
      pointers.current.clear();
      keys.current.clear();
      recompute();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", releaseAll);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
      releaseAll();
    };
  }, [recompute]);

  const base = "flex items-center justify-center rounded-3xl border-b-8 font-black transition-transform duration-75 select-none";
  const cls = (active: boolean, color: ButtonColor) =>
    `${base} ${active ? `${COLORS[color].active} translate-y-1 border-b-4` : COLORS[color].idle} ${disabled ? "opacity-40" : ""}`;
  const steerCls = (active: boolean) =>
    `${base} text-5xl ${active ? "bg-slate-500 border-slate-800 translate-y-1 border-b-4" : "bg-slate-700 border-slate-900"} ${disabled ? "opacity-40" : ""}`;
  const arrowCls = (active: boolean) =>
    `absolute text-4xl font-black transition-colors ${active ? "text-white" : "text-slate-400"}`;

  return (
    <div
      className="controller-surface grid h-full w-full grid-cols-2 gap-3 p-3"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {layout.pad === "2-way" ? (
        <div className="grid grid-cols-2 gap-3">
          <div data-btn="l" className={steerCls(pressed.l)} aria-label="Steer left">
            ◀
          </div>
          <div data-btn="r" className={steerCls(pressed.r)} aria-label="Steer right">
            ▶
          </div>
        </div>
      ) : (
        <div data-zone="pad" className={`flex items-center justify-center rounded-3xl bg-slate-800/60 ${disabled ? "opacity-40" : ""}`} aria-label="Direction pad">
          <div className="relative aspect-square w-[min(78%,300px)] rounded-full border-b-8 border-slate-900 bg-slate-700">
            <span className={`${arrowCls(pressed.u)} left-1/2 top-3 -translate-x-1/2`}>▲</span>
            <span className={`${arrowCls(pressed.d)} bottom-3 left-1/2 -translate-x-1/2`}>▼</span>
            <span className={`${arrowCls(pressed.l)} left-3 top-1/2 -translate-y-1/2`}>◀</span>
            <span className={`${arrowCls(pressed.r)} right-3 top-1/2 -translate-y-1/2`}>▶</span>
            <span className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600" />
          </div>
        </div>
      )}
      <div className="grid grid-rows-[3fr_2fr] gap-3">
        <div data-btn="a" className={`${cls(pressed.a, layout.a.color)} text-5xl`} aria-label={layout.a.label}>
          {layout.a.label}
        </div>
        <div data-btn="b" className={`${cls(pressed.b, layout.b.color)} text-3xl`} aria-label={layout.b.label}>
          {layout.b.label}
        </div>
      </div>
    </div>
  );
}
