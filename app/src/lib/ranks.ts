// Points (Elo-style) and the ranks they unlock. Shared by the website and the server.
// Win a hand: points go up. Draw: nothing. Someone else wins: points go down
// (most for the player who dealt in). Beating stronger players is worth more.

export interface Rank {
	name: string;
	min: number;
	color: string;
	blurb: string;
}

/** checkpoints: reach `min` points to earn the rank */
export const RANKS: Rank[] = [
	{ name: 'Bamboo', min: 0, color: '#5fbf7a', blurb: 'Learning the tiles and building hands.' },
	{ name: 'Circle', min: 900, color: '#4aa8d8', blurb: 'Finishes hands and avoids easy deal-ins.' },
	{ name: 'Character', min: 1050, color: '#e0a43a', blurb: 'Efficient discards, reads the table.' },
	{ name: 'Wind', min: 1200, color: '#9b8cff', blurb: 'Balances attack and defense well.' },
	{ name: 'Dragon', min: 1350, color: '#ff5d73', blurb: 'Strong all round. Tough to beat.' },
	{ name: 'Jade Master', min: 1500, color: '#2fd6a3', blurb: 'Top of the table.' }
];

export const START_RATING: Record<string, number> = { beginner: 800, intermediate: 1000, advanced: 1200 };
export const BOT_RATING: Record<string, number> = { beginner: 900, intermediate: 1100, expert: 1400 };
export const GUEST_RATING = 1000;
/** points move faster in games against people than against bots */
export const K_ONLINE = 16;
export const K_BOTS = 8;

export function rankFor(rating: number): Rank {
	let r = RANKS[0];
	for (const x of RANKS) if (rating >= x.min) r = x;
	return r;
}

export function nextRank(rating: number): Rank | null {
	return RANKS.find((x) => x.min > rating) ?? null;
}

/** 0..1 progress from this rank's checkpoint to the next one */
export function rankProgress(rating: number): number {
	const cur = rankFor(rating);
	const next = nextRank(rating);
	if (!next) return 1;
	return Math.max(0, Math.min(1, (rating - cur.min) / (next.min - cur.min)));
}

export type HandOutcome = 'win' | 'loss' | 'dealin' | 'draw';

export interface RatedSeat {
	rating: number;
	outcome: HandOutcome;
}

const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/**
 * Points change for every seat after one hand.
 * Winners gain against each loser; a player who dealt in loses the most,
 * others lose a little (they let the hand get away).
 */
export function handDeltas(seats: RatedSeat[], k: number): number[] {
	const winners = seats.map((s, i) => (s.outcome === 'win' ? i : -1)).filter((i) => i >= 0);
	if (!winners.length) return seats.map(() => 0);
	const losers = seats.map((s, i) => (s.outcome !== 'win' ? i : -1)).filter((i) => i >= 0);
	const anyDealIn = seats.some((s) => s.outcome === 'dealin');
	const out = seats.map(() => 0);
	for (const w of winners) {
		let gain = 0;
		for (const l of losers) {
			const e = expected(seats[w].rating, seats[l].rating);
			gain += (1 - e) * 2;
			// self-draw: everyone shares the loss; deal-in: the discarder takes most of it
			const weight = !anyDealIn ? 1 / losers.length : seats[l].outcome === 'dealin' ? 1 : 0.2;
			out[l] -= e * 2 * weight * k;
		}
		out[w] += (gain / losers.length) * k;
	}
	return out.map((d, i) => {
		const r = Math.round(d);
		// a win is always worth at least a point; a loss always costs at least one
		if (seats[i].outcome === 'win') return Math.max(1, r);
		if (seats[i].outcome === 'dealin') return Math.min(-1, r);
		return r;
	});
}

/** outcome of each seat from a finished hand */
export function outcomesOf(result: { type: 'win' | 'draw'; wins: { seat: number; from: number | null }[] }, n = 4): HandOutcome[] {
	if (result.type === 'draw' || !result.wins.length) return Array(n).fill('draw');
	const out: HandOutcome[] = Array(n).fill('loss');
	for (const w of result.wins) {
		out[w.seat] = 'win';
		if (w.from !== null && out[w.from] !== 'win') out[w.from] = 'dealin';
	}
	return out;
}
