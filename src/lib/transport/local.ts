import { channelNameFor } from "@/lib/room-code";
import type {
  ConnectionStatus,
  PresenceEvent,
  PresenceMember,
  RoomTransport,
  TransportMessage,
} from "./types";

/**
 * Same-browser transport built on BroadcastChannel. Lets you open the screen
 * in one tab and controllers in other tabs with no realtime account at all.
 * Enabled with NEXT_PUBLIC_TRANSPORT=local.
 */

type Envelope =
  | { kind: "msg"; event: string; clientId: string; data: unknown }
  | { kind: "presence"; action: "enter" | "leave" | "update" | "sync"; clientId: string; data: unknown }
  | { kind: "query"; clientId: string };

export class LocalTransport implements RoomTransport {
  status: ConnectionStatus = "connecting";
  private bc: BroadcastChannel | null = null;
  private members = new Map<string, unknown>();
  private myPresence: unknown = undefined;
  private entered = false;
  private readonly msgHandlers = new Map<string, Set<(m: TransportMessage) => void>>();
  private readonly presenceHandlers = new Set<(ev: PresenceEvent) => void>();
  private readonly statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private readonly onPageHide = () => {
    if (this.entered) this.post({ kind: "presence", action: "leave", clientId: this.clientId, data: this.myPresence });
  };

  constructor(public readonly code: string, public readonly clientId: string) {}

  async connect(): Promise<void> {
    this.bc = new BroadcastChannel(`ocg:${channelNameFor(this.code)}`);
    this.bc.onmessage = (ev: MessageEvent<Envelope>) => this.handle(ev.data);
    window.addEventListener("pagehide", this.onPageHide);
    this.post({ kind: "query", clientId: this.clientId });
    // Give existing members a moment to answer the query.
    await new Promise((r) => setTimeout(r, 150));
    this.setStatus("connected");
  }

  close(): void {
    this.onPageHide();
    window.removeEventListener("pagehide", this.onPageHide);
    this.bc?.close();
    this.bc = null;
    this.setStatus("disconnected");
  }

  async publish(event: string, data: unknown): Promise<void> {
    this.post({ kind: "msg", event, clientId: this.clientId, data });
  }

  subscribe(event: string, handler: (msg: TransportMessage) => void): () => void {
    let set = this.msgHandlers.get(event);
    if (!set) {
      set = new Set();
      this.msgHandlers.set(event, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  async presenceEnter(data: unknown): Promise<void> {
    this.myPresence = data;
    this.entered = true;
    this.members.set(this.clientId, data);
    this.post({ kind: "presence", action: "enter", clientId: this.clientId, data });
  }
  async presenceUpdate(data: unknown): Promise<void> {
    this.myPresence = data;
    this.members.set(this.clientId, data);
    this.post({ kind: "presence", action: "update", clientId: this.clientId, data });
  }
  async presenceLeave(): Promise<void> {
    this.entered = false;
    this.members.delete(this.clientId);
    this.post({ kind: "presence", action: "leave", clientId: this.clientId, data: this.myPresence });
  }
  async presenceGet(): Promise<PresenceMember[]> {
    return Array.from(this.members, ([clientId, data]) => ({ clientId, data }));
  }
  onPresence(handler: (ev: PresenceEvent) => void): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }
  onStatus(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private post(env: Envelope) {
    this.bc?.postMessage(env);
  }

  private setStatus(s: ConnectionStatus) {
    if (s === this.status) return;
    this.status = s;
    for (const h of this.statusHandlers) h(s);
  }

  private emitPresence(ev: PresenceEvent) {
    for (const h of this.presenceHandlers) h(ev);
  }

  private handle(env: Envelope) {
    switch (env.kind) {
      case "msg": {
        const set = this.msgHandlers.get(env.event);
        if (!set) return;
        for (const h of set) h({ clientId: env.clientId, data: env.data });
        return;
      }
      case "query": {
        if (this.entered) {
          this.post({ kind: "presence", action: "sync", clientId: this.clientId, data: this.myPresence });
        }
        return;
      }
      case "presence": {
        if (env.action === "leave") {
          if (this.members.delete(env.clientId)) {
            this.emitPresence({ action: "leave", clientId: env.clientId, data: env.data });
          }
          return;
        }
        const known = this.members.has(env.clientId);
        this.members.set(env.clientId, env.data);
        if (env.action === "sync") {
          if (!known) this.emitPresence({ action: "present", clientId: env.clientId, data: env.data });
        } else if (env.action === "update") {
          this.emitPresence({ action: known ? "update" : "enter", clientId: env.clientId, data: env.data });
        } else {
          this.emitPresence({ action: "enter", clientId: env.clientId, data: env.data });
        }
        return;
      }
    }
  }
}
