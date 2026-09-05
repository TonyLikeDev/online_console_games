# Console Games

Party games on a shared big screen, with phones as controllers. Built with Next.js on Vercel.
Three games so far, all for 1 to 8 players:

- **Racing**: a top-down arcade racer (Phaser). Three laps, checkpoints, results podium.
- **Tumble Run**: a 3D obstacle-course show (Three.js + Rapier). Two race rounds with
  eliminations, then a last-one-standing final on vanishing tiles. Eliminated players get a
  hazard button on their phone that drops a ball on the survivors.
- **Kitchen Rush**: a co-op cooking kitchen (Phaser). Chop, cook, plate, and serve salads,
  soups, and burgers before the orders expire. A three-minute shift with a shared team score
  and star rating; the Split Kitchen layout forces hand-offs over a counter.

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
- Add `?solo=1` to a screen URL to drive one player from the keyboard: arrows or WASD to
  move, Space to jump or accelerate, Shift to dive or brake.
- `?game=tumble`, `?game=kitchen`, or `?game=racing` preselects a game, `&laps=1` shortens a race.
- Kitchen Rush on the keyboard: WASD or arrows to move, Space to grab, drop, and plate, hold
  Shift at a chopping board to chop, tap Shift elsewhere to dash.
- In development the screen exposes `window.__roomHost`, and the 3D game exposes
  `window.__tumbleGame` whose `update(dt)` can be called from the console to step the show
  by hand, which is how the automated checks drive it.

## Ably setup (real phones)

1. Create a free app at https://ably.com and copy an API key with `publish`, `subscribe`
   and `presence` capabilities.
2. Put it in `.env.local` as `ABLY_API_KEY=...` and set `NEXT_PUBLIC_TRANSPORT=ably`.
3. On Vercel, add the same two environment variables in the project settings.

Phones on mobile data work fine; everything goes through Ably, not the local network.

## Testing on phones without deploying

`npm run dev` prints a "Network:" address such as `http://192.168.1.23:3000`. Open the **screen**
with that address too, not `localhost`, so the QR code carries an address phones can reach.
The address changes when the Mac moves to another network. `next.config.ts` allows the dev
server's own LAN addresses through Next.js's cross-origin protection; without that, pages opened
from the network address hang on their first navigation.

## Project layout

```
src/app                 routes: /, /screen/[code], /play/[code], /api/ably/token
src/lib/protocol.ts     zod schemas for every message on the wire
src/lib/transport       RoomTransport interface, Ably + local implementations
src/lib/host            screen-side room state machine and input store
src/lib/player          phone-side client
src/lib/games.ts        game registry: names, controller layouts, hazard buttons
src/lib/game-bridge.ts  contract between a running game and the room host
src/games/racing        Phaser scene, track geometry, physics config
src/games/tumble        Three.js + Rapier show: runner controller, obstacles, courses, rounds
src/games/kitchen       Phaser kitchen: ingredients and recipes, tile layouts, chefs, orders
src/components          screen (lobby, HUDs, results) and controller UI (gamepad, hazard panel)
```
