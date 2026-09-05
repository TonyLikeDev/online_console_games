"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { HostSnapshot } from "@/lib/host/room-host";
import { MAX_PLAYERS } from "@/lib/protocol";
import { colorFor } from "@/lib/colors";

export function Lobby({ snapshot, onStart }: { snapshot: HostSnapshot; onStart: () => void }) {
  const { room } = snapshot;
  // The lobby only renders after the host connects, so window is available.
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const joinUrl = origin ? `${origin}/play/${room.code}` : "";
  const displayUrl = joinUrl.replace(/^https?:\/\//, "");
  const canStart = room.players.some((p) => p.connected);
  const host = room.players.find((p) => p.id === room.hostId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 lg:flex-row lg:items-stretch lg:p-10">
      <section className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-panel-border bg-panel p-8 lg:w-[42%]">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Scan to join</p>
        <div className="rounded-2xl bg-white p-4">
          {joinUrl ? <QRCodeSVG value={joinUrl} size={240} level="M" /> : <div className="size-60" />}
        </div>
        <p className="text-sm text-muted">or open</p>
        <p className="break-all text-center font-mono text-lg">{displayUrl}</p>
        <p className="text-sm text-muted">room code</p>
        <p className="font-display text-7xl tracking-[0.15em] text-accent">{room.code}</p>
      </section>

      <section className="flex flex-1 flex-col gap-6">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl">Racing</h1>
          <span className="text-sm text-muted">
            {room.players.length}/{MAX_PLAYERS} players · {snapshot.transport} · {snapshot.status}
          </span>
        </header>

        <ul className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = room.players[i];
            if (!p) {
              return (
                <li key={i} className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-panel-border text-muted">
                  open seat
                </li>
              );
            }
            const c = colorFor(p.colorIndex);
            return (
              <li
                key={p.id}
                className="flex min-h-24 flex-col justify-between rounded-2xl border border-panel-border bg-panel p-4"
                style={{ borderColor: c.css }}
              >
                <span className="size-5 rounded-full" style={{ background: c.css }} />
                <span className="truncate text-xl font-bold">{p.name}</span>
                <span className="text-xs text-muted">{p.id === room.hostId ? "host" : c.name}</span>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted">
            {canStart
              ? `${host?.name ?? "The host"} can press Start on their phone.`
              : "Waiting for the first player to join…"}
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="rounded-2xl bg-accent px-8 py-4 text-xl font-bold text-background disabled:opacity-40"
          >
            Start race
          </button>
        </footer>
      </section>
    </main>
  );
}
