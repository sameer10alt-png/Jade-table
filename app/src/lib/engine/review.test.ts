import { describe, expect, it } from 'vitest';
import { botAction, reviewDiscard } from './bots';
import { applyAction, legal, newGame, pendingSeats } from './game';
import type { GameState } from './types';

// drive bots until seat 0 (the human) is on turn with tiles to discard
function advanceToMyDiscard(g: GameState): GameState {
	for (let i = 0; i < 400; i++) {
		if (g.turn === 0 && g.phase === 'turn' && legal(g, 0).discard?.length) return g;
		const pend = pendingSeats(g);
		const seat = pend.find((s) => s !== 0) ?? pend[0];
		if (seat === undefined) break;
		if (seat === 0) {
			// auto-play me via bot until a discard decision exists
			if (g.phase === 'turn' && legal(g, 0).discard?.length) return g;
		}
		g = applyAction(g, seat, botAction(g, seat));
	}
	return g;
}

describe('reviewDiscard', () => {
	it('grades the human discard and ranks best vs worst', () => {
		let g = newGame({ variant: 'taiwanese', bots: ['intermediate','intermediate','intermediate'], rounds: 1, playerName: 'You', minimum: true, redFives: true, seed: 42, diceSeating: false } as any);
		g = advanceToMyDiscard(g);
		const ids = legal(g, 0).discard!;
		expect(ids.length).toBeGreaterThan(0);

		// review every legal discard; all return a grade
		const reviews = ids.map((id) => reviewDiscard(g, 0, id)).filter(Boolean);
		expect(reviews.length).toBe(ids.length);
		for (const r of reviews) expect(['amazing','great','best','good','inaccuracy','mistake','blunder']).toContain(r!.grade);

		// at least one legal discard is graded 'best'
		expect(reviews.some((r) => r!.grade === 'best')).toBe(true);
		// the best discard's shanten is <= any other discard's shanten
		const minSh = Math.min(...reviews.map((r) => r!.shAfter));
		const bestReview = reviews.find((r) => r!.grade === 'best')!;
		expect(bestReview.shAfter).toBe(minSh);
	});
});
