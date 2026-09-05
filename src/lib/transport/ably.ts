import * as Ably from "ably";
import { channelNameFor } from "@/lib/room-code";
import type {
  ConnectionStatus,
  PresenceAction,
  PresenceEvent,
  PresenceMember,
  RoomTransport,
  TransportMessage,
} from "./types";
import { TransportError } from "./types";

function mapState(state: Ably.ConnectionState): ConnectionStatus {
  switch (state) {
    case "connected":
      return "connected";
    case "failed":
      return "failed";
    case "initialized":
    case "connecting":
      return "connecting";
    default:
      return "disconnected";
  }
}

/** Ably Realtime transport. Tokens are minted by /api/ably/token. */
export class AblyTransport implements RoomTransport {
  status: ConnectionStatus = "connecting";
  private readonly client: Ably.Realtime;
  private readonly channel: Ably.RealtimeChannel;
  private readonly statusHandlers = new Set<(s: ConnectionStatus) => void>();

  constructor(public readonly code: string, public readonly clientId: string) {
    this.client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authMethod: "GET",
      authParams: { clientId },
      clientId,
      echoMessages: false,
      autoConnect: false,
      closeOnUnload: true,
    });
    this.channel = this.client.channels.get(channelNameFor(code));
    this.client.connection.on((change) => {
      const next = mapState(change.current);
      if (next !== this.status) {
        this.status = next;
        for (const h of this.statusHandlers) h(next);
      }
    });
  }

  async connect(): Promise<void> {
    this.client.connect();
    try {
      await this.client.connection.once("connected");
      await this.channel.attach();
    } catch (err) {
      const reason = this.client.connection.errorReason;
      throw new TransportError(reason?.message ?? "Could not connect to Ably", err);
    }
  }

  close(): void {
    this.client.close();
  }

  async publish(event: string, data: unknown): Promise<void> {
    await this.channel.publish(event, data);
  }

  subscribe(event: string, handler: (msg: TransportMessage) => void): () => void {
    const listener = (m: Ably.Message) => handler({ clientId: m.clientId ?? "", data: m.data });
    void this.channel.subscribe(event, listener);
    return () => this.channel.unsubscribe(event, listener);
  }

  presenceEnter(data: unknown): Promise<void> {
    return this.channel.presence.enter(data);
  }
  presenceUpdate(data: unknown): Promise<void> {
    return this.channel.presence.update(data);
  }
  presenceLeave(): Promise<void> {
    return this.channel.presence.leave();
  }
  async presenceGet(): Promise<PresenceMember[]> {
    const members = await this.channel.presence.get();
    return members.map((m) => ({ clientId: m.clientId ?? "", data: m.data }));
  }
  onPresence(handler: (ev: PresenceEvent) => void): () => void {
    const listener = (m: Ably.PresenceMessage) =>
      handler({ action: m.action as PresenceAction, clientId: m.clientId ?? "", data: m.data });
    void this.channel.presence.subscribe(listener);
    return () => this.channel.presence.unsubscribe(listener);
  }

  onStatus(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }
}
