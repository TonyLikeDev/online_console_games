"use client";

import type { RoomState } from "@/lib/protocol";
import { colorFor } from "@/lib/colors";
import { formatTime } from "@/lib/format";
import type { TumbleHudData } from "@/games/tumble/types";

const STATUS_ICON = { running: "", qualified: "✓", eliminated: "✗" } as const;

export function TumbleHud({ room, hud }: { room: RoomState; hud: TumbleHudData | null }) {
  if (!hud) return null;
  const showBoard = room.phase !== "results";
  return (
    <div className="pointer-events-none absolute inset-0 text-sm">
      {hud.countdown !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            key={hud.countdown}
            className="font-display text-[10rem] leading-none text-white drop-shadow-[0_6px_0_rgba(0,0,0,0.6)] motion-safe:animate-[ping_0.8s_ease-out_1]"
          >
            {hud.countdown === 0 ? "GO!" : hud.countdown}
          </span>
        </div>
      )}

      {showBoard && (
        <>
          <div className="absolute left-3 top-3 flex flex-col gap-1">
            <div className="rounded-lg bg-black/60 px-3 py-1">
              <span className="text-xs uppercase tracking-widest text-muted">
                Round {hud.roundIndex}/{hud.roundCount}
              </span>
              <span className="ml-2 font-bold">{hud.roundName}</span>
            </div>
            {hud.players.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1 ${p.status === "eliminated" ? "opacity-50" : ""}`}>
                <span className="size-3 rounded-full" style={{ background: colorFor(p.colorIndex).css }} />
                <span className="max-w-28 truncate font-semibold">{p.name}</span>
                <span className={`ml-auto font-mono text-xs ${p.status === "qualified" ? "text-emerald-300" : "text-muted"}`}>
                  {STATUS_ICON[p.status]}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
            <div className="rounded-lg bg-black/60 px-3 py-1 font-mono text-lg">{formatTime(hud.elapsedMs)}</div>
            <div className="rounded-lg bg-black/60 px-3 py-1 text-xs uppercase tracking-widest">
              {hud.kind === "final" ? `${hud.alive} still standing` : `Qualified ${hud.qualified}/${hud.quota}`}
            </div>
          </div>
        </>
      )}

      {hud.kind === "intermission" && hud.intermission && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-lg rounded-3xl border border-panel-border bg-panel p-8 text-foreground">
            <h2 className="font-display text-3xl text-accent">{hud.intermission.title}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-300">Moving on</p>
                <ul className="mt-2 space-y-1 text-lg font-bold">
                  {hud.intermission.qualified.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-rose-300">Going home</p>
                <ul className="mt-2 space-y-1 text-lg font-bold text-muted">
                  {hud.intermission.eliminated.length === 0 ? <li>nobody</li> : hud.intermission.eliminated.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            </div>
            <p className="mt-6 text-center text-muted">
              {hud.intermission.next ? `Next: ${hud.intermission.next}` : "Time for the results…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
