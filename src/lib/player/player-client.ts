import {
  Events,
  INPUT_HEARTBEAT_MS,
  NEUTRAL_INPUT,
  PresenceDataSchema,
  RoomStateSchema,
  inputActive,
  inputEquals,
  sanitizeName,
  type Command,
  type InputState,
  type PlayerPublic,
  type RoomState,
} from "@/lib/protocol";
import { getPlayerClientId, savePlayerName } from "@/lib/client-id";
import { createTransport, type ConnectionStatus, type PresenceEvent, type RoomTransport } from "@/lib/transport";

export type PlayerStatus = "connecting" | "no-room" | "ready" | "joined" | "error";

export interface PlayerSnapshot {
  status: PlayerStatus;
  connection: ConnectionStatus;
  error: string | null;
  screenPresent: boolean;
  room: RoomState | null;
  me: PlayerPublic | null;
  clientId: string;
}

/** Phone-side client: joins a room, streams controller input, mirrors room state. */
export class PlayerClient {
  private transport: RoomTransport | null = null;
  private snapshot: PlayerSnapshot;
  private readonly listeners = new Set<() => void>();
  private unsubs: Array<() => void> = [];
  /** Bumped by start() and destroy() so a stale start() cannot resurrect a torn-down client. */
  private session = 0;
  private seq = 0;
  private current: InputState = NEUTRAL_INPUT;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(public readonly code: string) {
    this.snapshot = {
      status: "connecting",
      connection: "connecting",
      error: null,
      screenPresent: false,
      room: null,
      me: null,
      clientId: "",
    };
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): PlayerSnapshot => this.snapshot;

  private commit(patch: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  async start(): Promise<void> {
    const session = ++this.session;
    const alive = () => session === this.session;
    const clientId = getPlayerClientId();
    this.commit({ clientId, status: "connecting", error: null });
    const transport = createTransport(this.code, clientId);
    this.transport = transport;
    this.unsubs.push(transport.onStatus((connection) => {
      if (alive()) this.commit({ connection });
    }));
    try {
      await transport.connect();
      if (!alive()) return;
      this.unsubs.push(transport.onPresence((ev) => this.onPresence(ev)));
      this.unsubs.push(transport.subscribe(Events.room, (m) => this.onRoom(m.data)));
      const members = await transport.presenceGet();
      if (!alive()) return;
      const screenPresent = members.some((m) => {
        const parsed = PresenceDataSchema.safeParse(m.data);
        return parsed.success && parsed.data.role === "screen";
      });
      this.commit({ connection: transport.status, screenPresent, status: screenPresent ? "ready" : "no-room" });
    } catch (err) {
      if (!alive()) return;
      const message = err instanceof Error ? err.message : String(err);
      this.commit({ status: "error", error: message });
    }
  }

  /** Tears down the connection. start() may be called again afterwards. */
  destroy(): void {
    this.session += 1;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const u of this.unsubs) u();
    this.unsubs = [];
    const t = this.transport;
    this.transport = null;
    t?.close();
  }

  async join(rawName: string): Promise<void> {
    const t = this.transport;
    if (!t || this.snapshot.status !== "ready") return;
    const name = sanitizeName(rawName) || "Player";
    savePlayerName(name);
    await t.presenceEnter({ role: "player", name });
    this.commit({ status: "joined" });
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        if (inputActive(this.current)) this.sendInput();
      }, INPUT_HEARTBEAT_MS);
    }
  }

  /** Called by the gamepad whenever the pressed set changes. */
  setInput(state: InputState): void {
    if (inputEquals(state, this.current)) return;
    this.current = state;
    this.sendInput();
  }

  private sendInput() {
    const t = this.transport;
    if (!t || this.snapshot.status !== "joined") return;
    this.seq += 1;
    t.publish(Events.input, { ...this.current, s: this.seq }).catch(() => undefined);
  }

  sendCommand(cmd: Command): void {
    this.transport?.publish(Events.cmd, cmd).catch(() => undefined);
  }

  private onPresence(ev: PresenceEvent) {
    const parsed = PresenceDataSchema.safeParse(ev.data);
    if (!parsed.success || parsed.data.role !== "screen") return;
    if (ev.action === "leave") {
      this.commit({ screenPresent: false });
    } else {
      const status = this.snapshot.status === "no-room" ? "ready" : this.snapshot.status;
      this.commit({ screenPresent: true, status });
    }
  }

  private onRoom(data: unknown) {
    const parsed = RoomStateSchema.safeParse(data);
    if (!parsed.success) return;
    const room = parsed.data;
    const me = room.players.find((p) => p.id === this.snapshot.clientId) ?? null;
    this.commit({ room, me });
  }
}
