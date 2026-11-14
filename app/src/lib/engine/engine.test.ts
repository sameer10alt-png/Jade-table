import { describe, expect, it } from 'vitest';
import { decompose, shantenChiitoi, shantenStandard } from './analysis';
import { botAction } from './bots';
import { applyAction, newGame, pendingSeats, winContext } from './game';
import { winningKinds } from './hand';
import { countsOf, type Tile } from './tiles';
import type { GameState, VariantId } from './types';
import { scoreRiichi } from './variants/riichi';
import { scoreTaiwanese } from './variants/taiwanese';

let nextId = 1000;
const tiles = (spec: string): Tile[] =>
	spec
		.trim()
		.split(/\s+/)
		.map((k) => ({ id: nextId++, k }));
const counts = (spec: string) => countsOf(tiles(spec).map((t) => t.k));

describe('analysis', () => {
	it('finds decompositions of a complete 14-tile hand', () => {
		const d = decompose(counts('b1 b2 b3 c4 c5 c6 p7 p8 p9 we we we dr dr'), 4);
		expect(d.length).toBe(1);
		expect(d[0].pair).toBe(31);
	});

	it('computes shanten', () => {
		expect(shantenStandard(counts('b1 b2 b3 c4 c5 c6 p7 p8 p9 we we we dr dr'), 4)).toBe(-1);
		expect(shantenStandard(counts('b1 b2 b3 c4 c5 c6 p7 p8 p9 we we we dr'), 4)).toBe(0);
		expect(shantenStandard(counts('b1 b4 b7 c2 c5 c8 p3 p6 p9 we ws ww wn'), 4)).toBe(8);
		expect(shantenChiitoi(counts('b1 b1 b2 b2 c3 c3 c4 c4 p5 p5 p6 p6 we'))).toBe(0);
	});

	it('handles jokers in pungs', () => {
		const c = counts('b1 b2 b3 c4 c5 c6 p7 p8 p9 we dr dr');
		expect(decompose(c, 4, 2).length).toBeGreaterThan(0);
	});

	it('finds waits', () => {
		const w = winningKinds(tiles('b1 b2 b3 c4 c5 c6 p7 p8 p9 we we b5 b6'), 0, 4);
		expect(w.sort()).toEqual(['b4', 'b7']);
	});
});

function play(variant: VariantId, seed: number, rounds = 1) {
	let s: GameState = newGame({
		variant,
		bots: ['expert', 'intermediate', 'beginner'],
		rounds,
		playerName: 'Test',
		minimum: true,
		redFives: true,
		seed
	});
	s.players[0].bot = 'expert';
	let steps = 0;
	const stats = { hands: 0, wins: 0, draws: 0 };
	while (s.phase !== 'gameover') {
		if (++steps > 20000) throw new Error(`stuck in ${variant} seed ${seed} phase ${s.phase}`);
		if (s.phase === 'ended') {
			stats.hands++;
			if (s.result!.type === 'win') stats.wins++;
			else stats.draws++;
			// money is conserved apart from pot movements
			s = applyAction(s, 0, { t: 'next' });
			continue;
		}
		const seats = pendingSeats(s);
		expect(seats.length).toBeGreaterThan(0);
		for (const seat of seats) {
			if (!pendingSeats(s).includes(seat)) continue;
			s = applyAction(s, seat, botAction(s, seat));
		}
		// tile conservation
		const inPlay =
			s.wall.length +
			s.deadWall.length +
			s.players.reduce((a, p) => a + p.hand.length + p.flowers.length + p.discards.filter((d) => !d.taken).length + p.melds.reduce((b, m) => b + m.tiles.length, 0), 0);
		const expected = variant === 'riichi' ? 136 : variant === 'taiwanese' ? 144 : 152;
		if (s.phase !== 'ended' && s.phase !== 'gameover' && s.phase !== 'seating') expect(inPlay).toBe(expected);
	}
	return stats;
}

describe('full games with bots', () => {
	for (const variant of ['riichi', 'taiwanese', 'bombay'] as VariantId[]) {
		it(`plays ${variant} to completion`, () => {
			const total = { hands: 0, wins: 0, draws: 0 };
			for (let seed = 1; seed <= 12; seed++) {
				const st = play(variant, seed);
				total.hands += st.hands;
				total.wins += st.wins;
				total.draws += st.draws;
			}
			console.log(variant, total);
			expect(total.hands).toBeGreaterThan(0);
			expect(total.wins).toBeGreaterThan(0);
		}, 120000);
	}
});

describe('scoring', () => {
	function ctxFor(variant: VariantId, hand: string, win: string, selfDraw: boolean) {
		const s = newGame({ variant, bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed: 5, diceSeating: false });
		s.dealer = 1;
		s.round = 0;
		s.firstGoAround = false;
		s.dora = [];
		s.players[0].melds = [];
		s.players[0].flowers = [];
		s.players[0].discards = [{ tile: { id: 1, k: 'p9' } }];
		s.wall = s.wall.slice(0, 50);
		const h = tiles(hand);
		const w = h.find((t) => t.k === win)!;
		return winContext(s, 0, h, w, selfDraw ? null : 2);
	}

	it('scores a riichi pinfu tanyao hand', () => {
		const r = scoreRiichi(ctxFor('riichi', 'b2 b3 b4 c3 c4 c5 p4 p5 p6 p6 p7 p8 b5 b5', 'p8', false));
		expect(r.valid).toBe(true);
		const names = r.lines.map((l) => l.name);
		expect(names).toContain('Pinfu');
		expect(names).toContain('Tanyao (all simples)');
	});

	it('rejects a riichi hand with no yaku', () => {
		const r = scoreRiichi(ctxFor('riichi', 'b1 b2 b3 c7 c8 c9 p4 p5 p6 p1 p1 p1 b5 b5', 'b5', false));
		expect(r.valid).toBe(false);
		expect(r.reason).toBe('No yaku');
	});

	it('scores a Taiwanese concealed self-draw', () => {
		const r = scoreTaiwanese(ctxFor('taiwanese', 'b1 b2 b3 c4 c5 c6 p7 p8 p9 dr dr dr dg dg dg ww ww', 'p9', true));
		const names = r.lines.map((l) => l.name);
		expect(names).toContain('Concealed hand — self-drawn');
		expect(names).toContain('Mahjong base');
		expect(r.total).toBeGreaterThanOrEqual(20);
		expect(r.valid).toBe(true);
	});
});

describe('goulash', () => {
	it('runs the three passes after a Bombay wall game', () => {
		let s = newGame({ variant: 'bombay', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed: 9, diceSeating: false });
		s.phase = 'ended';
		s.result = { type: 'draw', wins: [], deltas: [0, 0, 0, 0], notes: [], dealerKeeps: true };
		s = applyAction(s, 0, { t: 'next' });
		expect(s.phase).toBe('wallbreak');
		s = applyAction(s, s.dealer, { t: 'roll' });
		expect(s.phase).toBe('passing');
		const before = s.players.map((p) => p.hand.length);
		for (let round = 0; round < 3; round++) {
			for (let seat = 0; seat < 4; seat++) s = applyAction(s, seat, botAction(s, seat));
		}
		expect(s.phase).toBe('turn');
		expect(s.turn).toBe(s.dealer);
		expect(s.players.map((p) => p.hand.length)).toEqual(before);
	});
});

describe('dice seating and breaking the wall', () => {
	const fresh = (seed: number) =>
		newGame({ variant: 'taiwanese', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: false, seed });
	const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);

	it('the highest roll sits East; ties re-roll only the tied players', () => {
		let sawTie = false;
		for (let seed = 1; seed <= 300; seed++) {
			let s = fresh(seed);
			expect(s.phase).toBe('seating');
			while (s.phase === 'seating') {
				const st = s.seating!;
				const round = st.round;
				const rolling = pendingSeats(s);
				// only contenders still to roll may roll
				for (const seat of [0, 1, 2, 3]) if (!rolling.includes(seat)) expect(() => applyAction(s, seat, { t: 'roll' })).toThrow();
				for (const seat of rolling) s = applyAction(s, seat, { t: 'roll' });
				if (s.phase === 'seating') {
					sawTie = true;
					expect(s.seating!.round).toBe(round + 1);
					expect(s.seating!.contenders.length).toBeLessThan(rolling.length + 1);
				}
			}
			// the dealer had the highest total in the final round
			const st = s.seating!;
			const last = st.history.filter((h) => h.round === st.round);
			const best = Math.max(...last.map((h) => sum(h.dice)));
			expect(last.filter((h) => sum(h.dice) === best).map((h) => h.seat)).toEqual([s.dealer]);
			expect(s.firstDealer).toBe(s.dealer);
			for (const h of st.history) for (const d of h.dice) expect(d >= 1 && d <= 6).toBe(true);
		}
		expect(sawTie).toBe(true); // 300 games are enough to hit ties
	});

	it('only the dealer breaks the wall, and the deal starts after it', () => {
		let s = fresh(42);
		while (s.phase === 'seating') for (const seat of pendingSeats(s)) s = applyAction(s, seat, { t: 'roll' });
		expect(s.phase).toBe('wallbreak');
		expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
		const other = (s.dealer + 1) % 4;
		expect(() => applyAction(s, other, { t: 'roll' })).toThrow();
		s = applyAction(s, s.dealer, { t: 'roll' });
		expect(s.wallDice!.dice).toHaveLength(3);
		expect(s.phase === 'turn' || s.phase === 'passing').toBe(true);
		expect(s.players[s.dealer].hand.length).toBe(17);
	});

	it('riichi uses two dice and still keeps a 14-tile dead wall', () => {
		let s = newGame({ variant: 'riichi', bots: ['expert', 'expert', 'expert'], rounds: 1, playerName: 'T', minimum: true, redFives: true, seed: 7 });
		while (s.phase === 'seating') for (const seat of pendingSeats(s)) s = applyAction(s, seat, { t: 'roll' });
		s = applyAction(s, s.dealer, { t: 'roll' });
		expect(s.wallDice!.dice).toHaveLength(2);
		expect(s.deadWall).toHaveLength(14);
		expect(s.dora).toHaveLength(1);
	});
});
