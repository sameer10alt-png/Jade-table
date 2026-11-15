import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { botAction, reviewDiscard } from './bots';
import { applyAction, legal, newGame, pendingSeats } from './game';
import type { GameState } from './types';

// Bots use Math.random for small tie-breaks; seed it so every run plays the same game.
let seed = 1;
beforeEach(() => {
	seed = 12345;
	vi.spyOn(Math, 'random').mockImplementation(() => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed / 2147483648;
	});
});
afterEach(() => vi.restoreAllMocks());

// drive bots until seat 0 (the human) is on turn with tiles to discard
function advanceToMyDiscard(g: GameState): GameState {
	for (let i = 0; i < 400; i++) {
		if (g.turn === 0 && g.phase === 'turn' && legal(g, 0).discard?.length) return g;
		const pend = pendingSeats(g);
		const seat = pend.find((s) => s !== 0) ?? pend[0];
		if (seat === undefined) break;
		g = applyAction(g, seat, botAction(g, seat));
	}
	return g;
}

const TOP = ['amazing', 'great', 'best'];

describe('reviewDiscard', () => {
	for (const gameSeed of [42, 7, 99, 2024]) {
		it(`grades every legal discard and puts the expert's pick on top (game ${gameSeed})`, () => {
			let g = newGame({ variant: 'taiwanese', bots: ['intermediate', 'intermediate', 'intermediate'], rounds: 1, playerName: 'You', minimum: true, redFives: true, seed: gameSeed, diceSeating: false });
			g = advanceToMyDiscard(g);
			const ids = legal(g, 0).discard!;
			expect(ids.length).toBeGreaterThan(0);

			const reviews = ids.map((id) => reviewDiscard(g, 0, id)!);
			expect(reviews.every(Boolean)).toBe(true);
			for (const r of reviews) expect(['amazing', 'great', 'best', 'good', 'inaccuracy', 'mistake', 'blunder']).toContain(r.grade);

			// the expert's own choice gets a top grade (Best, or Great/Brilliant when it also plays safe)
			const top = reviews.filter((r) => TOP.includes(r.grade));
			expect(top.length).toBeGreaterThan(0);
			for (const r of top) expect(r.chosenK).toBe(r.bestK);

			// with nobody close to winning, the top pick also keeps the fastest shape
			if (!reviews[0].oppReady) {
				const minSh = Math.min(...reviews.map((r) => r.shAfter));
				for (const r of top) expect(r.shAfter).toBe(minSh);
			}
		});
	}
});
