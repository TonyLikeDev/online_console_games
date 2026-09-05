import type { InputState } from "@/lib/protocol";

export interface RacerDef {
  id: string;
  name: string;
  colorIndex: number;
}

export interface StandingEntry {
  id: string;
  name: string;
  colorIndex: number;
  position: number;
  lap: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface RaceResult {
  id: string;
  position: number;
  finishTimeMs: number | null;
}

export interface InputSource {
  get(playerId: string, now?: number): InputState;
}

/** Everything the Phaser scene needs from, and reports back to, React. */
export interface RaceBridge {
  racers: RacerDef[];
  laps: number;
  inputs: InputSource;
  onRaceStarted(): void;
  onLap(id: string, lap: number): void;
  onStandings(order: string[]): void;
  onPlayerFinished(id: string, finishTimeMs: number): void;
  onRaceEnded(results: RaceResult[]): void;
  onTick(info: { elapsedMs: number; standings: StandingEntry[] }): void;
}
