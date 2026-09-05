"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRoomHost } from "@/lib/host/use-room-host";
import { LOCAL_PLAYER_ID, type RoomHost } from "@/lib/host/room-host";
import { NEUTRAL_INPUT, type GameId, type InputState } from "@/lib/protocol";
import type { GameBridge } from "@/lib/game-bridge";
import type { RaceHudData } from "@/games/racing/types";
import type { TumbleHudData } from "@/games/tumble/types";
import type { KitchenHudData } from "@/games/kitchen/types";
import { Lobby } from "./lobby";
import { RaceHud } from "./race-hud";
import { TumbleHud } from "./tumble-hud";
import { KitchenHud } from "./kitchen-hud";
import { Results } from "./results";

const RaceCanvas = dynamic(() => import("@/games/racing/race-canvas"), { ssr: false });
const TumbleCanvas = dynamic(() => import("@/games/tumble/tumble-canvas"), { ssr: false });
const KitchenCanvas = dynamic(() => import("@/games/kitchen/kitchen-canvas"), { ssr: false });

const GAME_BACKGROUND: Record<GameId, string> = {
  racing: "bg-[#2f7a35]",
  tumble: "bg-[#8ec5ff]",
  kitchen: "bg-[#232733]",
};

const KEYMAP: Record<string, keyof InputState> = {
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

declare global {
  interface Window {
    /** dev only: lets test scripts drive the room */
    __roomHost?: RoomHost;
  }
}

export function ScreenView({ code, solo, laps, game }: { code: string; solo: boolean; laps?: number; game?: GameId }) {
  const { host, snapshot } = useRoomHost(code, laps, game);
  const { room } = snapshot;
  const [hud, setHud] = useState<unknown>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__roomHost = host;
    return () => {
      if (window.__roomHost === host) delete window.__roomHost;
    };
  }, [host]);

  // Solo test mode: the screen itself drives one player from the keyboard.
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

  const inGame = room.phase === "countdown" || room.phase === "playing" || room.phase === "results";

  const bridge = useMemo<GameBridge | null>(() => {
    if (!inGame) return null;
    return {
      players: host.participants().map((p) => ({ id: p.id, name: p.name, colorIndex: p.colorIndex })),
      laps: room.laps,
      inputs: host.inputs,
      onStarted: () => host.onGameStarted(),
      onPlayer: (id, patch) => host.updatePlayer(id, patch),
      onPlayers: (updates) => host.updatePlayers(updates),
      onStandings: (order) => host.onStandings(order),
      onStage: (stage) => host.setStage(stage),
      onEnded: (results) => host.onGameEnded(results),
      onHud: (data) => setHud(data),
    };
    // A new game (raceSeed) is the only thing that should rebuild the bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, inGame, snapshot.raceSeed]);

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

  if (!inGame || !bridge) {
    return <Lobby snapshot={snapshot} onStart={() => host.startGame()} onSelectGame={(g) => host.setGame(g)} />;
  }

  return (
    <main className={`relative h-dvh w-full overflow-hidden ${GAME_BACKGROUND[room.game]}`}>
      {room.game === "racing" && (
        <>
          <RaceCanvas key={snapshot.raceSeed} bridge={bridge as GameBridge<RaceHudData>} />
          <RaceHud room={room} hud={hud as RaceHudData | null} />
        </>
      )}
      {room.game === "tumble" && (
        <>
          <TumbleCanvas key={snapshot.raceSeed} bridge={bridge as GameBridge<TumbleHudData>} />
          <TumbleHud room={room} hud={hud as TumbleHudData | null} />
        </>
      )}
      {room.game === "kitchen" && (
        <>
          <KitchenCanvas key={snapshot.raceSeed} bridge={bridge as GameBridge<KitchenHudData>} />
          <KitchenHud room={room} hud={hud as KitchenHudData | null} />
        </>
      )}
      {room.phase === "results" && (
        <Results room={room} onAgain={() => host.playAgain()} onLobby={() => host.backToLobby()} />
      )}
      {snapshot.status !== "connected" && (
        <div className="absolute inset-x-0 top-0 bg-red-600/90 py-1 text-center text-sm font-bold">
          Connection lost, reconnecting…
        </div>
      )}
    </main>
  );
}
