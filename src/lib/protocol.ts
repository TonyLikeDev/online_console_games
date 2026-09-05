import { z } from "zod";

/**
 * Wire protocol shared by the big screen (host) and the phones (controllers).
 * Everything that crosses the realtime channel is validated with these schemas.
 */

export const PROTOCOL_VERSION = 1 as const;
export const MAX_PLAYERS = 8;
export const DEFAULT_LAPS = 3;

/** Realtime event names on the room channel. */
export const Events = {
  /** phone -> screen: controller state */
  input: "input",
  /** phone -> screen: lobby commands (start, again, lobby) */
  cmd: "cmd",
  /** screen -> phones: full room snapshot */
  room: "room",
} as const;

/** Controller button state. Short keys keep the message tiny. */
export const InputStateSchema = z.object({
  l: z.boolean(),
  r: z.boolean(),
  g: z.boolean(),
  b: z.boolean(),
});
export type InputState = z.infer<typeof InputStateSchema>;
export const NEUTRAL_INPUT: InputState = { l: false, r: false, g: false, b: false };

export function inputEquals(a: InputState, b: InputState): boolean {
  return a.l === b.l && a.r === b.r && a.g === b.g && a.b === b.b;
}
export function inputActive(s: InputState): boolean {
  return s.l || s.r || s.g || s.b;
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
]);
export type Command = z.infer<typeof CommandSchema>;

export const PhaseSchema = z.enum(["lobby", "countdown", "racing", "results"]);
export type Phase = z.infer<typeof PhaseSchema>;

export const PlayerPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorIndex: z.number().int(),
  connected: z.boolean(),
  /** joined while a race was running; sits out until the next race */
  spectating: z.boolean(),
  lap: z.number().int(),
  position: z.number().int(),
  finished: z.boolean(),
  finishTimeMs: z.number().nullable(),
});
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

export const RoomStateSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  code: z.string(),
  phase: PhaseSchema,
  hostId: z.string().nullable(),
  laps: z.number().int(),
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
