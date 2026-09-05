import {
  CommandSchema,
  DEFAULT_LAPS,
  Events,
  InputMessageSchema,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  PresenceDataSchema,
  sanitizeName,
  type Phase,
  type PlayerPublic,
  type RoomState,
} from "@/lib/protocol";
import { PLAYER_COLORS } from "@/lib/colors";
import { screenClientId } from "@/lib/client-id";
import { createTransport, transportKind, type ConnectionStatus, type PresenceEvent, type RoomTransport, type TransportKind } from "@/lib/transport";
import { InputStore } from "./input-store";

export type HostStatus = "starting" | ConnectionStatus | "error";

export interface HostSnapshot {
  status: HostStatus;
  error: string | null;
  transport: TransportKind;
  room: RoomState;
  /** bumps every time a new race starts so the canvas remounts */
  raceSeed: number;
}

export interface RaceResult {
  id: string;
  position: number;
  finishTimeMs: number | null;
}

/** Local keyboard player id used by the screen's solo test mode. */
export const LOCAL_PLAYER_ID = "local-keyboard";

const ROOM_PUBLISH_THROTTLE_MS = 2000;

/**
 * The big screen owns the room: it assigns seats and colours, runs the phase
 * machine, receives inputs, and broadcasts snapshots to the phones.
 */
export class RoomHost {
  readonly inputs = new InputStore();
  private transport: RoomTransport | null = null;
  private snapshot: HostSnapshot;
  private readonly listeners = new Set<() => void>();
  private unsubs: Array<() => void> = [];
  private lastRoomPublishAt = 0;
  private roomPublishTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by start() and destroy() so a stale start() cannot resurrect a torn-down host. */
  private session = 0;

  constructor(public readonly code: string, laps: number = DEFAULT_LAPS) {
    this.snapshot = {
      status: "starting",
      error: null,
      transport: transportKind(),
      raceSeed: 0,
      room: { v: PROTOCOL_VERSION, code, phase: "lobby", hostId: null, laps, players: [] },
    };
  }

  // ---- external store plumbing (for useSyncExternalStore) ----
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): HostSnapshot => this.snapshot;

  private commit(patch: Partial<HostSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }
  private commitRoom(patch: Partial<RoomState>) {
    this.commit({ room: { ...this.snapshot.room, ...patch } });
  }
  private get room(): RoomState {
    return this.snapshot.room;
  }

  // ---- lifecycle ----
  async start(): Promise<void> {
    const session = ++this.session;
    const alive = () => session === this.session;
    const transport = createTransport(this.code, screenClientId(this.code));
    this.transport = transport;
    this.commit({ status: "starting", error: null });
    this.unsubs.push(transport.onStatus((s) => {
      if (!alive()) return;
      if (this.snapshot.status !== "error") this.commit({ status: s });
      if (s === "connected") this.publishRoom();
    }));
    try {
      await transport.connect();
      if (!alive()) return;
      const members = await transport.presenceGet();
      if (!alive()) return;
      const otherScreen = members.find((m) => {
        const parsed = PresenceDataSchema.safeParse(m.data);
        return parsed.success && parsed.data.role === "screen" && m.clientId !== transport.clientId;
      });
      if (otherScreen) throw new Error("That room code is already in use by another screen.");

      this.unsubs.push(transport.onPresence((ev) => this.onPresence(ev)));
      this.unsubs.push(transport.subscribe(Events.input, (m) => this.onInput(m.clientId, m.data)));
      this.unsubs.push(transport.subscribe(Events.cmd, (m) => this.onCommand(m.clientId, m.data)));
      await transport.presenceEnter({ role: "screen" });
      if (!alive()) return;
      for (const m of members) this.onPresence({ action: "present", clientId: m.clientId, data: m.data });
      this.commit({ status: transport.status, error: null });
      this.publishRoom();
    } catch (err) {
      if (!alive()) return;
      const message = err instanceof Error ? err.message : String(err);
      this.commit({ status: "error", error: message });
    }
  }

  /** Tears down the connection. start() may be called again afterwards. */
  destroy(): void {
    this.session += 1;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.roomPublishTimer) {
      clearTimeout(this.roomPublishTimer);
      this.roomPublishTimer = null;
    }
    const t = this.transport;
    this.transport = null;
    // Closing the connection drops presence server-side; no need to wait for leave().
    t?.close();
  }

  // ---- lobby / players ----
  private nextColorIndex(): number {
    const used = new Set(this.room.players.map((p) => p.colorIndex));
    for (let i = 0; i < PLAYER_COLORS.length; i++) if (!used.has(i)) return i;
    return this.room.players.length % PLAYER_COLORS.length;
  }

  private addOrReconnectPlayer(id: string, name: string) {
    const players = this.room.players.slice();
    const idx = players.findIndex((p) => p.id === id);
    if (idx >= 0) {
      players[idx] = { ...players[idx], connected: true, name };
    } else {
      if (players.length >= MAX_PLAYERS) return;
      const midRace = this.room.phase === "countdown" || this.room.phase === "racing";
      players.push({
        id,
        name,
        colorIndex: this.nextColorIndex(),
        connected: true,
        spectating: midRace,
        lap: 0,
        position: players.length + 1,
        finished: false,
        finishTimeMs: null,
      });
    }
    const hostId = this.room.hostId && players.some((p) => p.id === this.room.hostId && p.connected) ? this.room.hostId : id;
    this.commitRoom({ players, hostId });
    this.publishRoom();
  }

  /** Solo test mode: a keyboard-driven player that lives on the screen itself. */
  addLocalPlayer(name = "Keyboard"): void {
    if (this.room.players.some((p) => p.id === LOCAL_PLAYER_ID)) return;
    this.addOrReconnectPlayer(LOCAL_PLAYER_ID, name);
  }

  private removeOrDisconnectPlayer(id: string) {
    let players = this.room.players.slice();
    const p = players.find((x) => x.id === id);
    if (!p) return;
    if (this.room.phase === "lobby") {
      players = players.filter((x) => x.id !== id);
    } else {
      players = players.map((x) => (x.id === id ? { ...x, connected: false } : x));
    }
    this.inputs.clear(id);
    let hostId = this.room.hostId;
    if (hostId === id) hostId = players.find((x) => x.connected)?.id ?? null;
    this.commitRoom({ players, hostId });
    this.publishRoom();
  }

  private onPresence(ev: PresenceEvent) {
    if (!this.transport || ev.clientId === this.transport.clientId) return;
    const parsed = PresenceDataSchema.safeParse(ev.data);
    if (!parsed.success) return;
    if (parsed.data.role === "screen") return; // a second screen is ignored
    const name = sanitizeName(parsed.data.name) || "Player";
    switch (ev.action) {
      case "enter":
      case "present":
      case "update":
        this.addOrReconnectPlayer(ev.clientId, name);
        break;
      case "leave":
        this.removeOrDisconnectPlayer(ev.clientId);
        break;
    }
  }

  private onInput(clientId: string, data: unknown) {
    const parsed = InputMessageSchema.safeParse(data);
    if (!parsed.success) return;
    if (!this.room.players.some((p) => p.id === clientId)) return;
    const { l, r, g, b, s } = parsed.data;
    this.inputs.set(clientId, { l, r, g, b }, s);
  }

  private onCommand(clientId: string, data: unknown) {
    const parsed = CommandSchema.safeParse(data);
    if (!parsed.success) return;
    if (clientId !== this.room.hostId) return;
    switch (parsed.data.type) {
      case "start":
        this.startRace();
        break;
      case "again":
        this.raceAgain();
        break;
      case "lobby":
        this.backToLobby();
        break;
    }
  }

  // ---- phase machine ----
  get phase(): Phase {
    return this.room.phase;
  }

  /** Players who take part in the current or next race. */
  racers(): PlayerPublic[] {
    return this.room.players.filter((p) => !p.spectating);
  }

  startRace(): void {
    if (this.room.phase !== "lobby" && this.room.phase !== "results") return;
    const players = this.room.players
      .filter((p) => p.connected)
      .map((p, i) => ({ ...p, spectating: false, lap: 1, position: i + 1, finished: false, finishTimeMs: null }));
    if (players.length === 0) return;
    const hostId = players.some((p) => p.id === this.room.hostId) ? this.room.hostId : players[0].id;
    this.commit({ raceSeed: this.snapshot.raceSeed + 1, room: { ...this.room, players, hostId, phase: "countdown" } });
    this.publishRoom();
  }

  raceAgain(): void {
    if (this.room.phase !== "results") return;
    this.startRace();
  }

  backToLobby(): void {
    if (this.room.phase !== "results") return;
    const players = this.room.players
      .filter((p) => p.connected)
      .map((p, i) => ({ ...p, spectating: false, lap: 0, position: i + 1, finished: false, finishTimeMs: null }));
    const hostId = players.some((p) => p.id === this.room.hostId) ? this.room.hostId : (players[0]?.id ?? null);
    this.commitRoom({ players, hostId, phase: "lobby" });
    this.publishRoom();
  }

  // ---- callbacks from the race scene ----
  onRaceStarted(): void {
    if (this.room.phase !== "countdown") return;
    this.commitRoom({ phase: "racing" });
    this.publishRoom();
  }

  onLap(id: string, lap: number): void {
    const players = this.room.players.map((p) => (p.id === id ? { ...p, lap } : p));
    this.commitRoom({ players });
    this.publishRoom();
  }

  onStandings(order: string[]): void {
    const pos = new Map(order.map((id, i) => [id, i + 1]));
    let changed = false;
    const players = this.room.players.map((p) => {
      const position = pos.get(p.id) ?? p.position;
      if (position !== p.position) changed = true;
      return { ...p, position };
    });
    if (!changed) return;
    this.commitRoom({ players });
    this.publishRoom(false);
  }

  onPlayerFinished(id: string, finishTimeMs: number): void {
    const players = this.room.players.map((p) => (p.id === id ? { ...p, finished: true, finishTimeMs } : p));
    this.commitRoom({ players });
    this.publishRoom();
  }

  onRaceEnded(results: RaceResult[]): void {
    const byId = new Map(results.map((r) => [r.id, r]));
    const players = this.room.players.map((p) => {
      const r = byId.get(p.id);
      return r ? { ...p, position: r.position, finished: r.finishTimeMs !== null, finishTimeMs: r.finishTimeMs } : p;
    });
    this.commitRoom({ players, phase: "results" });
    this.publishRoom();
  }

  // ---- broadcast ----
  private publishRoom(immediate = true): void {
    const t = this.transport;
    if (!t || t.status !== "connected") return;
    const now = Date.now();
    const elapsed = now - this.lastRoomPublishAt;
    if (!immediate && elapsed < ROOM_PUBLISH_THROTTLE_MS) {
      if (!this.roomPublishTimer) {
        this.roomPublishTimer = setTimeout(() => {
          this.roomPublishTimer = null;
          this.publishRoom(true);
        }, ROOM_PUBLISH_THROTTLE_MS - elapsed);
      }
      return;
    }
    if (this.roomPublishTimer) {
      clearTimeout(this.roomPublishTimer);
      this.roomPublishTimer = null;
    }
    this.lastRoomPublishAt = now;
    t.publish(Events.room, this.room).catch(() => undefined);
  }
}
