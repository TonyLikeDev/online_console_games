"use client";

import { useEffect, useRef } from "react";
import type { TumbleBridge } from "./types";
import type { TumbleGame } from "./game";

declare global {
  interface Window {
    /** dev only: lets test scripts inspect the running show */
    __tumbleGame?: TumbleGame;
  }
}

/**
 * Mounts the Three.js show inside its parent. Three and Rapier are loaded on
 * demand so the racing game and the lobby never pay for them.
 */
export default function TumbleCanvas({ bridge }: { bridge: TumbleBridge }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  });

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    let game: TumbleGame | null = null;
    let cancelled = false;
    const initial = bridgeRef.current;
    const proxy: TumbleBridge = {
      players: initial.players,
      laps: initial.laps,
      inputs: initial.inputs,
      onStarted: () => bridgeRef.current.onStarted(),
      onPlayer: (id, patch) => bridgeRef.current.onPlayer(id, patch),
      onPlayers: (updates) => bridgeRef.current.onPlayers(updates),
      onStandings: (order) => bridgeRef.current.onStandings(order),
      onStage: (stage) => bridgeRef.current.onStage(stage),
      onEnded: (results) => bridgeRef.current.onEnded(results),
      onHud: (hud) => bridgeRef.current.onHud(hud),
    };
    void (async () => {
      const mod = await import("./game");
      await mod.initPhysics();
      if (cancelled) return;
      game = new mod.TumbleGame(parent, proxy);
      game.start();
      if (process.env.NODE_ENV !== "production") window.__tumbleGame = game;
    })();
    return () => {
      cancelled = true;
      if (game) {
        if (window.__tumbleGame === game) delete window.__tumbleGame;
        game.dispose();
      }
    };
  }, []);

  return <div ref={parentRef} className="absolute inset-0" />;
}
