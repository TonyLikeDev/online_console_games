import type { RoomTransport } from "./types";
import { AblyTransport } from "./ably";
import { LocalTransport } from "./local";

export type TransportKind = "ably" | "local";

export function transportKind(): TransportKind {
  return process.env.NEXT_PUBLIC_TRANSPORT === "local" ? "local" : "ably";
}

export function createTransport(code: string, clientId: string): RoomTransport {
  return transportKind() === "local" ? new LocalTransport(code, clientId) : new AblyTransport(code, clientId);
}

export type { RoomTransport, TransportMessage, PresenceEvent, PresenceMember, ConnectionStatus } from "./types";
export { TransportError } from "./types";
