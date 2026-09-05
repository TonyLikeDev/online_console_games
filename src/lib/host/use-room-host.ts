"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { RoomHost, type HostSnapshot } from "./room-host";

/** Creates a RoomHost for the given code and keeps React in sync with it. */
export function useRoomHost(code: string, laps?: number): { host: RoomHost; snapshot: HostSnapshot } {
  const host = useMemo(() => new RoomHost(code, laps), [code, laps]);
  useEffect(() => {
    void host.start();
    return () => host.destroy();
  }, [host]);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  return { host, snapshot };
}
