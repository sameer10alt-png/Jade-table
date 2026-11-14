// Practice assessment: play 3 hands against the bot, then get a full report on how you play —
// skill scores, strengths, weaknesses, a plan to improve, and strategy questions to ask the coach.
import type { DiscardGrade } from './engine/bots';
import type { HandOutcome } from './ranks';

export const ASSESS_HANDS = 3;
const KEY = 'jt.assess.v1';

export interface DiscardRec {
	grade: DiscardGrade;
	chosenK: string;
	bestK: string;
	reason: string;
	shAfter: number;
	lostOuts: number;
	dealtIn: boolean;
	oppReady: boolean;
}
export interface ClaimRec {
	/** what you did */
	mine: 'claim' | 'pass' | 'win';
	/** what the expert would do */
	best: 'claim' | 'pass' | 'win';
}
export interface HandRec {
	outcome: HandOutcome;
	discards: DiscardRec[];
	claims: ClaimRec[];
	/** your discard number when you first got ready (null = never) */
	readyAt: number | null;
	scoreDelta: number;
}
export interface AssessState {
	variant: string;
	variantName: string;
	started: number;
	hands: HandRec[];
	/** the hand being played right now */
	cur: HandRec;
	/** the game hand numbers already counted */
	counted: number[];
}

export const emptyHand = (): HandRec => ({ outcome: 'draw', discards: [], claims: [], readyAt: null, scoreDelta: 0 });

export function loadAssess(): AssessState | null {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as AssessState) : null;
	} catch {
		return null;
	}
}
export function saveAssess(a: AssessState | null) {
	try {
		if (a) localStorage.setItem(KEY, JSON.stringify(a));
		else localStorage.removeItem(KEY);
	} catch {
		/* private mode: the assessment just won't survive a refresh */
	}
}

// ---- the report ----

export type SkillKey = 'efficiency' | 'defense' | 'speed' | 'calls' | 'results';
export interface Skill {
	key: SkillKey;
	name: string;
	score: number;
	detail: string;
	tested: boolean;
}
export interface KeyMoment {
	hand: number;
	grade: DiscardGrade;
	chosenK: string;
	bestK: string;
	reason: string;
}
export interface DiagnosticReport {
	variantName: string;
	at: number;
	overall: number;
	level: string;
	headline: string;
	skills: Skill[];
	strengths: string[];
	weaknesses: string[];
	plan: string[];
	questions: string[];
	moments: KeyMoment[];
	stats: { hands: number; wins: number; dealIns: number; draws: number; discards: number; accuracy: number };
}

const GRADE_SCORE: Record<DiscardGrade, number> = {
	amazing: 100,
	great: 100,
	best: 100,
	good: 82,
	inaccuracy: 55,
	mistake: 25,
	blunder: 0
};
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const SKILL_NAMES: Record<SkillKey, string> = {
	efficiency: 'Tile efficiency',
	defense: 'Defense',
	speed: 'Speed to ready',
	calls: 'Calling decisions',
	results: 'Results'
};

const PLAN: Record<SkillKey, string[]> = {
	efficiency: [
		'Before each discard, count how many tiles would improve your hand for each choice. Keep the shape with the most.',
		'Throw isolated honors and terminals early; keep connected middle tiles (3-7) that can become runs.',
		'Keep one pair as your head. Breaking your only pair usually slows you down.'
	],
	defense: [
		'When someone calls riichi or makes several open sets, stop pushing a slow hand. Fold with safe tiles.',
		'Safest tiles first: ones the ready player already discarded, then honors that are already out.',
		'Only keep attacking when you are ready yourself or one step away with a good hand.'
	],
	speed: [
		'Aim to be ready by around your 9th discard. Plan two or three likely sets from the first draw.',
		'Prefer two-sided waits (like 4-5 waiting on 3 or 6) over edge or middle waits.',
		'Cut your weakest suit early instead of keeping options in all three.'
	],
	calls: [
		'Only call a tile if it moves you closer to ready and still leaves a way to score.',
		'Calling chows freely makes your hand cheap and easy to read. Pung honors and dragons more readily.',
		'Do not pass a winning tile unless you are sure a bigger hand is close.'
	],
	results: [
		'Pick a hand plan by your 3rd discard: fast and cheap, or slow and big, and commit to it.',
		'Watch what the others throw. Avoid building toward the suit they are collecting.',
		'Play the practice assessment again in a few days to see if your scores move.'
	]
};

const QUESTIONS: Record<SkillKey, string[]> = {
	efficiency: [
		'How do I count outs (ukeire) when choosing which tile to discard?',
		'Which tiles should I throw first in the opening and why?'
	],
	defense: [
		'How do I tell when an opponent is close to winning, and how do I fold safely?',
		'What makes a tile safe or dangerous to discard late in a hand?'
	],
	speed: [
		'What are the best waits to aim for and how do I build toward them?',
		'How can I get my hand ready faster in the first few turns?'
	],
	calls: [
		'When should I call pung or chow, and when should I keep my hand closed?',
		'How does calling a tile change my scoring and my defense?'
	],
	results: [
		'How do I decide between a fast cheap hand and a slow big one?',
		'What should I watch in my opponents’ discards to plan my hand?'
	]
};

export function buildDiagnostic(a: AssessState): DiagnosticReport {
	const hands = a.hands;
	const discards = hands.flatMap((h) => h.discards);
	const claims = hands.flatMap((h) => h.claims);
	const wins = hands.filter((h) => h.outcome === 'win').length;
	const dealIns = hands.filter((h) => h.outcome === 'dealin').length;
	const draws = hands.filter((h) => h.outcome === 'draw').length;

	// Efficiency: grades of discards made while not under threat
	const calm = discards.filter((d) => !d.oppReady);
	const effScore = clamp(avg((calm.length ? calm : discards).map((d) => GRADE_SCORE[d.grade])));
	const lost = avg(discards.filter((d) => d.lostOuts > 0).map((d) => d.lostOuts));
	const slips = discards.filter((d) => d.grade === 'mistake' || d.grade === 'blunder').length;

	// Defense: deal-ins and how you discarded when someone was ready
	const threatened = discards.filter((d) => d.oppReady);
	const dangerous = threatened.filter((d) => d.dealtIn).length;
	const defScore = clamp(100 - dealIns * 30 - Math.max(0, dangerous - dealIns) * 8);

	// Speed: how early you got ready
	const speedPer = hands.map((h) =>
		h.readyAt === null ? (h.outcome === 'win' ? 70 : 20) : h.readyAt <= 6 ? 100 : h.readyAt <= 9 ? 82 : h.readyAt <= 12 ? 60 : 40
	);
	const speedScore = clamp(avg(speedPer));
	const readyHands = hands.filter((h) => h.readyAt !== null);

	// Calls: agreement with the expert on claim / pass
	const agree = claims.filter((c) => c.mine === c.best).length;
	const missedWins = claims.filter((c) => c.best === 'win' && c.mine !== 'win').length;
	const callsTested = claims.length > 0;
	const callScore = callsTested ? clamp((agree / claims.length) * 100 - missedWins * 25) : 70;

	// Results
	const resScore = clamp(45 + wins * 22 - dealIns * 15 + draws * 3 + avg(hands.map((h) => Math.sign(h.scoreDelta))) * 10);

	const skills: Skill[] = [
		{
			key: 'efficiency',
			name: SKILL_NAMES.efficiency,
			score: effScore,
			tested: discards.length > 0,
			detail: slips
				? `${slips} clear slip${slips === 1 ? '' : 's'}${lost ? `, about ${Math.round(lost)} fewer useful tiles each time` : ''}.`
				: 'Your discards mostly matched an expert.'
		},
		{
			key: 'defense',
			name: SKILL_NAMES.defense,
			score: defScore,
			tested: threatened.length > 0 || dealIns > 0,
			detail: dealIns
				? `Dealt in ${dealIns} time${dealIns === 1 ? '' : 's'}.`
				: threatened.length
					? `Faced ${threatened.length} discard${threatened.length === 1 ? '' : 's'} with an opponent ready and stayed safe.`
					: 'No real danger came up.'
		},
		{
			key: 'speed',
			name: SKILL_NAMES.speed,
			score: speedScore,
			tested: true,
			detail: readyHands.length
				? `Ready in ${readyHands.length} of ${hands.length} hands, on average by discard ${Math.round(avg(readyHands.map((h) => h.readyAt!)))}.`
				: 'Never got a ready hand.'
		},
		{
			key: 'calls',
			name: SKILL_NAMES.calls,
			score: callScore,
			tested: callsTested,
			detail: callsTested
				? `Matched the expert on ${agree} of ${claims.length} call decisions${missedWins ? `, passed on ${missedWins} win${missedWins === 1 ? '' : 's'}` : ''}.`
				: 'No call decisions came up.'
		},
		{
			key: 'results',
			name: SKILL_NAMES.results,
			score: resScore,
			tested: true,
			detail: `${wins} win${wins === 1 ? '' : 's'}, ${dealIns} deal-in${dealIns === 1 ? '' : 's'}, ${draws} draw${draws === 1 ? '' : 's'}.`
		}
	];

	const weights: Record<SkillKey, number> = { efficiency: 0.32, defense: 0.22, speed: 0.2, calls: 0.1, results: 0.16 };
	const overall = clamp(skills.reduce((s, k) => s + k.score * weights[k.key], 0));
	const level = overall >= 85 ? 'Advanced' : overall >= 68 ? 'Solid intermediate' : overall >= 50 ? 'Intermediate' : 'Beginner';

	const tested = skills.filter((s) => s.tested);
	const byScore = [...tested].sort((x, y) => y.score - x.score);
	const strong = byScore.filter((s) => s.score >= 70).slice(0, 2);
	const weak = [...byScore].reverse().filter((s) => s.score < 70).slice(0, 2);
	// always give at least one area to work on
	if (!weak.length && byScore.length) weak.push(byScore[byScore.length - 1]);

	const headline = weak.length
		? `Biggest gain: ${weak[0].name.toLowerCase()}.`
		: 'Well-rounded play. Try harder bots.';

	const RANK: Record<string, number> = { blunder: 0, mistake: 1, amazing: 2, inaccuracy: 3, great: 4 };
	const moments: KeyMoment[] = hands
		.flatMap((h, hi) => h.discards.map((d) => ({ hand: hi + 1, grade: d.grade, chosenK: d.chosenK, bestK: d.bestK, reason: d.reason })))
		.filter((m) => m.grade in RANK)
		.sort((x, y) => RANK[x.grade] - RANK[y.grade])
		.slice(0, 5);

	return {
		variantName: a.variantName,
		at: Date.now(),
		overall,
		level,
		headline,
		skills,
		strengths: strong.map((s) => `${s.name}: ${s.detail}`),
		weaknesses: weak.map((s) => `${s.name}: ${s.detail}`),
		plan: weak.flatMap((s) => PLAN[s.key].slice(0, 2)).concat(PLAN.results[2]),
		questions: weak.flatMap((s) => QUESTIONS[s.key]).slice(0, 4),
		moments,
		stats: {
			hands: hands.length,
			wins,
			dealIns,
			draws,
			discards: discards.length,
			accuracy: discards.length ? clamp((discards.filter((d) => GRADE_SCORE[d.grade] >= 82).length / discards.length) * 100) : 0
		}
	};
}
