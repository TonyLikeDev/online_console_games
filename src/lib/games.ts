import type { GameId } from "./protocol";

/** Colour keys the gamepad knows how to render. */
export type ButtonColor = "green" | "red" | "blue" | "yellow";

export interface ActionButton {
  label: string;
  color: ButtonColor;
}

export interface ControllerLayout {
  /** two big steer buttons, or a round eight-way pad */
  pad: "2-way" | "8-way";
  a: ActionButton;
  b: ActionButton;
}

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  /** one-line summary of the controls, shown on the phone before a round */
  controls: string;
  controller: ControllerLayout;
  /** label for the phone's hazard button once a player is out, if the game has one */
  hazardButton: string | null;
}

/**
 * Everything the lobby and the phones need to know about a game. Rendering
 * code lives in src/games/<id> and is loaded only on the screen.
 */
export const GAMES: Record<GameId, GameMeta> = {
  racing: {
    id: "racing",
    name: "Racing",
    tagline: "Top-down arcade racer. Three laps, eight cars, one screen.",
    controls: "Steer with the arrows, hold GAS, tap BRAKE to slow or reverse.",
    controller: {
      pad: "2-way",
      a: { label: "GAS", color: "green" },
      b: { label: "BRAKE", color: "red" },
    },
    hazardButton: null,
  },
  tumble: {
    id: "tumble",
    name: "Tumble Run",
    tagline: "Obstacle-course chaos. Survive three rounds, last one standing wins.",
    controls: "Run with the pad, JUMP over gaps, DIVE for the finish line.",
    controller: {
      pad: "8-way",
      a: { label: "JUMP", color: "green" },
      b: { label: "DIVE", color: "blue" },
    },
    hazardButton: "ROLL A BALL",
  },
  kitchen: {
    id: "kitchen",
    name: "Kitchen Rush",
    tagline: "Co-op cooking chaos. Chop, cook, plate, and serve before the orders expire.",
    controls: "Move with the pad. GRAB picks up, drops, and plates. Hold CHOP at a board, or tap it to dash.",
    controller: {
      pad: "8-way",
      a: { label: "GRAB", color: "green" },
      b: { label: "CHOP", color: "yellow" },
    },
    hazardButton: null,
  },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);
