@AGENTS.md

# Project notes

- Party-game platform: one big screen runs the game (Phaser), phones are thin controllers.
- Realtime goes through `src/lib/transport` (Ably in production, BroadcastChannel locally).
  Game code must never import Ably directly.
- Phones send input only on change plus a heartbeat while a button is held. Keep it that way
  to stay inside Ably's free tier.
- Every message on the wire is validated with the zod schemas in `src/lib/protocol.ts`.
- Test locally with `NEXT_PUBLIC_TRANSPORT=local` and `/screen/new?solo=1` for keyboard driving.
