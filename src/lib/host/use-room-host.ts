"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { GameId } from "@/lib/protocol";
import { RoomHost, type HostSnapshot } from "./room-host";

/** Creates a RoomHost for the given code and keeps React in sync with it. */
export function useRoomHost(code: string, laps?: number, game?: GameId): { host: RoomHost; snapshot: HostSnapshot } {
  const host = useMemo(() => new RoomHost(code, laps, game), [code, laps, game]);
  useEffect(() => {
    void host.start();
    return () => host.destroy();
  }, [host]);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  return { host, snapshot };
}
