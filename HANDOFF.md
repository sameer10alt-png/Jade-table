# Handoff: Mahjong (working name "Jade Table")

A browser mahjong game in the spirit of planetmahjong.com. It has three variants (Taiwanese 16-tile, Riichi, Bombay Traditional), and you play against bots. Everything runs in the browser; there is no server yet.

## Quick match (2026-10-21)

Home page (green bar under the headline) or Online page → Quick match → pick a game → `/quick/<variant>` waiting screen. Server: `server/src/quick.ts` (`QuickQueue`) and `/api/quick/{join,status,now,leave}` (POST) plus `/api/quick/counts` in `node.ts`.
- **One line per game type; guests and signed-in players share it** (signed in, the account comes from the cookie; guests can't claim `account-` ids).
- **Matching:** 4 waiting for the same game → a table at once (longest-waiting first). After **30 s** (`WAIT_MS`) whoever is waiting is seated and bots fill the rest. **"Start now with bots"** does that immediately and takes along anyone else waiting.
- **Arriving:** the waiting page checks in every 2 s. Silent for 12 s = dropped from the line, so nobody is seated who already closed the tab. Cancel or closing the page leaves at once (keepalive request).
- **The table:** `TableCore.initQuick` pre-seats the matched players (first one hosts, for "play again"). It starts by itself when all have connected, or after 15 s (`quickStart(true)`). Anyone missing gets the usual 10 s grace before a bot covers them. The lobby shows "Quick match: starting…" instead of a Start button, and no "Invite friends" card. Settings: East round, intermediate bots.
- Add-friend icons work at quick tables (meet strangers, then add them) for signed-in players.
- The line lives in memory (one Railway server). A restart empties it, and waiting pages rejoin on their next check-in. Not built for the Cloudflare host.
- Test: `node server/scripts/quick-check.mjs` (13 checks, local server with `ACCOUNTS_FAKE_LOGIN=1` on 8080).

## Friends (2026-10-20)

Signed-in players only (guests have no stable identity to befriend). Server: `server/src/friends.ts`; app: `/friends`, `/friends/add/TOKEN`, `#lib/online/friends.svelte.ts`, `FriendRow.svelte`.
- **Two ways to add, on purpose different:**
  - **Friend code** (6 characters, e.g. `#K7QM2X`). Typing someone's code sends a **request** they must accept. If they had already requested you, it's instant.
  - **Add-me link** (`/friends/add/<12-char token>`). The visitor sees "X wants to be friends" and must press **Accept**; nothing happens just by opening it. The sender doesn't approve again, since sending the link was their yes. It works for brand-new people: they see "X invited you", sign in with Google, land back on the link and press Accept. The token is a separate secret from the code, so a code never skips the request step. "Make a new link" retires the old one.
  - **At a table**: a small person icon beside each signed-in opponent (rails, top box, laptop cards), plus buttons in the lobby seat list and the ☰ Players list. Outlined + = add; solid gold = they asked you (a tap accepts); dashed and faded = your request is waiting; ivory badge with a green tick = friends. The server only takes **seat numbers** (`GET /api/friends/table/CODE`, `POST /api/friends/add-seat`), checks you're seated there, and never sends out other players' codes or account ids. Guests and bots get no icon. The table refreshes this once a minute.
- Every friendship needs both people's yes.
- **The bell** (`server/src/notifications.ts`, `Bell.svelte`): a saved history in the `notifications` table, covering friend request (Accept), request accepted, table invite (Join), and "X sat down at your table" (lobby only; coming back to your own seat doesn't count). Buttons only show while still actionable: the server works out `active` (request still pending, invite table still open). Opening the bell marks all read. Kept 30 days, 50 shown. `fromId` stays on the server. The bell holds the only red badge. **Phones (under 700px):** the top bar is logo + bell + ☰; the ☰ menu holds Play, Online, Friends, Rules and your account (or Sign in). The bell stays outside the menu so invites are one tap away. Pop-ups come from the same notes (`/api/notify` returns unread count + newest unread). Phone notifications (Web Push) should reuse `addNote()` as the single place events are created.
- Not done: "your turn" notes. A seat whose player is away is played by a bot after 10 s, so nobody ever waits on you.
- Presence: "online" means seen in the last 2 minutes (the header polls `/api/notify` every 30 s); "at a table" comes from live sockets.
- **Invites:** in an online lobby with a free seat, the "Invite friends" card sends an invitation (accepted friends only, and only to a lobby table you're seated at). It shows on their home page and `/friends` and expires after 24 h.
- The header has Friends with a red badge (requests + invitations). **Pop-ups** (`Toasts.svelte`, in the layout so they show on the game table too): "X wants to be friends · Accept" and "X invited you · Join". `/api/notify` (polled every 20 s, and at once when you return to the tab) sends the newest few items. Each pops up once per browser (seen keys in localStorage). Joining from a table asks first, because you leave your seat (a bot covers it). Not yet: notifications while the site is closed (Web Push, next). Under 640px the Rules link is hidden to make room.
- "Played with you recently" suggests account players you shared a table with.
- No emails are ever shown: friends see a name and Google picture only.
- Test: `node server/scripts/friends-check.mjs` (47 checks, incl. the bell, needs the local server with `ACCOUNTS_FAKE_LOGIN=1` on port 8080).

## My tables on any device (2026-10-20)

- With `DATABASE_URL` set, **tables are stored in Postgres** (`rooms` table, saved after every change) instead of files or memory, so deploys no longer end games and **no Railway volume is needed**. `server/src/storage.ts` holds both stores (database, or files/memory locally).
- Signed-in players are remembered per table (`table_members`). `GET /api/my/tables` returns summaries only (variant, status, round and hand, whose turn, names and scores, never hands or the wall). `DELETE /api/my/tables/CODE` removes a table from your list.
- The home page shows "Your tables" (5 newest) when signed in; `/account` lists them all, each with Rejoin and remove.
- Signed-in bot games: the setup page's "Save to my account" (on by default) creates a server table and starts it at once (`/online/CODE?start=1`), so you can continue on any device. Guests still play bot games in the browser. The server now supports "mixed" bots (one of each level).
- Tables idle for 3 days are deleted (matches the privacy policy).
- Local test: `ACCOUNTS_FAKE_LOGIN=1 PGLITE_DIR=<folder>` keeps the test database across restarts.

## Accounts: Sign in with Google (2026-10-20)

Optional: guests can still play everything. Signing in is the foundation for "my tables on any device" and friends.

- `server/src/accounts.ts`: server-side Google OAuth (authorization-code flow with a `state` check), users and sessions in Postgres. The session cookie is HttpOnly, SameSite=Lax and Secure on https; only a SHA-256 hash of the token is stored.
- Railway variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL`. Without them the site runs guest-only. Tables are created automatically on startup.
- At tables, a signed-in player's id is `account-<id>`, decided by the server from the cookie, never by the browser. Guests can't claim `account-` ids. A guest seat (and host role) held before signing in moves to the account on reconnect, and only genuine guest ids can be moved.
- Pages: Sign in / avatar in the header, `/account` (rename, sign out); the online pages use the account name.
- Local testing without Google: `ACCOUNTS_FAKE_LOGIN=1` turns on `/auth/test-login?name=X` and an in-process Postgres (PGlite). **Never set this on Railway.** `node server/scripts/accounts-check.mjs` runs 9 checks, including two seat-stealing attacks.

## Dice seating and breaking the wall (2026-10-20)

Every game starts in a `seating` phase: each player rolls two dice, the highest total sits East and deals first, and ties re-roll among the tied players only. Every hand then starts in a `wallbreak` phase: the dealer rolls (3 dice in Taiwanese and Bombay, 2 in Riichi), and the total picks the side (counted counter-clockwise from the dealer) and how many stacks in the deal starts. Riichi's dead wall is taken from right behind the break.

- Engine: `rollForSeat()`, `breakWall()` and `deal()` in `game.ts`; one action, `{ t: 'roll' }`. Dice come from the game's hidden seed, so online nobody can predict or fake them.
- Server: 15s to roll, then the server rolls for you. Bots roll by themselves.
- UI: `Dice.svelte` (die faces with a tumble animation) and `DicePanel.svelte`. Winds and the dealer badge stay hidden until the seat roll decides them.
- Tests: highest roll becomes East, ties re-roll only the tied players, only the dealer breaks the wall, Riichi keeps a 14-tile dead wall.
- Tests that need a plain start pass `diceSeating: false` to `newGame`.

## Deploying on Railway (2026-10-13)

The game server now runs on **plain Node.js** as well as Cloudflare. All table logic lives in `server/src/core/table.ts`, with a thin host layer on top: `server/src/node.ts` (Railway/any VPS) or `server/src/cloudflare.ts`. On Railway, **one service serves everything from one address**: the website, `/api/...`, and the live connections at `/ws/table/CODE`.

Steps:
1. Connect this repo to a Railway service (or `railway up` from the project root). Railway reads the root `package.json` and `railway.json`: it builds with `npm run build` (website + server) and starts with `npm start`. The health check is `/healthz`.
2. Add **PostgreSQL** and set `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Tables are then saved in the database and survive deploys. (Without a database, a Volume plus `DATA_DIR=/data` does the same with files.)
3. Generate a domain and open `https://<your-app>.up.railway.app`. The website talks to the server on the same address, so there's no `SERVER_URL` to configure.
4. Retire the old Railway server from the `build-mj` version: it sent every player all hands, the wall order and the shuffle seed.

Test it locally the same way: `npm run build && npm start` from the project root, then open http://localhost:8080.

Merged from Sameer's `build-mj`: the LRC Taiwanese scoresheet (bot win rate with the minimum rose from 34% to 47%), weaker beginner bots, the lifted "NEW" drawn tile, and auto-scrolling discards. Not merged: the single-HTML-file build with `#/` routing, which conflicts with normal links and sharing. It could come back as a separate optional "offline" build.

## Online play (local test version, built 2026-10-07)

Two programs run side by side:

```bash
cd server && npm install && npm run dev   # game server, http://localhost:8787
cd app && npm run dev -- --host           # website,     http://localhost:5173
```

Open http://localhost:5173/online, create a table, and share the code or link. To be a second player on the same computer, use another browser (or `127.0.0.1` instead of `localhost`, which has separate storage). Phones on the same Wi-Fi can use `http://<this PC's IP>:5173/online`. The website forwards `/api` and `/ws` to the game server (see `vite.config.ts`), so devices only need port 5173. Windows must allow **Node.js** on private networks. Note: plain `http://` on a LAN IP is an *insecure* page, so secure-only browser features like `crypto.randomUUID()` and the clipboard are missing there. Don't use them without a fallback.

How it works:
- `server/src/index.ts`: a Cloudflare Worker plus **one Durable Object per table** (`TableRoom`). The server runs the **same engine** (`app/src/lib/engine`) and is the authority: it validates every move, drives the bots, and stores the table, so a server restart resumes the game.
- `app/src/lib/online/protocol.ts`: the messages, plus `redactFor()`, which sends each player only what they may see (no other hands, wall order, seed, or others' claim choices).
- `app/src/lib/online/client.ts`: identity (a random id in localStorage until we have accounts) and a self-reconnecting WebSocket.
- `routes/online/` is create/join, and `routes/online/[code]` is the lobby, then the table. `GameTable.svelte` draws the table for both offline and online play.
- Timers: 15s for calls, 40s for turns, then the server plays for you. A dropped player gets 10s grace, then a bot covers the seat. A table with nobody connected parks itself, and nothing runs.
- Test: `GAME_SERVER=http://127.0.0.1:8787 npx vitest run online` (in `app/`, with the server running) plays a full hand with two people and two bots and checks that nobody sees hidden tiles.

Since then: accounts, friends, quick match (see the sections above). Not done: deploying to Cloudflare.

## Get it running

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + full bot-vs-bot games for every variant (~15s)
npm run check      # type check (should be 0 errors)
```

Needs Node 20+ (built with Node 24). The stack is SvelteKit 3 + Svelte 5 (runes) + TypeScript + Vitest.

> SvelteKit 3 detail: `#lib/...` imports need the file extension, e.g. `import { x } from '#lib/engine/game.ts'`.

## What's in the repo

| Path | What |
|---|---|
| `research/planetmahjong-teardown.md` | How planetmahjong.com is built (stack, WebSocket protocol, game phases, bots, product surface). Start here for the "why". |
| `app/src/lib/engine/` | The whole game, as pure TypeScript with no UI. `applyAction(state, seat, action) → newState`. |
| `app/src/lib/engine/variants/` | One file per ruleset: scoring + settlement + rules text. |
| `app/src/lib/engine/bots.ts` | Bot logic (shanten, useful-tile counting, value bias, defence, claim policy). |
| `app/src/lib/components/` | Tiles (original SVG art), seats, discard piles, melds. |
| `app/src/routes/` | `/` home, `/play/[variant]` setup, `/table` game, `/rules/[variant]` rules. |
| `app/README.md` | Short developer overview. |

The game state is saved in `localStorage` (`jt.game.v1`), so a game in progress survives a reload. The ☰ menu on the table has "Let a bot play my seat" (watch mode), which is handy for testing.

## Status

Done:
- All three variants play to the end against bots, with Beginner, Intermediate and Expert levels.
- Claims (chow/pung/kong/win) with priority, robbing the kong, flowers, jokers, goulash passing.
- Riichi: yaku/fu/han, dora + red fives + ura, furiten, honba, riichi sticks.
- Taiwanese: Planet-style point rows, round minimums, kitty, dealer streak.
- Hints (tiles to win, waits, suggested discard), result breakdowns, rules pages.
- Phone and desktop layouts, light/dark.

Table layout (modelled on Planet's, built 2026-10-06):
- Tiles show a big Arabic number on top, coloured by suit, plus E/S/W/N and RED/GREEN/WHITE labels on honours (`TileFace.svelte`).
- **Two layouts, switched at 1024px width** (`routes/table/+page.svelte`, `wide`):
  - Phone: opponents as thin side rails with their tiles lying sideways, plus a slim top box. Hand is 9 tiles per row, rows balanced (17 → 9 + 8).
  - Laptop: three opponent cards across the top, the whole hand in one row (tiles up to 96px), big discards, compact action button on the right.
- One shared discard area in order of play (`Discards.svelte`) with **In order / By player** and **Scroll / Fit** toggles. Riichi defaults to By player, because defence means reading each opponent's discards.
- Hand tile size and column count are calculated in code from the measured width, so a lone tile never wraps onto its own row.

Known issues and gaps:
- **Taiwanese draw rate.** With the round minimum on, about 2/3 of bot hands end drawn because most hands score below 20. Fix: add more of Planet's scoring rows (they list about 55, see `/rules/*` on their site), and/or smarter value-building bots. The minimum can be turned off on the setup page.
- **Bombay rules are approximate.** Planet doesn't publish them; the current version is a reasonable club ruleset. Confirm the real house rules before going further.
- Not implemented: Taiwanese instant settlements (chasing, dice triples, concealed-gong payments), 7/8-flower instant wins, Riichi abortive draws, a claim timer.
- The name "Jade Table" is a placeholder: `app/src/lib/brand.ts`.
- UI ideas from Planet not built yet: a manual **Draw** button (you choose between claiming and drawing), a flowers panel with all 8 slots, a "Mahjong · not yet" button, and a one-time explainer the first time each claim (sheung/pong/gong) comes up.

## Suggested next steps

1. **Online multiplayer.** Run the same engine on a Node WebSocket server. It should be server-authoritative: clients send `action`, the server broadcasts state, with sequence numbers for reconnect (see the teardown doc). Rooms with an invite code; bots fill empty seats.
2. **Accounts + saved history** (e.g. Postgres), leaderboards.
3. **Taiwanese scoring rows** (see above).
4. **Extras like Planet:** daily "score this hand" puzzle, a hand-scorer wizard, lessons.
5. Deploy: swap `adapter-auto` for the target platform's adapter (Vercel/Node/etc.).

## Ground rules

Use our own art, name and code. Don't copy Planet Mahjong's assets, text or code; we only studied how it works.
