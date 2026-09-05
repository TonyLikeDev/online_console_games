"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NEUTRAL_INPUT, inputEquals, type InputState } from "@/lib/protocol";
import { vibrate } from "@/lib/player/device";

type Btn = keyof InputState;

const KEYMAP: Record<string, Btn> = {
  ArrowLeft: "l",
  ArrowRight: "r",
  ArrowUp: "g",
  ArrowDown: "b",
  a: "l",
  d: "r",
  w: "g",
  s: "b",
};

function buttonAt(x: number, y: number): Btn | null {
  const el = document.elementFromPoint(x, y);
  const btn = el?.closest<HTMLElement>("[data-btn]")?.dataset.btn;
  return btn === "l" || btn === "r" || btn === "g" || btn === "b" ? btn : null;
}

/**
 * Multi-touch gamepad. Tracks every active pointer, so a thumb can slide from
 * left to right without lifting, while the other thumb holds the gas.
 */
export function Gamepad({ onChange, disabled = false }: { onChange: (state: InputState) => void; disabled?: boolean }) {
  const pointers = useRef(new Map<number, Btn | null>());
  const keys = useRef(new Set<Btn>());
  const last = useRef<InputState>(NEUTRAL_INPUT);
  const [pressed, setPressed] = useState<InputState>(NEUTRAL_INPUT);

  const recompute = useCallback(() => {
    const s: InputState = { ...NEUTRAL_INPUT };
    for (const b of pointers.current.values()) if (b) s[b] = true;
    for (const b of keys.current) s[b] = true;
    if (inputEquals(s, last.current)) return;
    const pressedSomething = (s.l && !last.current.l) || (s.r && !last.current.r) || (s.g && !last.current.g) || (s.b && !last.current.b);
    last.current = s;
    setPressed(s);
    onChange(s);
    if (pressedSomething) vibrate();
  }, [onChange]);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    pointers.current.set(e.pointerId, buttonAt(e.clientX, e.clientY));
    recompute();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const b = buttonAt(e.clientX, e.clientY);
    if (b !== pointers.current.get(e.pointerId)) {
      pointers.current.set(e.pointerId, b);
      recompute();
    }
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

  const base = "flex items-center justify-center rounded-3xl border-b-8 text-5xl font-black transition-transform duration-75 select-none";
  const cls = (active: boolean, color: string, colorActive: string) =>
    `${base} ${active ? `${colorActive} translate-y-1 border-b-4` : color} ${disabled ? "opacity-40" : ""}`;

  return (
    <div
      className="controller-surface grid h-full w-full grid-cols-2 gap-3 p-3"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid grid-cols-2 gap-3">
        <div data-btn="l" className={cls(pressed.l, "bg-slate-700 border-slate-900", "bg-slate-500 border-slate-800")} aria-label="Steer left">
          ◀
        </div>
        <div data-btn="r" className={cls(pressed.r, "bg-slate-700 border-slate-900", "bg-slate-500 border-slate-800")} aria-label="Steer right">
          ▶
        </div>
      </div>
      <div className="grid grid-rows-[3fr_2fr] gap-3">
        <div data-btn="g" className={cls(pressed.g, "bg-emerald-600 border-emerald-900", "bg-emerald-400 border-emerald-800")} aria-label="Gas">
          GAS
        </div>
        <div data-btn="b" className={`${cls(pressed.b, "bg-rose-600 border-rose-900", "bg-rose-400 border-rose-800")} text-3xl`} aria-label="Brake">
          BRAKE
        </div>
      </div>
    </div>
  );
}
