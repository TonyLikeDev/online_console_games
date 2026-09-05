"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "./config";
import { KitchenScene } from "./kitchen-scene";
import type { KitchenBridge } from "./types";

/**
 * Mounts a Phaser game that fills its parent. The bridge's callbacks are
 * read through a ref so React can re-render without restarting the shift.
 */
export default function KitchenCanvas({ bridge }: { bridge: KitchenBridge }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  });

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const initial = bridgeRef.current;
    const proxy: KitchenBridge = {
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
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: WORLD_W,
      height: WORLD_H,
      backgroundColor: "#232733",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false },
      scene: [],
    });
    game.scene.add("kitchen", KitchenScene, true, { bridge: proxy });
    if (process.env.NODE_ENV !== "production") window.__phaserGame = game;
    return () => {
      if (window.__phaserGame === game) delete window.__phaserGame;
      game.destroy(true);
    };
  }, []);

  return <div ref={parentRef} className="absolute inset-0" />;
}
