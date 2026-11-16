import { describe, expect, it } from 'vitest';
import { newGame, winContext } from './game';
import type { Tile } from './tiles';
import type { Meld } from './types';
import { scoreWestern, western } from './variants/western';

let nextId = 7000;
const tiles = (spec: string): Tile[] =>
	spec
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((k) => ({ id: nextId++, k }));

/** seat 0 is North (dealer is seat 1), prevalent wind East */
function ctx(hand: string, win: string, selfDraw: boolean, opts: { melds?: Meld[]; flowers?: string; dealer?: number } = {}) {
	const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: false, redFives: false, seed: 5, diceSeating: false });
	s.dealer = opts.dealer ?? 1;
	s.round = 0;
	s.firstGoAround = false;
	s.players.forEach((p) => {
		p.melds = [];
		p.flowers = [];
		p.discards = [];
	});
	s.players[0].melds = opts.melds ?? [];
	s.players[0].flowers = tiles(opts.flowers ?? '');
	s.wall = s.wall.slice(0, 50);
	const h = tiles(hand);
	const w = [...h].reverse().find((t) => t.k === win)!;
	return winContext(s, 0, h, w, selfDraw ? null : 2);
}
const exposed = (type: 'pung' | 'chow' | 'kong', spec: string): Meld => ({ type, tiles: tiles(spec), from: 2, concealed: false } as Meld);
const names = (r: { lines: { name: string }[] }) => r.lines.map((l) => l.name);

describe('Classic Western scorer (used for the book’s calculated hands)', () => {
	it('all chows, plain pair, won on a discard: 20 points × concealed × no score = 80', () => {
		// 123c 456c 789p 234b + 55p, waiting two-sided on 7p/… (not the only tile)
		const r = scoreWestern(ctx('c1 c2 c3 c4 c5 c6 p7 p8 p9 b2 b3 b4 p5 p5', 'b4', false));
		expect(r.valid).toBe(true);
		expect(names(r)).toContain('Mahjong');
		expect(names(r)).toContain('Concealed hand');
		expect(names(r)).toContain('No score but Mahjong');
		expect(r.total).toBe(80); // 20 × 2 × 2
	});

	it('concealed pung of simples is 4, exposed 2; dragon pung adds a double', () => {
		const r = scoreWestern(
			ctx('c2 c2 c2 p4 p5 p6 b7 b8 b9 p1 p1', 'p1', false, { melds: [exposed('pung', 'dr dr dr')] })
		);
		// points: 20 + concealed simple pung 4 + exposed honour pung 4 + only-possible-tile (pair wait) 2 = 30
		// doubles: red dragon 1 → 60
		expect(names(r)).toContain('Concealed pung');
		expect(names(r)).toContain('Exposed pung of terminals/honours');
		expect(names(r)).toContain('Red dragon pung');
		expect(names(r)).not.toContain('Concealed hand');
		expect(names(r)).toContain('Winning on the only possible tile');
		expect(r.total).toBe(60);
	});

	it('kong is 4× a pung; concealed kong of honours is 32', () => {
		const ck: Meld = { type: 'kong', tiles: tiles('ww ww ww ww'), from: null, concealed: true } as Meld;
		const r = scoreWestern(ctx('c1 c2 c3 p4 p5 p6 b7 b8 b9 p2 p2', 'p2', true, { melds: [ck] }));
		expect(r.lines.find((l) => l.name === 'Concealed kong of terminals/honours')?.value).toBe(32);
	});

	it('flowers: 4 points each, own flower a double, all four a triple double', () => {
		// seat 0 is North = flower/season 4
		const own = scoreWestern(ctx('c1 c2 c3 c4 c5 c6 p7 p8 p9 b2 b3 b4 p5 p5', 'b4', false, { flowers: 'f4 s1' }));
		expect(names(own)).toContain('Own flower');
		expect(names(own)).not.toContain('Own season');
		expect(own.lines.filter((l) => l.name === 'Flower' || l.name === 'Season').length).toBe(2);
		const all = scoreWestern(ctx('c1 c2 c3 c4 c5 c6 p7 p8 p9 b2 b3 b4 p5 p5', 'b4', false, { flowers: 'f1 f2 f3 f4' }));
		expect(all.lines.find((l) => l.name === 'All four flowers')?.value).toBe('3 doubles');
	});

	it('full flush is 3 doubles, half flush 1', () => {
		const full = scoreWestern(ctx('b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b3 b4 b5 b5', 'b9', false));
		expect(full.lines.find((l) => l.name.startsWith('Full flush'))?.value).toBe('3 doubles');
		const half = scoreWestern(ctx('b1 b2 b3 b4 b5 b6 b7 b8 b9 dg dg dg we we', 'b9', false));
		expect(names(half)).toContain('Half flush (one suit + honours)');
	});

	it('seat wind and prevalent wind pungs each double', () => {
		// seat 0 is North; prevalent is East
		const r = scoreWestern(ctx('wn wn wn we we we c1 c2 c3 p4 p5 p6 b9 b9', 'b9', false));
		expect(names(r)).toContain('Seat wind pung (North)');
		expect(names(r)).toContain('Prevalent wind pung (East)');
	});

	it('limit hands score 1,000', () => {
		expect(scoreWestern(ctx('c1 c9 p1 p9 b1 b9 we ws ww wn dr dg dw dw', 'dw', false)).total).toBe(1000);
		const bigDragons = scoreWestern(ctx('dr dr dr dg dg dg dw dw dw c1 c2 c3 p5 p5', 'p5', false));
		expect(names(bigDragons)).toEqual(['Big three dragons']);
		expect(bigDragons.total).toBe(1000);
		expect(names(scoreWestern(ctx('c1 c1 c1 c2 c3 c4 c5 c6 c7 c8 c9 c9 c9 c5', 'c5', true)))).toEqual(['Nine gates']);
		expect(names(scoreWestern(ctx('we we we ws ws ws ww ww ww wn wn c5 c5 c5', 'c5', false)))).toEqual(['Little four winds']);
		expect(scoreWestern(ctx('dr dr dr dg dg dg we we we wn wn wn ws ws', 'ws', false)).total).toBe(1000);
	});

	it('a score never passes the limit', () => {
		const r = scoreWestern(ctx('dr dr dr dg dg dg c1 c1 c1 c9 c9 c9 dw dw', 'dw', true, { flowers: 'f4 s4' }));
		expect(r.total).toBeLessThanOrEqual(1000);
	});

	it('payments: everyone pays the winner; East pays and collects double', () => {
		const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: false, redFives: false, seed: 1 });
		s.dealer = 1;
		const scored = { valid: true, lines: [], total: 100, summary: '' };
		const nonEast = western.settleWin(s, [{ seat: 0, from: 2, scored }]);
		expect(nonEast.deltas).toEqual([400, -200, -100, -100]);
		const eastWins = western.settleWin(s, [{ seat: 1, from: null, scored }]);
		expect(eastWins.deltas).toEqual([-200, 600, -200, -200]);
	});
});
