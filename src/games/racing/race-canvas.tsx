"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "./config";
import { RaceScene } from "./race-scene";
import type { RaceBridge } from "./types";

declare global {
  interface Window {
    /** dev only: lets test scripts inspect the running race */
    __phaserGame?: Phaser.Game;
  }
}

/**
 * Mounts a Phaser game that fills its parent. The bridge's callbacks are
 * read through a ref so React can re-render without restarting the race.
 */
export default function RaceCanvas({ bridge }: { bridge: RaceBridge }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  });

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const initial = bridgeRef.current;
    const proxy: RaceBridge = {
      racers: initial.racers,
      laps: initial.laps,
      inputs: initial.inputs,
      onRaceStarted: () => bridgeRef.current.onRaceStarted(),
      onLap: (id, lap) => bridgeRef.current.onLap(id, lap),
      onStandings: (order) => bridgeRef.current.onStandings(order),
      onPlayerFinished: (id, t) => bridgeRef.current.onPlayerFinished(id, t),
      onRaceEnded: (results) => bridgeRef.current.onRaceEnded(results),
      onTick: (info) => bridgeRef.current.onTick(info),
    };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: WORLD_W,
      height: WORLD_H,
      backgroundColor: "#2f7a35",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false },
      scene: [],
    });
    game.scene.add("race", RaceScene, true, { bridge: proxy });
    if (process.env.NODE_ENV !== "production") window.__phaserGame = game;
    return () => {
      if (window.__phaserGame === game) delete window.__phaserGame;
      game.destroy(true);
    };
  }, []);

  return <div ref={parentRef} className="absolute inset-0" />;
}
