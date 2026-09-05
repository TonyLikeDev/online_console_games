"use client";

import Link from "next/link";
import { useCallback } from "react";
import { usePlayerClient } from "@/lib/player/use-player-client";
import { keepScreenAwake, tryFullscreen } from "@/lib/player/device";
import { colorFor } from "@/lib/colors";
import { MAX_PLAYERS, type InputState } from "@/lib/protocol";
import { Gamepad } from "./gamepad";
import { JoinForm } from "./join-form";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function PlayView({ code }: { code: string }) {
  const { client, snapshot } = usePlayerClient(code);
  const { status, room, me } = snapshot;
  const onInput = useCallback((s: InputState) => client.setInput(s), [client]);

  const join = (name: string) => {
    void keepScreenAwake();
    tryFullscreen();
    void client.join(name);
  };

  const shell = (children: React.ReactNode) => (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">{children}</main>
  );

  if (status === "connecting") return shell(<p className="text-muted">Connecting to room {code}…</p>);

  if (status === "error") {
    return shell(
      <>
        <h1 className="font-display text-3xl text-accent">Connection failed</h1>
        <p className="max-w-sm text-muted">{snapshot.error}</p>
        <Link href="/" className="text-accent underline">
          Back home
        </Link>
      </>,
    );
  }

  if (status === "no-room") {
    return shell(
      <>
        <h1 className="font-display text-3xl text-accent">Room {code} not found</h1>
        <p className="max-w-sm text-muted">Make sure the game screen is open and showing this code.</p>
        <Link href="/" className="text-accent underline">
          Back home
        </Link>
      </>,
    );
  }

  if (status === "ready") {
    return shell(
      <>
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Room</p>
        <h1 className="font-display text-5xl tracking-[0.15em] text-accent">{code}</h1>
        <JoinForm code={code} onJoin={join} />
      </>,
    );
  }

  // joined
  const banner =
    snapshot.connection !== "connected"
      ? "Reconnecting…"
      : !snapshot.screenPresent
        ? "The game screen disconnected."
        : null;

  if (room && !me) {
    return shell(
      <>
        <h1 className="font-display text-3xl text-accent">Room {code} is full</h1>
        <p className="max-w-sm text-muted">All {MAX_PLAYERS} seats are taken. Ask the screen to head back to the lobby and try again.</p>
      </>,
    );
  }

  if (!room || !me) {
    return shell(
      <>
        <p className="text-muted">Joined. Waiting for the screen…</p>
        {banner && <p className="text-red-400">{banner}</p>}
      </>,
    );
  }

  const color = colorFor(me.colorIndex);
  const isHost = room.hostId === me.id;
  const hostBtn = "rounded-2xl bg-accent px-6 py-4 text-xl font-bold text-background disabled:opacity-40";

  if (room.phase === "lobby") {
    return shell(
      <>
        <span className="size-16 rounded-full border-4 border-white/20" style={{ background: color.css }} />
        <h1 className="text-3xl font-bold">You&apos;re in, {me.name}!</h1>
        <p className="text-muted">
          {room.players.length} player{room.players.length === 1 ? "" : "s"} in room {code}. Look at the big screen.
        </p>
        {isHost ? (
          <button type="button" className={hostBtn} onClick={() => client.sendCommand({ type: "start" })}>
            Start race
          </button>
        ) : (
          <p className="text-sm text-muted">Waiting for the host to start…</p>
        )}
        {banner && <p className="text-red-400">{banner}</p>}
      </>,
    );
  }

  if (room.phase === "results") {
    return shell(
      <>
        <span className="size-16 rounded-full border-4 border-white/20" style={{ background: color.css }} />
        {me.spectating ? (
          <h1 className="text-3xl font-bold">You&apos;ll race next time.</h1>
        ) : (
          <>
            <p className="text-muted">You finished</p>
            <h1 className="font-display text-6xl text-accent">{me.finishTimeMs !== null ? ordinal(me.position) : "DNF"}</h1>
          </>
        )}
        {isHost && (
          <div className="flex gap-3">
            <button type="button" className={hostBtn} onClick={() => client.sendCommand({ type: "again" })}>
              Race again
            </button>
            <button
              type="button"
              className="rounded-2xl border border-panel-border px-6 py-4 text-xl font-bold"
              onClick={() => client.sendCommand({ type: "lobby" })}
            >
              Lobby
            </button>
          </div>
        )}
        {banner && <p className="text-red-400">{banner}</p>}
      </>,
    );
  }

  // countdown / racing
  if (me.spectating) {
    return shell(
      <>
        <h1 className="text-3xl font-bold">Race in progress</h1>
        <p className="text-muted">You&apos;ll be on the grid for the next one.</p>
      </>,
    );
  }

  return (
    <main className="controller-surface flex h-dvh w-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <span className="size-4 rounded-full" style={{ background: color.css }} />
        <span className="font-bold">{me.name}</span>
        <span className="ml-auto font-mono text-muted">
          {room.phase === "countdown" ? "Get ready…" : me.finished ? `Finished ${ordinal(me.position)}` : `P${me.position} · Lap ${me.lap}/${room.laps}`}
        </span>
      </div>
      {banner && <div className="bg-red-600 py-1 text-center text-sm font-bold">{banner}</div>}
      <div className="min-h-0 flex-1">
        <Gamepad onChange={onInput} disabled={me.finished} />
      </div>
    </main>
  );
}
