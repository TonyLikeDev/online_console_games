"use client";

import type { RoomState } from "@/lib/protocol";
import type { KitchenHudData, KitchenOrderView } from "@/games/kitchen/types";

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function OrderCard({ order }: { order: KitchenOrderView }) {
  const pct = Math.max(0, Math.min(100, (order.remainingMs / order.totalMs) * 100));
  const urgent = order.remainingMs < 15000;
  return (
    <div className={`w-40 shrink-0 rounded-xl bg-black/65 p-2 ${urgent ? "ring-2 ring-rose-400" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">{order.emoji}</span>
        <div className="min-w-0">
          <div className="truncate font-bold">{order.name}</div>
          <div className="text-xs text-muted">{order.points} pts</div>
        </div>
      </div>
      <div className="mt-2 h-2 rounded bg-white/10">
        <div className={`h-2 rounded ${urgent ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function KitchenHud({ room, hud }: { room: RoomState; hud: KitchenHudData | null }) {
  if (!hud) return null;
  const stars = "★".repeat(hud.stars) + "☆".repeat(3 - hud.stars);
  return (
    <div className="pointer-events-none absolute inset-0 text-sm">
      {hud.countdown !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            key={hud.countdown}
            className="font-display text-[10rem] leading-none text-white drop-shadow-[0_6px_0_rgba(0,0,0,0.6)] motion-safe:animate-[ping_0.8s_ease-out_1]"
          >
            {hud.countdown === 0 ? "COOK!" : hud.countdown}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start gap-3 p-3">
        <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
          {hud.orders.length === 0 ? (
            <div className="rounded-xl bg-black/50 px-4 py-3 text-muted">{hud.phase === "playing" ? "Waiting for orders…" : hud.layoutName}</div>
          ) : (
            hud.orders.map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="rounded-xl bg-black/65 px-4 py-2 text-right">
            <div className="font-display text-3xl leading-none text-accent">{hud.score}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted">team score</div>
            <div className="text-lg leading-tight text-accent">{stars}</div>
            {hud.nextStarAt !== null && <div className="text-xs text-muted">next at {hud.nextStarAt}</div>}
          </div>
          <div className="rounded-xl bg-black/65 px-3 py-2 font-mono text-2xl">{clock(hud.timeLeftMs)}</div>
        </div>
      </div>

      {room.phase !== "results" && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1">
          {hud.feed.map((f) => (
            <div key={f.id} className={`rounded-lg bg-black/65 px-3 py-1 font-semibold ${f.good ? "text-emerald-300" : "text-rose-300"}`}>
              {f.text}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
