# Planet Mahjong — teardown (2026-10-05)

Reference notes for building our own mahjong game. Observed from the public site, a signed-in
session, and the shipped JS bundles. Nothing here is their code or art — only how it's put together.

## Stack

- **SvelteKit + Svelte 5** (runes-style compiled output), code-split into ~130 chunks per page.
- **No game engine.** No canvas/WebGL/Pixi/Phaser. The table is plain DOM + CSS.
- **Tiles** = `<div class="clean-tile" data-tile="circ-6">` wrapping an inline `<svg viewBox="0 0 38 50">`
  that `<image href>`s one SVG file per tile face (`/tiles-pm/circle-6.svg`, `dragon-red.svg`, …).
  Folder = swappable "tile art set" (themes / shop cosmetics).
- **Animation timings** as constants: discard 220ms, draw 220ms, claim 420ms, flower 360ms, kong 440ms.
  Uses tween/motion + `navigator.vibrate` haptics.
- **Sound**: `.wav` files listed in `/sounds/omens/manifest.json`.
- Subdomains: `play.`, `offline.`, `invest.`. Analytics: GA4, Meta Pixel, an AWS events endpoint.
- Auth: email + one-time code (no password). `/api/auth/me`.

## Realtime / multiplayer

- One WebSocket per table: `wss://<host>/ws/table/<tableId>`.
- Client → server: `join {userId, displayName, clientVersion, supportedRulesetProfileIds, lastSeq?}`,
  `action`, `ping`, `leave`, `sync`.
- Server → client: `state_sync`, `game_event`, `action_result`, `presence`, `chat_message`,
  `table_settings_changed`, `pong`, `broadcast`.
- Close reasons: `auth_expired`, `not_member`, `table_parked`, `unsupported_ruleset`, `replaced`.
- **Server-authoritative.** Every event has a sequence number; client resumes from `lastSeq` after
  reconnect. Exponential backoff with jitter, ping/pong deadline, `serverBootId` to detect deploys,
  reconnect on `visibilitychange`/`online`/`focus`.
- REST around it: `/api/table/:id/park`, `/cancel-park`, `/api/heartbeat`, friends, chat blocks, stats.
- "Parking": a table can be paused and resumed later; one active table per user.

## Game engine (inferred from bundle)

- **Phases**: `lobby → seating → wall_break_pending (dice) → deal → draw → discard → claim_window →
  winning / multi_winner → scoring → advance_round`, plus `exhaustive_draw`, `abortive_draw`.
- **Actions**: `draw`, `discard`, `claim_sheung` (chow), `claim_pong`, `claim_gong`, `claim_mahjong`,
  `pass_claim`, `declare_concealed_gong`, `add_to_pong`, `declare_mahjong` (self-draw),
  `discard_and_close_hand`, flower replacement from flower wall, `undo`/`rewind` (teaching).
  Riichi: `call_chii`, `declare_riichi`, `declare_ron`, `declare_tsumo`, `declare_kyuushu`.
- **Claim priority**: Mahjong > pong/gong > sheung (sheung only from the previous seat). Multiple
  winners on one discard allowed. Passing a claimable tile blocks it until your next draw.
- **Rulesets as profiles** (`lrc-25`, `lrc-strict`, `bombay`, riichi) with toggleable "packs";
  the UI asks the profile `canClaimMahjong / canSelfDeclareMahjong / actionMode`.
- **Bots**: tiers Beginner / Intermediate / Expert / Super. Shanten-based (standard, seven pairs,
  thirteen orphans) plus "yaku potential". Personalities as weight vectors (risk aversion, call
  aggression, value ambition, …). Always labelled "BOT PLAYING". Fill empty seats automatically.
- Watchdogs for stuck claims, `no_human_activity` auto-park, deadlines with countdowns.

## Their main variant (Indian-style Taiwanese 16-tile) — rules summary

- 144 tiles (incl. 8 flowers), wall 18×2 per side. 16 tiles in hand, win = 5 sets + pair (17).
  Dealer starts with 17 and discards first. Flowers replaced from a separate flower wall.
- Score = sum of pattern rows (some replace others) + base 5. Round minimums: East 20, South 22,
  West 24, North 26. Discard win: discarder pays. Self-draw: all three pay.
- Notable rows: concealed self-draw 10, all five suits 10, robbing the gong 10, Chicken hand 25,
  seven pairs + pong ("Nico Nico") 40, 13 orphans 90, 16 orphans 50, all step-up 20.
- Instant table settlements: chasing (4 identical discards in a row), dice triples, bouquets,
  concealed gongs. Dealer streak bonus 2n+1. Drawn hand → everyone pays 5 into a kitty.
- Full pattern list: ~55 pages under `/rules/*`; 50 worked example hands under `/hands`.

## Product surface (~246 routes)

| Area | What it is |
|---|---|
| `/play`, `/play/[variant]`, `/quickmatch`, `/table/[id]`, `/join/[token]` | Game picker, bots vs. friends vs. strangers (30s matchmaking) |
| `/rules`, `/rule-book/*`, `/tiles`, `/hands`, `/guides/*`, `/how-to-play` | SEO content, ~100 indexed pages |
| `/learn` (20 classes), `/classroom`, `/riichi/exam` | Lessons, live classes with projector view |
| `/puzzles`, `/puzzle/today` | Daily "score this hand" puzzle with par time |
| `/score`, `/ms-flower` | Hand scorer wizard + AI rules assistant |
| `/livetable` (Marshal) | Scorekeeper for physical games, join by code |
| `/leaderboard`, `/profile`, `/games`, `/wrapped/[year]` | Stats, best hands, replays, year recap |
| `/playoffline/*` | In-person events, bookings, venues, teachers, players-wanted |
| `/monsoon`, `/championship/*` | Online tournaments with brackets |
| `/shop`, `/marketplace`, `/premium` | Cosmetics, maker marketplace, subscription |
| `/admin/*` (~90 routes) | Ops: fair-play, bot tiers, events console, payments |

## What we need for an MVP

1. Shared TS rules engine (wall, deal, phases, claims, win detection, scoring) — pure functions,
   state + action → new state + events.
2. SvelteKit UI with DOM/SVG tiles (our own art), animation timings, sound.
3. Bots: shanten-based discard + simple claim policy; tiers via randomness/weights.
4. Later: WebSocket server running the same engine, seq-numbered events, reconnect, accounts.
