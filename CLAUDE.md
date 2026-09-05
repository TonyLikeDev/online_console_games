@AGENTS.md

# Project notes

- Party-game platform: one big screen runs the game (Phaser), phones are thin controllers.
- Realtime goes through `src/lib/transport` (Ably in production, BroadcastChannel locally).
  Game code must never import Ably directly.
- Phones send input only on change plus a heartbeat while a button is held. Keep it that way
  to stay inside Ably's free tier.
- Every message on the wire is validated with the zod schemas in `src/lib/protocol.ts`.
- Test locally with `NEXT_PUBLIC_TRANSPORT=local` and `/screen/new?solo=1` for keyboard driving.
- Controllers are generic six-button pads (l, r, u, d, a, b). Each game maps them in
  `src/lib/games.ts` and talks to the host only through `GameBridge` in `src/lib/game-bridge.ts`.
- Tumble Run runs every timer on its own simulation clock (`TumbleGame.time`), never wall-clock,
  so `window.__tumbleGame.update(1/60)` from the console steps it deterministically for tests.
  A hidden browser tab pauses requestAnimationFrame, so drive it by hand when testing headless.
- The Phaser games (racing, kitchen) expose `window.__phaserGame` in dev. To script them, call
  `game.loop.sleep()` first, then `game.step(t, 1000/60)` per frame; otherwise the real loop
  runs alongside your script whenever the tab is visible and doubles every input.
- Kitchen Rush rules live in `src/games/kitchen/items.ts` (ingredient states, recipes) and
  layouts are ASCII maps in `layouts.ts`; a layout with `minPlayers: 2` is never picked solo.
- Next.js dev blocks its HMR socket for non-localhost origins and the app router then hangs on
  the first client navigation ("Opening a room…" forever). `next.config.ts` puts this machine's
  LAN addresses in `allowedDevOrigins`; keep that when touching the config. Only one `next dev`
  can run per project directory, and it restarts itself when `next.config.ts` changes.
