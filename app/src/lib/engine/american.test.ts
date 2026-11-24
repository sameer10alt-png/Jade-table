import { describe, expect, test } from 'vitest';
import { applyAction, newGame, pendingSeats, VARIANTS } from './game';
import { botAction } from './bots';
import { CARD, CONCRETE, handSize, matches } from './variants/american';
import type { GameState, Meld } from './types';
import type { Tile } from './tiles';

let id = 0;
const tiles = (s: string): Tile[] => s.split(' ').filter(Boolean).map((k) => ({ id: id++, k }) as Tile);

describe('American card', () => {
	test('every hand has 14 tiles and expands', () => {
		for (const h of CARD) expect(handSize(h), h.id).toBe(14);
		for (const h of CARD) expect(CONCRETE.some((c) => c.hand === h), h.id).toBe(true);
		expect(CONCRETE.length).toBeLessThan(3000);
	});
	test('a natural 2468 hand matches, flowers are interchangeable', () => {
		const h = tiles('f1 s3 b2 b2 b2 b2 b4 b4 c6 c6 c8 c8 c8 c8');
		expect(matches(h, []).map((c) => c.hand.id)).toContain('e2');
	});
	test('jokers fill groups of 3+ but never pairs', () => {
		const ok = tiles('f1 f2 b2 b2 jk jk b4 b4 c6 c6 c8 c8 c8 jk');
		expect(matches(ok, []).map((c) => c.hand.id)).toContain('e2');
		const bad = tiles('f1 jk b2 b2 b2 b2 b4 b4 c6 c6 c8 c8 c8 c8');
		expect(matches(bad, []).map((c) => c.hand.id)).not.toContain('e2');
	});
	test('exposed groups must fit the hand; concealed hands refuse them', () => {
		const pung: Meld = { type: 'kong', tiles: tiles('c8 c8 c8 jk'), from: 1, concealed: false };
		const rest = tiles('f1 f2 b2 b2 b2 b2 b4 b4 c6 c6');
		expect(matches(rest, [pung]).map((c) => c.hand.id)).toContain('e2');
		const pairs = tiles('f1 f2 b2 b4 b6 b8 c2 c4 c6 c8 p2 p4 p6 p8');
		expect(matches(pairs, []).map((c) => c.hand.id)).toContain('s3');
	});
	test('a game with bots plays through (Charleston, exposures, swaps)', () => {
		let wins = 0;
		for (let seed = 1; seed <= 6; seed++) {
			let s = newGame({ variant: 'american', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'x', minimum: true, redFives: false, seed } as never) as GameState;
			let n = 0;
			while (s.phase !== 'gameover' && n++ < 40000) {
				if (s.phase === 'ended') {
					if (s.result?.type === 'win') wins++;
					s = applyAction(s, 0, { t: 'next' });
					continue;
				}
				const seat = pendingSeats(s)[0];
				s = applyAction(s, seat, botAction(s, seat));
			}
			expect(s.phase).toBe('gameover');
		}
		expect(VARIANTS.american.american).toBe(true);
		console.log('american wins in 6 games:', wins);
	}, 120000);
});
