import { z } from "zod";

/**
 * Wire protocol shared by the big screen (host) and the phones (controllers).
 * Everything that crosses the realtime channel is validated with these schemas.
 */

export const PROTOCOL_VERSION = 1 as const;
export const MAX_PLAYERS = 8;
export const DEFAULT_LAPS = 3;

export const GAME_IDS = ["racing", "tumble"] as const;
export const GameIdSchema = z.enum(GAME_IDS);
export type GameId = z.infer<typeof GameIdSchema>;
export const DEFAULT_GAME: GameId = "racing";

/** Realtime event names on the room channel. */
export const Events = {
  /** phone -> screen: controller state */
  input: "input",
  /** phone -> screen: lobby commands */
  cmd: "cmd",
  /** screen -> phones: full room snapshot */
  room: "room",
} as const;

/**
 * Generic six-button controller: a direction pad (l, r, u, d) and two action
 * buttons (a, b). Each game decides what the buttons mean and how the phone
 * labels them. Short keys keep the message tiny.
 */
export const InputStateSchema = z.object({
  l: z.boolean(),
  r: z.boolean(),
  u: z.boolean(),
  d: z.boolean(),
  a: z.boolean(),
  b: z.boolean(),
});
export type InputState = z.infer<typeof InputStateSchema>;
export const NEUTRAL_INPUT: InputState = { l: false, r: false, u: false, d: false, a: false, b: false };
export const INPUT_KEYS = ["l", "r", "u", "d", "a", "b"] as const satisfies readonly (keyof InputState)[];

export function inputEquals(x: InputState, y: InputState): boolean {
  return x.l === y.l && x.r === y.r && x.u === y.u && x.d === y.d && x.a === y.a && x.b === y.b;
}
export function inputActive(s: InputState): boolean {
  return s.l || s.r || s.u || s.d || s.a || s.b;
}

export const InputMessageSchema = InputStateSchema.extend({
  /** monotonically increasing sequence number from the phone */
  s: z.number().int().nonnegative(),
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

/** How long the screen trusts the last input before treating the phone as silent. */
export const INPUT_STALE_MS = 900;
/** While any button is held, the phone repeats its state this often. */
export const INPUT_HEARTBEAT_MS = 250;

export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("again") }),
  z.object({ type: z.literal("lobby") }),
  z.object({ type: z.literal("game"), game: GameIdSchema }),
]);
export type Command = z.infer<typeof CommandSchema>;

export const PhaseSchema = z.enum(["lobby", "countdown", "playing", "results"]);
export type Phase = z.infer<typeof PhaseSchema>;

export const StageSchema = z.object({
  /** 1-based round number */
  index: z.number().int(),
  count: z.number().int(),
  name: z.string(),
});
export type Stage = z.infer<typeof StageSchema>;

export const PlayerPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorIndex: z.number().int(),
  connected: z.boolean(),
  /** joined while a game was running; sits out until the next one */
  spectating: z.boolean(),
  /** current rank, 1 = leading */
  position: z.number().int(),
  /** done with the current round or race (finished, qualified) */
  finished: z.boolean(),
  /** out of the game for good; the phone turns into a hazard panel */
  eliminated: z.boolean(),
  lap: z.number().int(),
  /** short human-readable status, e.g. "1:23.4" or "Out in round 2" */
  detail: z.string(),
  finishTimeMs: z.number().nullable(),
});
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

export const RoomStateSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  code: z.string(),
  phase: PhaseSchema,
  game: GameIdSchema,
  hostId: z.string().nullable(),
  laps: z.number().int(),
  stage: StageSchema.nullable(),
  players: z.array(PlayerPublicSchema),
});
export type RoomState = z.infer<typeof RoomStateSchema>;

export const PresenceDataSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("screen") }),
  z.object({ role: z.literal("player"), name: z.string().min(1).max(16) }),
]);
export type PresenceData = z.infer<typeof PresenceDataSchema>;

export const NAME_MAX_LENGTH = 16;
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
}
