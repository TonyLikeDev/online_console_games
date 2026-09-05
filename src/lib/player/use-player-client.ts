"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { PlayerClient, type PlayerSnapshot } from "./player-client";

export function usePlayerClient(code: string): { client: PlayerClient; snapshot: PlayerSnapshot } {
  const client = useMemo(() => new PlayerClient(code), [code]);
  useEffect(() => {
    void client.start();
    return () => client.destroy();
  }, [client]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { client, snapshot };
}
