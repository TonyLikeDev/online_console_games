import type { InputState, PlayerPublic, Stage } from "./protocol";

/** What a game knows about each participant. */
export interface GamePlayer {
  id: string;
  name: string;
  colorIndex: number;
}

export interface GameResult {
  id: string;
  position: number;
  detail: string;
  finishTimeMs?: number | null;
}

export type PlayerPatch = Partial<Pick<PlayerPublic, "lap" | "finished" | "eliminated" | "detail" | "finishTimeMs">>;

export interface InputSource {
  get(playerId: string, now?: number): InputState;
}

/**
 * The contract between a game running on the screen and the room host.
 * Games never touch the transport; they report through these callbacks and
 * the host broadcasts whatever the phones need.
 */
export interface GameBridge<Hud = unknown> {
  players: GamePlayer[];
  laps: number;
  inputs: InputSource;
  /** countdown finished, controls are live */
  onStarted(): void;
  onPlayer(id: string, patch: PlayerPatch): void;
  /** several players at once, broadcast as a single room update */
  onPlayers(updates: Array<{ id: string; patch: PlayerPatch }>): void;
  /** current ranking, best first; throttled by the host before broadcast */
  onStandings(order: string[]): void;
  onStage(stage: Stage): void;
  onEnded(results: GameResult[]): void;
  /** game-specific data for the screen overlay; never sent to phones */
  onHud(hud: Hud): void;
}
