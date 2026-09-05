/**
 * Minimal pub/sub + presence abstraction over the realtime provider.
 * The game code only talks to this interface, so Ably can be swapped for
 * WebRTC or a Durable Object later without touching game logic.
 */

export interface TransportMessage {
  clientId: string;
  data: unknown;
}

export type PresenceAction = "enter" | "leave" | "update" | "present";

export interface PresenceMember {
  clientId: string;
  data: unknown;
}

export interface PresenceEvent extends PresenceMember {
  action: PresenceAction;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";

export interface RoomTransport {
  readonly code: string;
  readonly clientId: string;
  readonly status: ConnectionStatus;

  connect(): Promise<void>;
  close(): void;

  publish(event: string, data: unknown): Promise<void>;
  subscribe(event: string, handler: (msg: TransportMessage) => void): () => void;

  presenceEnter(data: unknown): Promise<void>;
  presenceUpdate(data: unknown): Promise<void>;
  presenceLeave(): Promise<void>;
  presenceGet(): Promise<PresenceMember[]>;
  onPresence(handler: (ev: PresenceEvent) => void): () => void;

  onStatus(handler: (status: ConnectionStatus) => void): () => void;
}

export class TransportError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TransportError";
  }
}
