# Jade Table

A browser mahjong game with three variants: Taiwanese 16-tile, Riichi, and Bombay Traditional. You play against three bots. Built with SvelteKit 3 and Svelte 5.

The name is a placeholder. Change it in `src/lib/brand.ts`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm test         # engine unit tests + full bot-vs-bot games for every variant
npm run check    # type check
```

## Layout

| Path | What |
|---|---|
| `src/lib/engine/tiles.ts` | Tile kinds, wall building, seeded shuffle |
| `src/lib/engine/analysis.ts` | Hand decomposition (with jokers) and fast shanten |
| `src/lib/engine/hand.ts` | Readings of a winning hand, waits, wait types |
| `src/lib/engine/game.ts` | The game state machine: deal, draw, discard, claim window, kongs, robbing the kong, wins, drawn hands, goulash passing, next hand |
| `src/lib/engine/variants/*.ts` | One file per ruleset: scoring and settlement |
| `src/lib/engine/bots.ts` | Bots: shanten + useful-tile counting, value bias, defence, claim policy |
| `src/lib/components/` | Tile art (SVG, original), seats, discard piles, melds |
| `src/routes/` | Home, setup (`/play/[variant]`), table (`/table`), rules (`/rules/[variant]`) |

The engine is pure TypeScript: `applyAction(state, seat, action)` returns a new state. The same engine can later run on a WebSocket server for online play: clients send actions and the server broadcasts state.

## Notes on rules

- **Riichi** follows the standard competition yaku and fu, with red fives, furiten, ura dora, honba and riichi deposits. Multiple ron is resolved by head bump.
- **Taiwanese** follows the Planet-style ruleset we studied: 16 tiles, flowers, round minimums of 20/22/24/26, and a kitty for drawn hands. Some point values are our own where the source did not publish them; see the scoring table at `/rules/taiwanese`.
- **Bombay Traditional** has 8 jokers (pungs and kongs only), flowers, and doubles scoring with a 1,000 limit. A drawn hand leads to a Goulash round with three tile passes. Club rules vary, so treat it as a starting point.
