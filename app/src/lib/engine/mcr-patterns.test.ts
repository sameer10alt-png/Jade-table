// One test per International (MCR) scoring pattern: the pattern is found, and the
// smaller patterns it already includes are not counted again.
import { describe, expect, it } from 'vitest';
import { newGame, winContext } from './game';
import type { Tile } from './tiles';
import type { Meld } from './types';
import { mcrSpecial, scoreMCR } from './variants/mcr';
import { countsOf } from './tiles';

let nextId = 9000;
const tiles = (spec: string): Tile[] =>
	spec
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((k) => ({ id: nextId++, k }));

/** "pung b2", "kong c5 concealed", "chow c2" (c2 c3 c4) */
function meld(spec: string): Meld {
	const [type, k, flag] = spec.split(' ');
	const concealed = flag === 'concealed';
	const s = k[0];
	const n = Number(k.slice(1));
	const kinds =
		type === 'chow' ? [k, `${s}${n + 1}`, `${s}${n + 2}`] : Array(type === 'kong' ? 4 : 3).fill(k);
	return { type: type as Meld['type'], tiles: tiles(kinds.join(' ')), from: concealed ? null : 2, concealed };
}

interface Opts {
	melds?: string[];
	self?: boolean;
	flowers?: number;
	lastTile?: boolean;
	afterKong?: boolean;
	robbing?: boolean;
	seen?: string[]; // tiles lying in other players' discards
}

/** Seat 0 sits North (dealer is seat 1) in the East round. */
function score(hand: string, win: string, o: Opts = {}) {
	const s = newGame({ variant: 'international', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed: 5, diceSeating: false });
	s.dealer = 1;
	s.round = 0;
	s.firstGoAround = false;
	s.players.forEach((p) => {
		p.melds = [];
		p.flowers = [];
		p.discards = [];
	});
	s.players[0].melds = (o.melds ?? []).map(meld);
	s.players[0].flowers = tiles(['f1', 'f2', 's3', 's4'].slice(0, o.flowers ?? 0).join(' '));
	s.players[1].discards = tiles((o.seen ?? []).join(' ')).map((tile) => ({ tile }));
	s.wall = s.wall.slice(0, 50);
	const h = tiles(hand);
	const w = [...h].reverse().find((t) => t.k === win)!;
	const ctx = winContext(s, 0, h, w, o.self ? null : 2, !!o.robbing);
	if (o.lastTile) ctx.lastTile = true;
	if (o.afterKong) ctx.afterKong = true;
	const r = scoreMCR(ctx);
	return { ...r, names: r.lines.map((l) => l.name) };
}

const has = (names: string[], want: string) => names.some((n) => n === want || n.startsWith(want + ' ('));

// [pattern, hand (concealed incl. winning tile), winning tile, options, must not also score]
type Case = [string, string, string, Opts, string[]];

// A hand worth nothing on its own (used for the situational patterns): Chicken Hand.
const CHICKEN: [string, string, Opts] = ['c6 c7 c8 b5 b6 b7 ws ws', 'b7', { melds: ['chow c2', 'pung p8'] }];

const CASES: Case[] = [
	// 88
	['Big Four Winds', 'we we we ws ws ws ww ww ww wn wn wn b5 b5', 'b5', {}, ['Big Three Winds', 'All Pungs', 'Prevalent Wind', 'Seat Wind', 'Pung of Terminals or Honors', 'Little Four Winds']],
	['Big Three Dragons', 'dr dr dr dg dg dg dw dw dw b1 b2 b3 c5 c5', 'c5', {}, ['Dragon Pung', 'Two Dragon Pungs']],
	['All Green', 'b2 b3 b4 b2 b3 b4 b6 b6 b6 b8 b8 dg dg dg', 'b8', {}, ['One Voided Suit']],
	['Nine Gates', 'b1 b1 b1 b2 b3 b4 b5 b5 b6 b7 b8 b9 b9 b9', 'b5', {}, ['Full Flush', 'Concealed Hand', 'Pung of Terminals or Honors', 'No Honors']],
	['Four Kongs', 'dr dr', 'dr', { melds: ['kong b1', 'kong c2', 'kong p3 concealed', 'kong we'] }, ['Three Kongs', 'Single Wait', 'All Pungs', 'Melded Kong', 'Two Melded Kongs']],
	['Seven Shifted Pairs', 'c2 c2 c3 c3 c4 c4 c5 c5 c6 c6 c7 c7 c8 c8', 'c8', {}, ['Seven Pairs', 'Full Flush', 'Concealed Hand', 'Single Wait']],
	['Thirteen Orphans', 'b1 b9 c1 c9 p1 p9 we ws ww wn dr dg dw dw', 'dw', {}, ['All Types', 'All Terminals and Honors', 'Concealed Hand', 'Single Wait']],
	// 64
	['All Terminals', 'b1 b1 b1 b9 b9 b9 c1 c1 c1 c9 c9 c9 p1 p1', 'p1', {}, ['All Pungs', 'Outside Hand', 'All Terminals and Honors', 'Pung of Terminals or Honors', 'No Honors']],
	['Little Four Winds', 'we we we ws ws ws ww ww ww wn wn b1 b2 b3', 'b3', {}, ['Big Three Winds', 'Pung of Terminals or Honors']],
	['Little Three Dragons', 'dr dr dr dg dg dg dw dw b1 b2 b3 c4 c5 c6', 'c6', {}, ['Two Dragon Pungs', 'Dragon Pung']],
	['All Honors', 'we we we ws ws ws dr dr dr dg dg dg wn wn', 'wn', {}, ['All Terminals and Honors', 'All Pungs', 'Outside Hand']],
	['Four Concealed Pungs', 'b2 b2 b2 b5 b5 b5 b8 b8 b8 we we we dr dr', 'b8', { self: true }, ['All Pungs', 'Three Concealed Pungs', 'Two Concealed Pungs']],
	['Pure Terminal Chows', 'c1 c2 c3 c1 c2 c3 c7 c8 c9 c7 c8 c9 c5 c5', 'c5', {}, ['Full Flush', 'All Chows', 'Pure Double Chow', 'Two Terminal Chows']],
	// 48
	['Quadruple Chow', 'b2 b3 b4 b2 b3 b4 b2 b3 b4 b2 b3 b4 c9 c9', 'c9', {}, ['Pure Triple Chow', 'Pure Double Chow', 'Tile Hog']],
	['Four Pure Shifted Pungs', 'b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5 b5 c7 c7', 'c7', {}, ['Pure Shifted Pungs', 'All Pungs']],
	// 32
	['Four Pure Shifted Chows', 'b1 b2 b3 b2 b3 b4 b3 b4 b5 b4 b5 b6 c8 c8', 'c8', {}, ['Pure Shifted Chows']],
	['Three Kongs', 'b5 b6 b7 dr dr', 'b7', { melds: ['kong b1', 'kong c2', 'kong p3'] }, ['Two Melded Kongs', 'Melded Kong']],
	['All Terminals and Honors', 'b1 b1 b1 c9 c9 c9 we we we dr dr dr p1 p1', 'p1', {}, ['All Pungs', 'Outside Hand', 'Pung of Terminals or Honors']],
	// 24
	['Seven Pairs', 'b1 b1 b5 b5 c2 c2 c8 c8 p3 p3 p6 p6 dr dr', 'dr', {}, ['Concealed Hand', 'Single Wait']],
	['Greater Honors and Knitted Tiles', 'b1 b4 b7 c2 c5 c8 p3 we ws ww wn dr dg dw', 'dw', {}, ['Lesser Honors and Knitted Tiles', 'All Types', 'Concealed Hand']],
	['All Even Pungs', 'b2 b2 b2 c4 c4 c4 p6 p6 p6 b8 b8 b8 c2 c2', 'c2', {}, ['All Pungs', 'All Simples']],
	['Full Flush', 'b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b3 b4 b5 b5', 'b9', {}, ['No Honors', 'One Voided Suit']],
	['Pure Triple Chow', 'b2 b3 b4 b2 b3 b4 c5 c6 c7 dr dr', 'dr', { melds: ['chow b2'] }, ['Pure Double Chow']],
	['Pure Shifted Pungs', 'b2 b2 b2 b3 b3 b3 b4 b4 b4 c7 c8 c9 dr dr', 'dr', {}, []],
	['Upper Tiles', 'b7 b8 b9 c7 c8 c9 p7 p8 p9 b8 b8 b8 c9 c9', 'c9', {}, ['Upper Four', 'No Honors']],
	['Middle Tiles', 'b4 b5 b6 c4 c5 c6 p4 p5 p6 b5 b5 b5 c6 c6', 'c6', {}, ['All Simples', 'No Honors']],
	['Lower Tiles', 'b1 b2 b3 c1 c2 c3 p1 p2 p3 b2 b2 b2 c3 c3', 'c3', {}, ['Lower Four', 'No Honors']],
	// 16
	['Pure Straight', 'b1 b2 b3 b4 b5 b6 b7 b8 b9 c5 c5 c5 dr dr', 'dr', {}, []],
	['Three-Suited Terminal Chows', 'b1 b2 b3 b7 b8 b9 c1 c2 c3 c7 c8 c9 p5 p5', 'p5', {}, ['All Chows', 'Two Terminal Chows', 'Mixed Double Chow', 'No Honors']],
	['Pure Shifted Chows', 'b1 b2 b3 b2 b3 b4 b3 b4 b5 c7 c7 c7 dr dr', 'dr', {}, []],
	['All Fives', 'b3 b4 b5 c5 c6 c7 p4 p5 p6 b5 b5 b5 c5 c5', 'c5', {}, ['All Simples']],
	['Triple Pung', 'b3 b3 b3 c3 c3 c3 p3 p3 p3 b7 b8 b9 dr dr', 'dr', {}, ['Double Pung']],
	['Three Concealed Pungs', 'b3 b3 b3 c3 c3 c3 p3 p3 p3 b7 b8 b9 dr dr', 'dr', {}, ['Two Concealed Pungs']],
	// 12
	['Lesser Honors and Knitted Tiles', 'b1 b4 b7 c2 c5 c8 p3 p6 p9 we ws ww dr dg', 'dg', {}, ['All Types', 'Concealed Hand']],
	['Knitted Straight', 'b1 b4 b7 c2 c5 c8 p3 p6 p9 dr dr dr we we', 'we', {}, []],
	['Upper Four', 'b6 b7 b8 c6 c7 c8 p7 p8 p9 b9 b9 b9 c6 c6', 'c6', {}, ['No Honors']],
	['Lower Four', 'b2 b3 b4 c1 c2 c3 p2 p3 p4 b1 b1 b1 c4 c4', 'c4', {}, ['No Honors']],
	['Big Three Winds', 'we we we ws ws ws ww ww ww b1 b2 b3 c5 c5', 'c5', {}, ['Pung of Terminals or Honors']],
	// 8
	['Mixed Straight', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 dr dr', 'dr', {}, []],
	['Reversible Tiles', 'p1 p2 p3 p3 p4 p5 b4 b5 b6 b8 b8 b8 dw dw', 'dw', {}, ['One Voided Suit']],
	['Mixed Triple Chow', 'b3 b4 b5 c3 c4 c5 p3 p4 p5 dr dr dr we we', 'we', {}, ['Mixed Double Chow']],
	['Mixed Shifted Pungs', 'b3 b3 b3 c4 c4 c4 p5 p5 p5 b7 b8 b9 dr dr', 'dr', {}, []],
	['Chicken Hand', CHICKEN[0], CHICKEN[1], CHICKEN[2], []],
	['Last Tile Draw', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], self: true, lastTile: true }, ['Self-Drawn']],
	['Last Tile Claim', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], lastTile: true }, []],
	['Out with Replacement Tile', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], self: true, afterKong: true }, ['Self-Drawn']],
	['Robbing the Kong', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], robbing: true }, []],
	['Two Concealed Kongs', 'b1 b2 b3 b5 b6 b7 dr dr', 'dr', { melds: ['kong p3 concealed', 'kong c4 concealed'] }, ['Concealed Kong', 'Two Concealed Pungs']],
	// 6
	['All Pungs', 'p7 p7 p7 b9 b9 b9 wn wn', 'wn', { melds: ['pung b2', 'pung c5'] }, []],
	['Half Flush', 'b1 b2 b3 b4 b5 b6 b7 b7 b7 dr dr dr we we', 'we', {}, []],
	['Mixed Shifted Chows', 'b1 b2 b3 c2 c3 c4 p3 p4 p5 dr dr dr we we', 'we', {}, []],
	['All Types', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 we we we dr dr', 'dr', {}, []],
	['Melded Hand', 'dw dw', 'dw', { melds: ['chow b1', 'chow c4', 'pung p7', 'pung we'] }, ['Single Wait']],
	['Two Dragon Pungs', 'dr dr dr dg dg dg b1 b2 b3 c4 c5 c6 we we', 'we', {}, ['Dragon Pung']],
	// 4
	['Outside Hand', 'b1 b2 b3 c7 c8 c9 p1 p1 p1 dr dr dr we we', 'we', {}, []],
	['Fully Concealed Hand', 'b1 b2 b3 c7 c8 c9 p1 p1 p1 dr dr dr we we', 'b3', { self: true }, ['Self-Drawn', 'Concealed Hand']],
	['Two Melded Kongs', 'p1 p2 p3 p6 p7 p8 dr dr', 'dr', { melds: ['kong b2', 'kong c5'] }, ['Melded Kong']],
	['Last Tile', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], seen: ['b7', 'b7', 'b7'] }, []],
	// 2
	['Dragon Pung', 'dr dr dr b1 b2 b3 c4 c5 c6 p7 p8 p9 we we', 'we', {}, []],
	['Prevalent Wind', 'we we we b1 b2 b3 c4 c5 c6 p7 p8 p9 dr dr', 'dr', {}, ['Pung of Terminals or Honors']],
	['Seat Wind', 'wn wn wn b1 b2 b3 c4 c5 c6 p7 p8 p9 dr dr', 'dr', {}, ['Pung of Terminals or Honors']],
	['Concealed Hand', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 dr dr', 'dr', {}, []],
	['All Chows', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b4 b5 b6 c2 c2', 'b6', {}, ['No Honors']],
	['Tile Hog', 'b2 b3 b4 b4 b5 b6 b4 b4 c1 c2 c3 p7 p8 p9', 'p9', {}, []],
	['Double Pung', 'b5 b5 b5 c5 c5 c5 p1 p2 p3 b7 b8 b9 dr dr', 'dr', {}, []],
	['Two Concealed Pungs', 'b5 b5 b5 c5 c5 c5 p1 p2 p3 b7 b8 b9 dr dr', 'dr', {}, []],
	['Concealed Kong', 'b1 b2 b3 b5 b6 b7 p7 p8 p9 dr dr', 'dr', { melds: ['kong c4 concealed'] }, []],
	['All Simples', 'b2 b3 b4 c4 c5 c6 p6 p7 p8 b5 b5 b5 c8 c8', 'c8', {}, ['No Honors']],
	// 1
	['Pure Double Chow', 'b2 b3 b4 b2 b3 b4 c6 c7 c8 dr dr dr we we', 'we', {}, []],
	['Mixed Double Chow', 'b2 b3 b4 c2 c3 c4 p6 p7 p8 dr dr dr we we', 'we', {}, []],
	['Short Straight', 'b2 b3 b4 b5 b6 b7 c6 c7 c8 dr dr dr we we', 'we', {}, []],
	['Two Terminal Chows', 'b1 b2 b3 b7 b8 b9 c5 c6 c7 dr dr dr we we', 'we', {}, []],
	['Pung of Terminals or Honors', 'b9 b9 b9 b1 b2 b3 c4 c5 c6 p7 p8 p9 dr dr', 'dr', {}, []],
	['Melded Kong', 'b1 b2 b3 c4 c5 c6 b7 b8 b9 dr dr', 'dr', { melds: ['kong p7'] }, []],
	['One Voided Suit', 'b1 b2 b3 c4 c5 c6 b7 b8 b9 c5 c5 c5 dr dr', 'dr', {}, []],
	['No Honors', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 c9 c9', 'c9', {}, []],
	['Edge Wait', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 dr dr', 'p7', {}, []],
	['Closed Wait', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 dr dr', 'p8', {}, []],
	['Single Wait', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 b5 b5 b5 dr dr', 'dr', {}, []],
	['Self-Drawn', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], self: true }, []],
	['Flower tiles ×2', CHICKEN[0], CHICKEN[1], { ...CHICKEN[2], flowers: 2 }, []]
];

describe('every International scoring pattern', () => {
	for (const [pattern, hand, win, opts, notAlso] of CASES) {
		it(pattern, () => {
			const r = score(hand, win, opts);
			expect(has(r.names, pattern), `${pattern} missing from: ${r.names.join(', ')}`).toBe(true);
			for (const n of notAlso) expect(has(r.names, n), `${n} should be excluded by ${pattern}: ${r.names.join(', ')}`).toBe(false);
		});
	}

	it('the chicken hand is exactly 8 and valid', () => {
		const r = score(CHICKEN[0], CHICKEN[1], CHICKEN[2]);
		expect(r.names).toEqual(['Chicken Hand']);
		expect(r.valid).toBe(true);
		expect(r.total).toBe(8);
	});

	it('flowers do not count toward the 8 minimum', () => {
		const r = score('b1 b2 b3 c4 c5 c6 p2 p3 p4 b7 b7 b7 ww ww', 'p4', { flowers: 4 });
		expect(r.valid).toBe(false);
	});

	it('the game recognises the special hands as wins', () => {
		const c = (h: string) => countsOf(tiles(h).map((t) => t.k));
		expect(mcrSpecial(c('b1 b4 b7 c2 c5 c8 p3 we ws ww wn dr dg dw'), 0, 0)).toBe('knitted');
		expect(mcrSpecial(c('b1 b4 b7 c2 c5 c8 p3 p6 p9 dr dr dr we we'), 0, 0)).toBe('knitted-straight');
		expect(mcrSpecial(c('b1 b9 c1 c9 p1 p9 we ws ww wn dr dg dw dw'), 0, 0)).toBe('orphans');
		expect(mcrSpecial(c('b1 b1 b5 b5 c2 c2 c8 c8 p3 p3 p6 p6 dr dr'), 0, 0)).toBe('pairs');
		expect(mcrSpecial(c('b1 b4 b7 c2 c5 c8 p3 p6 b9 dr dr dr we we'), 0, 0)).toBe(null);
	});
});

describe('rulebook checks (MCR 2006)', () => {
	it('All Green combines with Half Flush', () => {
		const r = score('b2 b3 b4 b2 b3 b4 b6 b6 b6 b8 b8 dg dg dg', 'b8');
		expect(has(r.names, 'All Green')).toBe(true);
		expect(has(r.names, 'Half Flush')).toBe(true);
	});
	it('All Terminals still scores Double Pung', () => {
		const r = score('b1 b1 b1 b9 b9 b9 c1 c1 c1 c9 c9 c9 p1 p1', 'p1');
		expect(has(r.names, 'Double Pung')).toBe(true);
	});
	it('one melded kong and one concealed kong are 6 points', () => {
		const r = score('b1 b2 b3 b5 b6 b7 dr dr', 'dr', { melds: ['kong p3 concealed', 'kong c4'] });
		const k = r.lines.find((l) => l.name.startsWith('Melded Kong + Concealed Kong'));
		expect(k?.value).toBe(6);
		expect(has(r.names, 'Concealed Kong')).toBe(false);
		expect(has(r.names, 'Melded Kong')).toBe(false);
	});
	it('Last Tile counts your own exposed pung as visible', () => {
		const r = score('b5 b6 b7 c4 c5 c6 dr dr', 'b7', { melds: ['pung b7', 'chow p1'], seen: [] });
		expect(has(r.names, 'Last Tile')).toBe(true);
	});
});
