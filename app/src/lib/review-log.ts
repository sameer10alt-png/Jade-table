// One game's worth of your moves, graded by the engine, turned into:
//  - the numbers and key moments shown in the Game review card
//  - a plain-text log the Dragon reads to say what was good and what to fix
import { reviewDiscard, type DiscardGrade } from './engine/bots';
import { kindName, sortKey } from './engine/tiles';
import type { GameState } from './engine/types';

export interface MoveReview {
	handNo: number;
	chosenK: string;
	bestK: string;
	grade: DiscardGrade;
	reason: string;
}
export interface GameReviewData {
	total: number;
	counts: Record<DiscardGrade, number>;
	accuracy: number;
	verdict: string;
	notable: MoveReview[];
	tips: string[];
}

/** a graded discard plus the hand it came from */
export interface LoggedMove extends MoveReview {
	/** tile kinds in hand before the discard (including the tile just drawn) */
	hand: string[];
	/** exposed sets, as kinds */
	melds: string[][];
}

export interface HandResult {
	handNo: number;
	outcome: 'win' | 'loss' | 'dealin' | 'draw';
	delta: number;
}

/** grade one discard against the full state (before it was made) */
export function logMove(s: GameState, seat: number, tileId: number): LoggedMove | null {
	const r = reviewDiscard(s, seat, tileId);
	if (!r) return null;
	const p = s.players[seat];
	return {
		handNo: s.handNo,
		chosenK: r.chosenK,
		bestK: r.bestK,
		grade: r.grade,
		reason: r.reason,
		hand: p.hand.map((t) => t.k),
		melds: p.melds.map((m) => m.tiles.map((t) => t.k))
	};
}

const RANK: Record<DiscardGrade, number> = { blunder: 0, mistake: 1, amazing: 2, great: 3, inaccuracy: 4, good: 5, best: 6 };

export function buildReviewData(moves: MoveReview[]): GameReviewData {
	const counts: Record<DiscardGrade, number> = { amazing: 0, great: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
	const notable: MoveReview[] = [];
	for (const m of moves) {
		counts[m.grade]++;
		if (m.grade !== 'best' && m.grade !== 'good')
			notable.push({ handNo: m.handNo, chosenK: m.chosenK, bestK: m.bestK, grade: m.grade, reason: m.reason });
	}
	const total = moves.length;
	const goodMoves = counts.amazing + counts.great + counts.best + counts.good;
	const accuracy = total ? Math.round((goodMoves / total) * 100) : 100;
	notable.sort((a, b) => RANK[a.grade] - RANK[b.grade]);

	let verdict: string;
	if (counts.blunder >= 3) verdict = 'Rough one — too many tiles into live hands.';
	else if (counts.blunder || counts.mistake >= 3) verdict = 'Mixed game — some costly discards to clean up.';
	else if (counts.amazing) verdict = 'Brilliant game — great reads under pressure.';
	else if (accuracy >= 90) verdict = 'Sharp game — you played near-expert.';
	else if (accuracy >= 75) verdict = 'Solid game — a few spots to tighten.';
	else verdict = 'Keep at it — focus on efficient, safe discards.';

	const tips: string[] = [];
	if (counts.blunder) tips.push('Safety first when someone’s close: watch for players who’ve stopped discarding middle tiles, and switch to tiles they’ve already thrown.');
	if (counts.mistake >= 2) tips.push('Keep tiles that work together — let go of lone honours and terminals early instead of breaking a near-complete shape.');
	if (notable.some((m) => /outs|improved/.test(m.reason))) tips.push('Count your outs — keep the shape that leaves the most tiles to draw toward a win.');
	if (!tips.length) tips.push(accuracy >= 90 ? 'You matched the expert most of the time. Bump the bots up a level.' : 'Push your efficient discards and you’ll climb fast.');

	return { total, counts, accuracy, verdict, notable: notable.slice(0, 8), tips: tips.slice(0, 2) };
}

const names = (ks: string[]) =>
	ks
		.slice()
		.sort((a, b) => sortKey(a) - sortKey(b))
		.map(kindName)
		.join(', ');

const OUTCOME = { win: 'you won', loss: 'someone else won', dealin: 'you dealt in (your discard let someone win)', draw: 'nobody won (draw)' };

/** the text the Dragon reviews: every graded discard with the hand it came from, plus each hand's result */
export function gameLog(variant: string, moves: LoggedMove[], results: HandResult[]): string {
	const lines = [`Variant: ${variant}`, `Hands played: ${new Set([...moves.map((m) => m.handNo), ...results.map((r) => r.handNo)]).size}`, ''];
	const hands = [...new Set([...moves.map((m) => m.handNo), ...results.map((r) => r.handNo)])].sort((a, b) => a - b);
	for (const h of hands) {
		lines.push(`== Hand ${h} ==`);
		let i = 0;
		for (const m of moves.filter((x) => x.handNo === h)) {
			i++;
			const melds = m.melds.length ? ` | exposed: ${m.melds.map((x) => `[${names(x)}]`).join(' ')}` : '';
			const better = m.bestK !== m.chosenK ? ` | engine's pick: ${kindName(m.bestK)}` : '';
			lines.push(
				`Move ${i}: hand: ${names(m.hand)}${melds} | discarded: ${kindName(m.chosenK)} | engine grade: ${m.grade}${better} | note: ${m.reason}`
			);
		}
		const r = results.find((x) => x.handNo === h);
		if (r) lines.push(`Result: ${OUTCOME[r.outcome]} (${r.delta >= 0 ? '+' : ''}${r.delta} points)`);
		lines.push('');
	}
	// keep it to what the Dragon can read in one go: the latest moves win
	const text = lines.join('\n');
	return text.length > 14_000 ? text.slice(text.length - 14_000) : text;
}
