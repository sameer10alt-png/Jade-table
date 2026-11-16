import { describe, expect, it } from 'vitest';
import { newGame, winContext } from './game';
import type { Tile } from './tiles';
import { mcr, scoreMCR } from './variants/mcr';

let nextId = 5000;
const tiles = (spec: string): Tile[] =>
	spec
		.trim()
		.split(/\s+/)
		.map((k) => ({ id: nextId++, k }));

function ctx(hand: string, win: string, selfDraw: boolean) {
	const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed: 5, diceSeating: false });
	s.dealer = 1;
	s.round = 0;
	s.firstGoAround = false;
	s.players.forEach((p) => {
		p.melds = [];
		p.flowers = [];
		p.discards = [];
	});
	s.wall = s.wall.slice(0, 50);
	const h = tiles(hand);
	const w = [...h].reverse().find((t) => t.k === win)!;
	return winContext(s, 0, h, w, selfDraw ? null : 2);
}
const names = (r: { lines: { name: string }[] }) => r.lines.map((l) => l.name);

describe('International (MCR) scoring', () => {
	it('full flush + pure straight', () => {
		const r = scoreMCR(ctx('b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b3 b4 b5 b5', 'b9', false));
		expect(r.valid).toBe(true);
		expect(names(r)).toContain('Full Flush');
		expect(names(r)).toContain('Pure Straight');
		expect(names(r)).not.toContain('No Honors'); // implied by Full Flush
	});

	it('rejects a hand under 8 fan', () => {
		const r = scoreMCR(ctx('b1 b2 b3 c4 c5 c6 p2 p3 p4 b7 b7 b7 ww ww', 'p4', false));
		expect(r.valid).toBe(false);
		expect(r.reason).toMatch(/8-fan minimum/);
	});

	it('seven pairs (no concealed hand / single wait on top)', () => {
		const r = scoreMCR(ctx('b1 b1 b5 b5 c2 c2 c8 c8 p3 p3 p6 p6 dr dr', 'dr', false));
		expect(r.valid).toBe(true);
		expect(names(r)).toContain('Seven Pairs');
		expect(names(r)).not.toContain('Concealed Hand');
		expect(names(r)).not.toContain('Single Wait');
	});

	it('thirteen orphans is 88', () => {
		const r = scoreMCR(ctx('b1 b9 c1 c9 p1 p9 we ws ww wn dr dg dw dw', 'dw', false));
		expect(names(r)).toContain('Thirteen Orphans');
		expect(r.total).toBeGreaterThanOrEqual(88);
	});

	it('big three dragons replaces the dragon pungs', () => {
		const r = scoreMCR(ctx('dr dr dr dg dg dg dw dw dw b1 b2 b3 c5 c5', 'b3', false));
		expect(names(r)).toContain('Big Three Dragons');
		expect(names(r).some((n) => n.startsWith('Dragon Pung'))).toBe(false);
		expect(names(r)).not.toContain('Two Dragon Pungs');
	});

	it('four concealed pungs on a self-draw', () => {
		const r = scoreMCR(ctx('b2 b2 b2 b5 b5 b5 b8 b8 b8 we we we dr dr', 'b8', true));
		expect(names(r)).toContain('Four Concealed Pungs');
		expect(names(r)).not.toContain('All Pungs');
		expect(names(r)).toContain('Half Flush');
	});

	it('pays 8 + value from the discarder and 8 from the others', () => {
		const st = mcr.settleWin(newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed: 1 }), [
			{ seat: 0, from: 2, scored: { valid: true, lines: [], total: 10, summary: '' } }
		]);
		expect(st.deltas).toEqual([34, -8, -18, -8]);
	});
});

// (MCR is kept as a scorer only; International on the site now plays classic Western rules — see western.test.ts)

describe('account-once chow combinations', () => {
	it('123 123 456 gives Pure Double Chow and Short Straight', () => {
		const r = scoreMCR(ctx('b1 b2 b3 b1 b2 b3 b4 b5 b6 dw dw dw c5 c5', 'c5', false));
		expect(names(r)).toContain('Pure Double Chow');
		expect(names(r)).toContain('Short Straight');
	});
});
