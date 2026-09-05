import type { GameBridge, GamePlayer } from "@/lib/game-bridge";

export type RacerDef = GamePlayer;

export interface StandingEntry {
  id: string;
  name: string;
  colorIndex: number;
  position: number;
  lap: number;
  finished: boolean;
  finishTimeMs: number | null;
}

/** Screen-only overlay data, reported several times a second. */
export interface RaceHudData {
  elapsedMs: number;
  standings: StandingEntry[];
}

export type RaceBridge = GameBridge<RaceHudData>;
