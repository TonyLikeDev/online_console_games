# Console Games

Party games on a shared big screen, with phones as controllers. Built with Next.js on Vercel.
The first game is a top-down arcade racer for 2 to 8 players.

## How it works

- The **screen** (TV or laptop browser) opens a room, shows a QR code, and runs the whole game.
- **Phones** scan the code and become controllers. They only send button presses.
- **Ably** relays messages between phones and the screen. Vercel functions cannot hold
  connections open, so the realtime layer lives outside Vercel. It is hidden behind a small
  transport interface (`src/lib/transport`) so it can be swapped later.

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Two ways to test without phones:

- `NEXT_PUBLIC_TRANSPORT=local` in `.env.local` uses a same-browser transport. Open
  `http://localhost:3000/screen/new` in one tab and the join link in other tabs.
- Add `?solo=1` to a screen URL to drive one car from the keyboard (arrows or WASD).

## Ably setup (real phones)

1. Create a free app at https://ably.com and copy an API key with `publish`, `subscribe`
   and `presence` capabilities.
2. Put it in `.env.local` as `ABLY_API_KEY=...` and set `NEXT_PUBLIC_TRANSPORT=ably`.
3. On Vercel, add the same two environment variables in the project settings.

Phones on mobile data work fine; everything goes through Ably, not the local network.

## Project layout

```
src/app                 routes: /, /screen/[code], /play/[code], /api/ably/token
src/lib/protocol.ts     zod schemas for every message on the wire
src/lib/transport       RoomTransport interface, Ably + local implementations
src/lib/host            screen-side room state machine and input store
src/lib/player          phone-side client
src/games/racing        Phaser scene, track geometry, physics config
src/components          screen (lobby, HUD, results) and controller UI
```
