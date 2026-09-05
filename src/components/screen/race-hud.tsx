"use client";

import type { RoomState } from "@/lib/protocol";
import { colorFor } from "@/lib/colors";
import type { StandingEntry } from "@/games/racing/types";

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100));
  const tenths = total % 10;
  const seconds = Math.floor(total / 10) % 60;
  const minutes = Math.floor(total / 600);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function RaceHud({ room, tick }: { room: RoomState; tick: { elapsedMs: number; standings: StandingEntry[] } | null }) {
  if (room.phase === "countdown") return null;
  return (
    <div className="pointer-events-none absolute inset-0 p-3 text-sm">
      <div className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1 font-mono text-lg">
        {formatTime(tick?.elapsedMs ?? 0)}
      </div>
      <ol className="absolute left-3 top-3 flex flex-col gap-1">
        {(tick?.standings ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1">
            <span className="w-4 text-right font-mono text-muted">{s.position}</span>
            <span className="size-3 rounded-full" style={{ background: colorFor(s.colorIndex).css }} />
            <span className="max-w-28 truncate font-semibold">{s.name}</span>
            <span className="ml-auto font-mono text-xs text-muted">
              {s.finished && s.finishTimeMs !== null ? formatTime(s.finishTimeMs) : `L${s.lap}/${room.laps}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
