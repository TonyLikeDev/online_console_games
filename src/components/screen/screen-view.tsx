"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRoomHost } from "@/lib/host/use-room-host";
import { LOCAL_PLAYER_ID, type RoomHost } from "@/lib/host/room-host";
import { NEUTRAL_INPUT, type InputState } from "@/lib/protocol";
import type { RaceBridge, StandingEntry } from "@/games/racing/types";
import { Lobby } from "./lobby";
import { RaceHud } from "./race-hud";
import { Results } from "./results";

const RaceCanvas = dynamic(() => import("@/games/racing/race-canvas"), { ssr: false });

const KEYMAP: Record<string, keyof InputState> = {
  ArrowLeft: "l",
  ArrowRight: "r",
  ArrowUp: "g",
  ArrowDown: "b",
  a: "l",
  d: "r",
  w: "g",
  s: "b",
};

declare global {
  interface Window {
    /** dev only: lets test scripts drive the room */
    __roomHost?: RoomHost;
  }
}

export function ScreenView({ code, solo, laps }: { code: string; solo: boolean; laps?: number }) {
  const { host, snapshot } = useRoomHost(code, laps);
  const { room } = snapshot;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__roomHost = host;
    return () => {
      if (window.__roomHost === host) delete window.__roomHost;
    };
  }, [host]);
  const [tick, setTick] = useState<{ elapsedMs: number; standings: StandingEntry[] } | null>(null);

  // Solo test mode: the screen itself drives one car from the keyboard.
  useEffect(() => {
    if (!solo || snapshot.status !== "connected") return;
    host.addLocalPlayer();
    const held: InputState = { ...NEUTRAL_INPUT };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const btn = KEYMAP[e.key];
      if (!btn) return;
      e.preventDefault();
      if (held[btn] === down) return;
      held[btn] = down;
      host.inputs.set(LOCAL_PLAYER_ID, { ...held });
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const keepAlive = setInterval(() => host.inputs.set(LOCAL_PLAYER_ID, { ...held }), 300);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      clearInterval(keepAlive);
    };
  }, [solo, host, snapshot.status]);

  const inRace = room.phase === "countdown" || room.phase === "racing" || room.phase === "results";

  const bridge = useMemo<RaceBridge | null>(() => {
    if (!inRace) return null;
    return {
      racers: host.racers().map((p) => ({ id: p.id, name: p.name, colorIndex: p.colorIndex })),
      laps: room.laps,
      inputs: host.inputs,
      onRaceStarted: () => host.onRaceStarted(),
      onLap: (id, lap) => host.onLap(id, lap),
      onStandings: (order) => host.onStandings(order),
      onPlayerFinished: (id, t) => host.onPlayerFinished(id, t),
      onRaceEnded: (results) => host.onRaceEnded(results),
      onTick: (info) => setTick(info),
    };
    // A new race (raceSeed) is the only thing that should rebuild the bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, inRace, snapshot.raceSeed]);

  if (snapshot.status === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-3xl text-accent">Could not open the room</h1>
        <p className="max-w-md text-muted">{snapshot.error}</p>
        <Link href="/screen/new" className="rounded-xl bg-accent px-5 py-3 font-bold text-background">
          Try another code
        </Link>
      </main>
    );
  }

  if (snapshot.status === "starting" || (snapshot.status === "connecting" && room.players.length === 0)) {
    return <main className="flex flex-1 items-center justify-center text-muted">Connecting to {snapshot.transport}…</main>;
  }

  if (!inRace || !bridge) {
    return <Lobby snapshot={snapshot} onStart={() => host.startRace()} />;
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#2f7a35]">
      <RaceCanvas key={snapshot.raceSeed} bridge={bridge} />
      <RaceHud room={room} tick={tick} />
      {room.phase === "results" && (
        <Results room={room} onAgain={() => host.raceAgain()} onLobby={() => host.backToLobby()} />
      )}
      {snapshot.status !== "connected" && (
        <div className="absolute inset-x-0 top-0 bg-red-600/90 py-1 text-center text-sm font-bold">
          Connection lost, reconnecting…
        </div>
      )}
    </main>
  );
}
