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
