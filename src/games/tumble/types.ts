import type { GameBridge, GamePlayer } from "@/lib/game-bridge";

export type TumblePlayerDef = GamePlayer;

export interface TumbleHudEntry {
  id: string;
  name: string;
  colorIndex: number;
  status: "running" | "qualified" | "eliminated";
}

/** Screen-only overlay data, reported several times a second. */
export interface TumbleHudData {
  kind: "round" | "final" | "intermission" | "ended";
  roundName: string;
  roundIndex: number;
  roundCount: number;
  elapsedMs: number;
  qualified: number;
  quota: number;
  alive: number;
  players: TumbleHudEntry[];
  /** 3, 2, 1 during the countdown, 0 while "GO!" flashes */
  countdown?: number;
  intermission?: { title: string; qualified: string[]; eliminated: string[]; next: string | null };
}

export type TumbleBridge = GameBridge<TumbleHudData>;
