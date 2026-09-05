"use client";

import type { RoomState } from "@/lib/protocol";
import { colorFor } from "@/lib/colors";
import { GAMES } from "@/lib/games";

export function Results({ room, onAgain, onLobby }: { room: RoomState; onAgain: () => void; onLobby: () => void }) {
  const ranked = room.players.filter((p) => !p.spectating).slice().sort((a, b) => a.position - b.position);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-panel-border bg-panel p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">{GAMES[room.game].name}</p>
        <h2 className="font-display text-4xl text-accent">Results</h2>
        <ol className="mt-6 flex flex-col gap-2">
          {ranked.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-background px-4 py-3">
              <span className="w-8 font-display text-2xl text-muted">{p.position}</span>
              <span className="size-4 rounded-full" style={{ background: colorFor(p.colorIndex).css }} />
              <span className="flex-1 truncate text-lg font-bold">{p.name}</span>
              <span className="font-mono text-muted">{p.detail || (p.finished ? "" : "DNF")}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onAgain} className="flex-1 rounded-2xl bg-accent px-5 py-4 text-lg font-bold text-background">
            Play again
          </button>
          <button type="button" onClick={onLobby} className="rounded-2xl border border-panel-border px-5 py-4 text-lg font-bold">
            Lobby
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">The host phone can press these too.</p>
      </div>
    </div>
  );
}
