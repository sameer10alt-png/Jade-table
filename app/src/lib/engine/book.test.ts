import { describe, expect, it } from 'vitest';
import { botAction } from './bots';
import { applyAction, newGame, pendingSeats, VARIANTS, winContext } from './game';
import type { Tile } from './tiles';
import type { GameState, Meld } from './types';
import { book, BOOK_HANDS, bookDistance, fishingValue, scoreBook } from './variants/book';

let nextId = 9000;
const tiles = (spec: string): Tile[] => spec.trim().split(/\s+/).filter(Boolean).map((k) => ({ id: nextId++, k }));
// b = bamboo, c = characters, p = circles; we ws ww wn; dr dg dw
function ctx(hand: string, win: string, selfDraw: boolean, opts: { melds?: Meld[]; dealer?: number } = {}) {
	const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: false, redFives: false, seed: 3, diceSeating: false });
	s.dealer = opts.dealer ?? 0; // seat 0 is East
	s.round = 0;
	s.firstGoAround = false;
	s.players.forEach((p) => ((p.melds = []), (p.flowers = []), (p.discards = [])));
	s.players[0].melds = opts.melds ?? [];
	s.wall = s.wall.slice(0, 50);
	const h = tiles(hand);
	const w = [...h].reverse().find((t) => t.k === win)!;
	return winContext(s, 0, h, w, selfDraw ? null : 2);
}
const pung = (k: string, concealed = false): Meld => ({ type: 'pung', tiles: tiles(`${k} ${k} ${k}`), from: concealed ? null : 2, concealed } as Meld);
const name = (r: { lines: { name: string }[]; valid: boolean }) => (r.valid ? r.lines[0].name : 'invalid');

describe('International = the book (Thompson & Maloney) hands', () => {
	it('is the International variant, and the hand table builds', () => {
		expect(VARIANTS.international).toBe(book);
		expect(BOOK_HANDS.length).toBeGreaterThan(80);
	});

	it.each([
		['Wriggly Snake', 'c1 c2 c3 c4 c5 c6 c7 c8 c9 we ws ww wn wn', 'wn', 1000],
		['Run, Pung & Pair', 'b1 b2 b3 b4 b5 b6 b7 b8 b9 b5 b5 b5 b2 b2', 'b2', 1000],
		['Gates of Heaven', 'p1 p1 p1 p2 p3 p4 p5 p6 p7 p8 p9 p9 p9 p5', 'p5', 1000],
		['Confused Gates', 'b2 b3 b4 b5 b6 b7 b8 b5 c1 c1 c1 p9 p9 p9', 'p9', 1000],
		['Greta’s Garden', 'c1 c2 c3 c4 c5 c6 c7 we ws ww wn dr dg dw', 'dw', 1000],
		['Gertie’s Garter', 'b1 b2 b3 b4 b5 b6 b7 p1 p2 p3 p4 p5 p6 p7', 'p7', 1000],
		['Yin Yang', 'c1 c1 c2 c3 c4 c5 c5 b5 b5 b6 b7 b8 b9 b9', 'b9', 1000],
		['Hachi Ban', 'b1 b2 b3 b4 b5 b6 b7 b8 dg dg dr dr dw dw', 'dw', 1000],
		['Five Odd Honours', 'p1 p2 p3 p4 p5 p6 p7 p8 p9 we ws dr dg dw', 'dw', 500],
		['Moon at Bottom of Well', 'p1 p2 p3 p4 p5 p6 p7 p8 p9 p1 p2 p3 p4 p4', 'p4', 1000],
		['Three Philosophers', 'c2 c3 c4 p6 p7 p8 b5 b6 b7 b4 p5 c6 b2 b2', 'b2', 1000],
		['Windy Chow', 'b3 b4 b5 c6 c7 c8 p1 p2 p3 we ws ww wn ww', 'ww', 500],
		['Chop Suey', 'b1 b2 b3 c1 c2 c3 p1 p2 p3 we ws ww wn we', 'we', 1000],
		['Knitting', 'b1 c1 b2 c2 b3 c3 b5 c5 b6 c6 b8 c8 b9 c9', 'c9', 500],
		['Heavenly Twins', 'p1 p1 p2 p2 p4 p4 p5 p5 p7 p7 p8 p8 p9 p9', 'p9', 1000],
		['All Pair Honours', 'we we ws ws dr dr dg dg b1 b1 c9 c9 p9 p9', 'p9', 1000],
		['Sparrow’s Sanctuary', 'b1 b1 b1 b1 b2 b2 b3 b3 b4 b4 b6 b6 b8 b8', 'b8', 1500],
		['Windfall', 'we ws ww wn c1 c1 c3 c3 c5 c5 c7 c7 c9 c9', 'c9', 1000],
		['Windy Ones', 'we ws ww wn wn b1 b1 b1 c1 c1 c1 p1 p1 p1', 'p1', 1000],
		['Up You Go', 'we ws ww wn b2 b4 b4 b6 b6 b6 b8 b8 b8 b8', 'b8', 2000],
		['Four Blessings', 'we we we ws ws ws ww ww ww wn wn wn c5 c5', 'c5', 1500],
		['Green Jade', 'dg dg dg b2 b2 b2 b5 b5 b5 b9 b9 b9 b7 b7', 'b7', 1000],
		['Imperial Jade', 'dg dg dg b2 b2 b2 b4 b4 b4 b6 b6 b6 b8 b8', 'b8', 2000],
		['Royal Ruby', 'dr dr dr b1 b1 b1 b5 b5 b5 b7 b7 b7 b9 b9', 'b9', 2000],
		['Three Great Scholars', 'dr dr dr dg dg dg dw dw dw c4 c5 c6 c2 c2', 'c2', 1500],
		['Unique Wonder', 'we ws ww wn dr dg dw b1 b9 c1 c9 p1 p9 p9', 'p9', 2000],
		['Heads and Tails', 'b1 b1 b1 c9 c9 c9 p1 p1 p1 p9 p9 p9 b9 b9', 'b9', 1000],
		['Numbers in Parallel', 'dg dg dg dr dr p8 p8 p8 c8 c8 c8 b8 b8 b8', 'b8', 1500],
		['Odds & Evens', 'b1 b3 b5 b7 b9 c1 c3 c5 c7 c9 p2 p4 p6 p8', 'p8', 1500],
		['Chinese Odds', 'c1 c1 c1 c3 c3 c3 c5 c5 c5 c7 c7 c7 c9 c9', 'c9', 1500]
	])('%s', (expected, hand, win, value) => {
		const r = scoreBook(ctx(hand, win, false));
		expect(name(r)).toBe(expected);
		expect(r.total).toBe(value);
	});

	it('Red Lantern needs your own wind (seat 0 is East)', () => {
		expect(name(scoreBook(ctx('c1 c2 c3 c4 c5 c6 c7 c3 dr dr dr we we we', 'we', false)))).toBe('Red Lantern');
		expect(scoreBook(ctx('c1 c2 c3 c4 c5 c6 c7 c3 dr dr dr ws ws ws', 'ws', false)).valid).toBe(false);
	});

	it('Big Robert is half limit, limit when the numbers match', () => {
		expect(scoreBook(ctx('b1 b2 b3 b4 c3 c4 c5 c6 p5 p6 p7 p8 dr dr', 'dr', false)).total).toBe(500);
		expect(scoreBook(ctx('b2 b3 b4 b5 c2 c3 c4 c5 p2 p3 p4 p5 dr dr', 'dr', false)).total).toBe(1000);
	});

	it('exposure rules: concealed hands can’t have shown pungs; half hands score half', () => {
		// Sunrise (exposed half): EEE shown
		const half = scoreBook(ctx('dw dw b5 b5 b5 p2 p2 p2 c4 c4 c4', 'c4', false, { melds: [pung('we')] }));
		expect(name(half)).toBe('Sunrise');
		expect(half.total).toBe(500);
		// Green Jade (exposed OK): full value
		expect(scoreBook(ctx('b2 b2 b2 b5 b5 b5 b9 b9 b9 b7 b7', 'b7', false, { melds: [pung('dg')] })).total).toBe(1000);
		// Guardian Winds is concealed only: a shown pung makes it invalid
		expect(scoreBook(ctx('c1 c2 c3 c4 c5 c6 c7 c8 c9 ws ws', 'ws', false, { melds: [pung('we')] })).valid).toBe(false);
	});

	it('Chow Chow and Seven Twins need every tile from the wall', () => {
		expect(name(scoreBook(ctx('c2 c3 c4 c3 c4 c5 c7 c8 c9 c4 c5 c6 c1 c1', 'c1', true)))).toBe('Chow Chow');
		expect(scoreBook(ctx('c2 c3 c4 c3 c4 c5 c7 c8 c9 c4 c5 c6 c1 c1', 'c1', false)).valid).toBe(false);
	});

	it('Ordinary Mah Jong and Purity are scored by points, one suit only', () => {
		const o = scoreBook(ctx('c2 c2 c2 c5 c5 c5 c7 c8 c9 dr dr dr c4 c4', 'c4', false));
		expect(o.valid).toBe(true);
		expect(o.summary).toContain('Ordinary Mah Jong');
		expect(o.total).toBeLessThanOrEqual(1000);
		const p = scoreBook(ctx('b2 b2 b2 b5 b5 b5 b7 b8 b9 b3 b3 b3 b4 b4', 'b4', false));
		expect(p.summary).toContain('Purity');
		// mixed suits are no hand at all
		expect(scoreBook(ctx('c2 c2 c2 b5 b5 b5 p7 p8 p9 dr dr dr c4 c4', 'c4', false)).valid).toBe(false);
	});

	it('distance and fishing', () => {
		const ready = tiles('c1 c2 c3 c4 c5 c6 c7 c8 c9 we ws ww wn');
		expect(bookDistance(ready, [], 0).missing).toBe(1);
		expect(fishingValue(ready, [], 0)?.value).toBe(400);
		const far = tiles('c1 b5 p9 we dr c7 b2 p4 ws dg c9 b8 p6');
		expect(bookDistance(far, [], 0).missing).toBeGreaterThan(3);
	});

	it('payments: everyone pays the winner', () => {
		const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: false, redFives: false, seed: 1 });
		const st = book.settleWin(s, [{ seat: 2, from: 1, scored: { valid: true, lines: [], total: 1000, summary: '' } }]);
		expect(st.deltas).toEqual([-1000, -1000, 3000, -1000]);
	});
});

describe('International (book) bot games', () => {
	it('bots play full games and win book hands', () => {
		let wins = 0, hands = 0, draws = 0;
		const names = new Map<string, number>();
		const t0 = Date.now();
		for (let seed = 1; seed <= 6; seed++) {
			let s: GameState = newGame({ variant: 'international', bots: ['expert', 'intermediate', 'expert'], rounds: 1, playerName: 'T', minimum: false, redFives: false, seed });
			s.players[0].bot = 'expert';
			let steps = 0;
			while (s.phase !== 'gameover') {
				if (++steps > 40000) throw new Error(`stuck seed ${seed} phase ${s.phase}`);
				if (s.phase === 'ended') {
					hands++;
					if (s.result!.type === 'win') {
						wins++;
						const n = s.result!.wins[0].summary.split(' · ')[0];
						names.set(n, (names.get(n) ?? 0) + 1);
					} else draws++;
					expect(s.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
					s = applyAction(s, 0, { t: 'next' });
					continue;
				}
				for (const seat of pendingSeats(s)) if (pendingSeats(s).includes(seat)) s = applyAction(s, seat, botAction(s, seat));
			}
		}
		console.log('book games', { hands, wins, draws, ms: Date.now() - t0, hands_won: Object.fromEntries(names) });
		expect(wins).toBeGreaterThan(0);
	}, 300000);
});
