import { describe, expect, test } from 'vitest';
import { applyAction, legal, newGame, pendingSeats } from './game';
import { botAction } from './bots';
import type { GameState } from './types';

const start = (variant = 'taiwanese', seed = 7) => {
	let s = newGame({ variant, bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'x', minimum: true, redFives: false, seed, charleston: true } as never) as GameState;
	while (s.phase === 'seating' || s.phase === 'wallbreak') s = applyAction(s, pendingSeats(s)[0], { t: 'roll' });
	return s;
};
const sizes = (s: GameState) => s.players.map((p) => p.hand.length + p.melds.length * 3);

describe('Charleston', () => {
	test('right, across, left, vote, second Charleston, courtesy', () => {
		let s = start();
		expect(s.phase).toBe('passing');
		expect(s.passing?.kind).toBe('charleston');
		const before = sizes(s);
		const seen: string[] = [];
		let steps = 0;
		while (s.phase === 'passing' && steps++ < 100) {
			seen.push(s.passing!.stage!);
			const seat = pendingSeats(s)[0];
			s = applyAction(s, seat, botAction(s, seat));
		}
		expect(s.phase).toBe('turn');
		expect(s.turn).toBe(s.dealer);
		expect(sizes(s)).toEqual(before);
		expect(seen).toContain('vote');
		expect(seen).toContain('courtesy');
	});
	test('one "no" vote skips to the courtesy pass, and 0 tiles is allowed', () => {
		let s = start('international', 11);
		for (let i = 0; i < 12; i++) {
			const seat = pendingSeats(s)[0];
			s = applyAction(s, seat, botAction(s, seat));
		}
		expect(s.passing?.stage).toBe('vote');
		expect(legal(s, 0).vote).toBe(true);
		s = applyAction(s, 0, { t: 'charlestonVote', yes: false });
		expect(s.passing?.stage).toBe('courtesy');
		expect(legal(s, 0).courtesy).toBe(true);
		const hand0 = s.players[0].hand.map((t) => t.id).sort();
		s = applyAction(s, 0, { t: 'pass3', tiles: [] });
		for (const seat of [1, 2, 3]) s = applyAction(s, seat, botAction(s, seat));
		expect(s.phase).toBe('turn');
		// across from seat 0 is seat 2: nothing swapped with an empty offer
		expect(s.players[0].hand.map((t) => t.id).sort()).toEqual(hand0);
	});
	test('a full game with the Charleston plays through', () => {
		let s = start('taiwanese', 3);
		let n = 0;
		while (s.phase !== 'gameover' && n++ < 20000) {
			if (s.phase === 'ended') { s = applyAction(s, 0, { t: 'next' }); continue; }
			const seat = pendingSeats(s)[0];
			s = applyAction(s, seat, botAction(s, seat));
		}
		expect(s.phase).toBe('gameover');
	});
});
