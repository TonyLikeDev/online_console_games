import { INPUT_STALE_MS, NEUTRAL_INPUT, type InputState } from "@/lib/protocol";

interface Entry {
  state: InputState;
  at: number;
  seq: number;
}

/**
 * Latest controller state per player, read by the game loop every frame.
 * Inputs older than INPUT_STALE_MS are treated as neutral so a phone that
 * drops offline mid-corner does not leave its car with the throttle pinned.
 */
export class InputStore {
  private readonly map = new Map<string, Entry>();

  set(playerId: string, state: InputState, seq = Number.MAX_SAFE_INTEGER): void {
    const prev = this.map.get(playerId);
    if (prev && seq < prev.seq) return; // out of order, ignore
    this.map.set(playerId, { state, at: performance.now(), seq });
  }

  get(playerId: string, now = performance.now()): InputState {
    const e = this.map.get(playerId);
    if (!e || now - e.at > INPUT_STALE_MS) return NEUTRAL_INPUT;
    return e.state;
  }

  clear(playerId?: string): void {
    if (playerId) this.map.delete(playerId);
    else this.map.clear();
  }
}
