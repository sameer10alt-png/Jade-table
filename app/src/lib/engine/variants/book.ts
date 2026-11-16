// International Mahjong on Pung Table: the Australian club game from Thompson & Maloney,
// "The Mah Jong Player's Companion". A win must be one of the named hands below.
// - Most hands have a fixed value: half limit 500, limit 1000, middle limit 1500, double limit 2000.
// - Ordinary Mah Jong, Purity and All Honour are scored by points and doubles (Western), up to 1000.
// - Exposure: some hands may have exposed pungs (full value), some only at half value,
//   the rest must stay concealed until the winning tile.
// - "Fishing": if the wall runs out while you're one tile from a hand, you collect its fishing value.
import { shantenStandard } from '../analysis';
import type { Interpretation } from '../hand';
import { KIND_INDEX, type Tile } from '../tiles';
import type { GameState, Meld, ScoreLine } from '../types';
import type { Scored, Variant, WinContext } from '../variant';
import { scoreCalculated } from './western';

// ---- tile indexes (KINDS34 order: bamboo 0-8, characters 9-17, circles 18-26, E S W N, Red Green White) ----
const BAM = 0;
const CHR = 1;
const CIR = 2;
const SUITS = [BAM, CHR, CIR];
const t = (suit: number, n: number) => suit * 9 + n - 1;
const E = 27, S = 28, W = 29, N = 30;
const RD = 31, GD = 32, WD = 33;
const WINDS = [E, S, W, N];
const DRAGONS = [RD, GD, WD];
const HONOURS = [...WINDS, ...DRAGONS];
const ESWN = [E, S, W, N];
const GRW = [GD, RD, WD];
/** the dragon that goes with each suit: Red–Characters, Green–Bamboo, White–Circles */
const CORRESPONDING: Record<number, number> = { [CHR]: RD, [BAM]: GD, [CIR]: WD };
const GREEN_BAM = [2, 3, 4, 6, 8].map((n) => t(BAM, n));
const RED_BAM = [1, 5, 7, 9].map((n) => t(BAM, n));
const BLUE_CIR = [2, 3, 4, 5, 8, 9].map((n) => t(CIR, n));
const run = (suit: number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => t(suit, a + i));
const rep = (k: number, n: number) => Array(n).fill(k) as number[];
const perms3 = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];
const pairsOf = <T,>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as [T, T]));
function choose<T>(xs: T[], k: number): T[][] {
	if (k === 0) return [[]];
	if (xs.length < k) return [];
	const [h, ...rest] = xs;
	return [...choose(rest, k - 1).map((c) => [h, ...c]), ...choose(rest, k)];
}
const isTerminal = (k: number) => k < 27 && (k % 9 === 0 || k % 9 === 8);

// ---- hands ----
export type Expose = 0 | 1 | 2; // 0 concealed only, 1 exposed pungs at half value, 2 exposed pungs at full value
export interface BookHand {
	id: string;
	name: string;
	group: string;
	/** what it looks like, in plain words (shown on the rules page) */
	desc: string;
	value: number | 'calc';
	fishing: number;
	expose: Expose;
	/** all tiles must be drawn from the wall, including the last */
	selfDrawOnly?: boolean;
	/** candidate tile sets (with the kinds that form pungs, which may be exposed) */
	gen?: () => Cand[];
	/** hands with too many shapes to list: a direct check on the 14 tiles (concealed only) */
	check?: (c: number[]) => boolean;
	/** value override for a particular tile set (Big Robert with matching numbers) */
	valueFor?: (c: number[]) => number;
}
export interface Cand {
	tiles: number[];
	pungs: number[];
}
const C = (tiles: number[], pungs: number[] = []): Cand => ({ tiles, pungs });

/** own wind can't be known when generating, so hands that need it list all four and check at score time */
const OWN = 'own';
const ownWindOf = (cand: Cand & { own?: number }) => cand.own;

function* each<T>(xs: T[]): Generator<T> {
	yield* xs;
}

const HANDS: BookHand[] = [];
const add = (h: BookHand) => HANDS.push(h);

// RUNS
add({
	id: 'runPungPair', name: 'Run, Pung & Pair', group: 'Runs', desc: '1–9 in one suit, a pung and a pair, all that suit', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => run(s, 1, 9).flatMap((p) => run(s, 1, 9).filter((q) => q !== p).map((q) => C([...run(s, 1, 9), ...rep(p, 3), ...rep(q, 2)], [p]))))
});
add({
	id: 'gatesOfHeaven', name: 'Gates of Heaven', group: 'Runs', desc: '2–8 with one tile paired, plus 111 and 999, all one suit', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => run(s, 2, 8).map((x) => C([...run(s, 2, 8), x, ...rep(t(s, 1), 3), ...rep(t(s, 9), 3)], [t(s, 1), t(s, 9)])))
});
add({
	id: 'confusedGates', name: 'Confused Gates', group: 'Runs', desc: '2–8 with one tile paired in one suit, 111 in another, 999 in the third', value: 1000, fishing: 400, expose: 0,
	gen: () => perms3.flatMap(([a, b, c]) => run(a, 2, 8).map((x) => C([...run(a, 2, 8), x, ...rep(t(b, 1), 3), ...rep(t(c, 9), 3)], [t(b, 1), t(c, 9)])))
});
add({
	id: 'wrigglySnake', name: 'Wriggly Snake', group: 'Runs', desc: '1–9 in one suit, one of each wind, any one of those tiles paired', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => [...run(s, 1, 9), ...ESWN].map((x) => C([...run(s, 1, 9), ...ESWN, x])))
});
add({
	id: 'hachiBan', name: 'Hachi Ban', group: 'Runs', desc: '1–8 or 2–9 in one suit plus three pairs of winds or dragons', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => [run(s, 1, 8), run(s, 2, 9)].flatMap((r) => choose(HONOURS, 3).map((hs) => C([...r, ...hs.flatMap((h) => rep(h, 2))]))))
});
add({
	id: 'guardianWinds', name: 'Guardian Winds', group: 'Runs', desc: '1–9 in one suit, a pung of one wind and a pair of another', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => WINDS.flatMap((p) => WINDS.filter((q) => q !== p).map((q) => C([...run(s, 1, 9), ...rep(p, 3), ...rep(q, 2)], [p]))))
});
add({
	id: 'guardianDragons', name: 'Guardian Dragons', group: 'Runs', desc: '1–9 in one suit, a pung of one dragon and a pair of another', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => DRAGONS.flatMap((p) => DRAGONS.filter((q) => q !== p).map((q) => C([...run(s, 1, 9), ...rep(p, 3), ...rep(q, 2)], [p]))))
});
add({
	id: 'wrigglyDragon', name: 'Wriggly Dragon', group: 'Runs', desc: '1–9 in one suit, one of each dragon, and one dragon paired', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => DRAGONS.map((d) => C([...run(s, 1, 9), ...GRW, d, d])))
});
add({
	id: 'fiveOddHonours', name: 'Five Odd Honours', group: 'Runs', desc: '1–9 in one suit plus five different winds and dragons', value: 500, fishing: 200, expose: 0,
	gen: () => SUITS.flatMap((s) => choose(HONOURS, 5).map((hs) => C([...run(s, 1, 9), ...hs])))
});
add({
	id: 'grandSequence', name: 'Grand Sequence', group: 'Runs', desc: '1–9 in one suit with two of its tiles paired, plus a pung of any wind or dragon', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => pairsOf(run(s, 1, 9)).flatMap(([x, y]) => HONOURS.map((h) => C([...run(s, 1, 9), x, y, ...rep(h, 3)], [h]))))
});
add({
	id: 'dragonsTail', name: 'Dragon’s Tail', group: 'Runs', desc: '1–9 in one suit, a pung of a wind and a pair of a dragon (or the other way round)', value: 1000, fishing: 400, expose: 1,
	gen: () =>
		SUITS.flatMap((s) => [
			...WINDS.flatMap((w) => DRAGONS.map((d) => C([...run(s, 1, 9), ...rep(w, 3), d, d], [w]))),
			...DRAGONS.flatMap((d) => WINDS.map((w) => C([...run(s, 1, 9), ...rep(d, 3), w, w], [d])))
		])
});
add({
	id: 'dragonsGates', name: 'Dragon’s Gates', group: 'Runs', desc: '2–8 with one tile paired, 111 or 999, all one suit, plus a pung of that suit’s dragon', value: 1000, fishing: 400, expose: 1,
	gen: () =>
		SUITS.flatMap((s) => run(s, 2, 8).flatMap((x) => [1, 9].map((e) => C([...run(s, 2, 8), x, ...rep(t(s, e), 3), ...rep(CORRESPONDING[s], 3)], [t(s, e), CORRESPONDING[s]]))))
});
add({
	id: 'dragonsTeeth', name: 'Dragon’s Teeth', group: 'Runs', desc: '1–7 or 2–8 with one tile paired, in Characters or Circles, plus pungs of Red and White dragons', value: 1000, fishing: 400, expose: 2,
	gen: () => [CHR, CIR].flatMap((s) => [run(s, 1, 7), run(s, 2, 8)].flatMap((r) => r.map((x) => C([...r, x, ...rep(RD, 3), ...rep(WD, 3)], [RD, WD]))))
});
add({
	id: 'gretasGarden', name: 'Greta’s Garden', group: 'Runs', desc: '1–7 in one suit, one of each wind and one of each dragon', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.map((s) => C([...run(s, 1, 7), ...ESWN, ...GRW]))
});
add({
	id: 'gretasDragon', name: 'Greta’s Dragon', group: 'Runs', desc: '1–7 in one suit, one of each wind and a pung of any dragon', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => DRAGONS.map((d) => C([...run(s, 1, 7), ...ESWN, ...rep(d, 3)], [d])))
});
add({
	id: 'redLantern', name: 'Red Lantern', group: 'Runs', desc: '1–7 in one suit with one tile paired, a pung of Red dragons and a pung of your own wind', value: 2000, fishing: 800, expose: 1,
	gen: () => SUITS.flatMap((s) => run(s, 1, 7).flatMap((x) => WINDS.map((w) => ({ ...C([...run(s, 1, 7), x, ...rep(RD, 3), ...rep(w, 3)], [RD, w]), own: w }))))
});
add({
	id: 'gertiesGarter', name: 'Gertie’s Garter', group: 'Runs', desc: '1–7 in one suit and 1–7 in another', value: 1000, fishing: 400, expose: 0,
	gen: () => pairsOf(SUITS).map(([a, b]) => C([...run(a, 1, 7), ...run(b, 1, 7)]))
});
add({
	id: 'yinYang', name: 'Yin Yang', group: 'Runs', desc: '11 234 55 in one suit and 55 678 99 in another', value: 1000, fishing: 400, expose: 0,
	gen: () =>
		SUITS.flatMap((a) =>
			SUITS.filter((b) => b !== a).map((b) => C([t(a, 1), t(a, 1), t(a, 2), t(a, 3), t(a, 4), t(a, 5), t(a, 5), t(b, 5), t(b, 5), t(b, 6), t(b, 7), t(b, 8), t(b, 9), t(b, 9)]))
		)
});
add({
	id: 'bigRobert', name: 'Big Robert', group: 'Runs', desc: 'Four in a row in each suit plus a pair of winds or dragons (limit if the numbers match)', value: 500, fishing: 200, expose: 0,
	gen: () => {
		const out: Cand[] = [];
		for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (const h of HONOURS) out.push(C([...run(BAM, a, a + 3), ...run(CHR, b, b + 3), ...run(CIR, c, c + 3), h, h]));
		return out;
	},
	valueFor: (c) => {
		const start = (s: number) => c.slice(s * 9, s * 9 + 9).findIndex((x) => x > 0);
		return start(BAM) === start(CHR) && start(CHR) === start(CIR) ? 1000 : 500;
	}
});

// CHOWS — many shapes, so these are checked directly (concealed hands)
const chowStarts = [1, 2, 3, 4, 5, 6, 7];
/** can the counts be split into exactly these parts? parts: 'chow:s' (chow in suit s), 'mixed' (mixed chow), 'pung:s', 'pair:s', 'mixedPair' */
function splits(counts: number[], parts: string[]): boolean {
	if (!parts.length) return counts.every((x) => x === 0);
	const [p, ...rest] = parts;
	const [kind, arg] = p.split(':');
	const tryTake = (ks: number[]) => {
		if (ks.some((k) => counts[k] <= 0)) return false;
		const tmp = counts.slice();
		for (const k of ks) {
			tmp[k]--;
			if (tmp[k] < 0) return false;
		}
		return splits(tmp, rest);
	};
	const suits = arg === undefined || arg === '*' ? SUITS : [Number(arg)];
	if (kind === 'chow') return suits.some((s) => chowStarts.some((n) => tryTake([t(s, n), t(s, n + 1), t(s, n + 2)])));
	if (kind === 'mixed') return chowStarts.some((n) => perms3.some(([a, b, c]) => tryTake([t(a, n), t(b, n + 1), t(c, n + 2)])));
	if (kind === 'pung') return suits.some((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => tryTake(rep(t(s, n), 3))));
	if (kind === 'pair') return suits.some((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => tryTake(rep(t(s, n), 2))));
	if (kind === 'mixedPair') return [1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => pairsOf(SUITS).some(([a, b]) => tryTake([t(a, n), t(b, n)])));
	if (kind === 'tiles') return tryTake(arg.split(',').map(Number));
	return false;
}
const each3 = (c: number[], f: (rest: number[]) => boolean, take: number[]) => {
	const r = c.slice();
	for (const k of take) {
		if (--r[k] < 0) return false;
	}
	return f(r);
};
add({
	id: 'moonWell', name: 'Moon at Bottom of Well', group: 'Chows', desc: '123 456 789 plus any chow and a pair, all Circles', value: 1000, fishing: 400, expose: 0,
	check: (c) => each3(c, (r) => splits(r, [`chow:${CIR}`, `pair:${CIR}`]), run(CIR, 1, 9))
});
add({
	id: 'threePhilosophers', name: 'Three Philosophers', group: 'Chows', desc: 'A chow in each suit, a mixed chow (one tile from each suit) and a pair', value: 1000, fishing: 400, expose: 0,
	check: (c) => splits(c, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`, 'mixed', 'pair:*'])
});
add({
	id: 'crazyChows', name: 'Crazy Chows', group: 'Chows', desc: 'Four mixed chows and a mixed pair (same number, two suits)', value: 500, fishing: 200, expose: 0,
	check: (c) => splits(c, ['mixed', 'mixed', 'mixed', 'mixed', 'mixedPair'])
});
add({
	id: 'littleRobert', name: 'Little Robert', group: 'Chows', desc: 'A chow in each suit, a pung and a pair', value: 500, fishing: 200, expose: 0,
	check: (c) => splits(c, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`, 'pung:*', 'pair:*'])
});
const windyChow = (starts: number[] | null) => (c: number[]) =>
	WINDS.some((w) => each3(c, (r) => (starts ? splits(r, starts.map((n, i) => `tiles:${t(SUITS[i], n)},${t(SUITS[i], n + 1)},${t(SUITS[i], n + 2)}`)) : splits(r, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`])), [...ESWN, w]));
add({ id: 'windyChow', name: 'Windy Chow', group: 'Chows', desc: 'A chow in each suit, one of each wind, and one wind paired', value: 500, fishing: 200, expose: 0, check: windyChow(null) });
add({ id: 'chopSuey', name: 'Chop Suey', group: 'Chows', desc: '123 in each suit, one of each wind, and one wind paired', value: 1000, fishing: 400, expose: 0, check: windyChow([1, 1, 1]) });
add({ id: 'chowMein', name: 'Chow Mein', group: 'Chows', desc: '789 in each suit, one of each wind, and one wind paired', value: 1000, fishing: 400, expose: 0, check: windyChow([7, 7, 7]) });
add({
	id: 'hoveringAngel', name: 'Hovering Angel', group: 'Chows', desc: 'A chow in each suit, a pung of your own wind and a pair of dragons', value: 1000, fishing: 400, expose: 0,
	check: (c) => WINDS.some((w) => DRAGONS.some((d) => each3(c, (r) => splits(r, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`]), [w, w, w, d, d]))),
	gen: undefined
});
add({
	id: 'littleBrother', name: 'Little Brother', group: 'Chows', desc: 'A chow in each suit, another chow in any suit and a pair of your own wind', value: 500, fishing: 200, expose: 0,
	check: (c) => WINDS.some((w) => each3(c, (r) => splits(r, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`, 'chow:*']), [w, w]))
});
add({
	id: 'appleBlossom', name: 'Apple Blossom', group: 'Chows', desc: 'Three mixed chows, a pung of White dragons and a pair of Green dragons', value: 1000, fishing: 400, expose: 0,
	check: (c) => each3(c, (r) => splits(r, ['mixed', 'mixed', 'mixed']), [WD, WD, WD, GD, GD])
});
add({
	id: 'professors', name: 'The Professors', group: 'Chows', desc: 'Three mixed chows, one of each dragon and a pair of your own wind', value: 500, fishing: 200, expose: 0,
	check: (c) => WINDS.some((w) => each3(c, (r) => splits(r, ['mixed', 'mixed', 'mixed']), [...GRW, w, w]))
});
add({
	id: 'chowChow', name: 'Chow Chow', group: 'Chows', desc: 'Four chows and a pair, all one suit, every tile drawn from the wall', value: 500, fishing: 200, expose: 0, selfDrawOnly: true,
	check: (c) => SUITS.some((s) => splits(c, [`chow:${s}`, `chow:${s}`, `chow:${s}`, `chow:${s}`, `pair:${s}`]))
});

// PAIRS
const sevenPairsFrom = (allowed: number[]) => (c: number[]) => c.every((x, k) => x === 0 || (x === 2 && allowed.includes(k))) && c.filter((x) => x === 2).length === 7;
add({
	id: 'knitting', name: 'Knitting', group: 'Pairs', desc: 'Seven knitted pairs: the same number in two suits', value: 500, fishing: 200, expose: 0,
	gen: () => pairsOf(SUITS).flatMap(([a, b]) => choose([1, 2, 3, 4, 5, 6, 7, 8, 9], 7).map((ns) => C(ns.flatMap((n) => [t(a, n), t(b, n)]))))
});
add({
	id: 'tripleKnitting', name: 'Triple Knitting', group: 'Pairs', desc: 'Four numbers in all three suits plus a knitted pair', value: 500, fishing: 200, expose: 0,
	gen: () =>
		choose([1, 2, 3, 4, 5, 6, 7, 8, 9], 4).flatMap((ns) =>
			[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((m) => !ns.includes(m)).flatMap((m) => pairsOf(SUITS).map(([a, b]) => C([...ns.flatMap((n) => SUITS.map((s) => t(s, n))), t(a, m), t(b, m)])))
		)
});
add({
	id: 'sparrowsSanctuary', name: 'Sparrow’s Sanctuary', group: 'Pairs', desc: 'Two pairs of 1 Bamboo plus a pair of each green bamboo (2, 3, 4, 6, 8)', value: 1500, fishing: 600, expose: 0,
	gen: () => [C([...rep(t(BAM, 1), 4), ...GREEN_BAM.flatMap((k) => [k, k])])]
});
add({
	id: 'heavenlyTwins', name: 'Heavenly Twins', group: 'Pairs', desc: 'Seven pairs in one suit, no winds or dragons', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => choose(run(s, 1, 9), 7).map((ks) => C(ks.flatMap((k) => [k, k]))))
});
add({
	id: 'sevenTwins', name: 'Seven Twins', group: 'Pairs', desc: 'Seven pairs of anything, every tile drawn from the wall', value: 500, fishing: 200, expose: 0, selfDrawOnly: true,
	check: sevenPairsFrom(Array.from({ length: 34 }, (_, i) => i))
});
add({
	id: 'allPair', name: 'All Pair', group: 'Pairs', desc: 'Seven pairs in one suit, winds and dragons allowed', value: 500, fishing: 200, expose: 0,
	check: (c) => SUITS.some((s) => sevenPairsFrom([...run(s, 1, 9), ...HONOURS])(c))
});
add({
	id: 'allPairHonours', name: 'All Pair Honours', group: 'Pairs', desc: 'Seven pairs of winds, dragons, 1s and 9s', value: 1000, fishing: 400, expose: 0,
	check: sevenPairsFrom([...HONOURS, ...SUITS.flatMap((s) => [t(s, 1), t(s, 9)])])
});
add({
	id: 'goldenGates', name: 'Golden Gates', group: 'Pairs', desc: '22 44 66 88, plus 111 or 999 in that suit and a pung of its dragon', value: 1000, fishing: 400, expose: 1,
	gen: () => SUITS.flatMap((s) => [1, 9].map((e) => C([...[2, 4, 6, 8].flatMap((n) => [t(s, n), t(s, n)]), ...rep(t(s, e), 3), ...rep(CORRESPONDING[s], 3)], [t(s, e), CORRESPONDING[s]])))
});
add({
	id: 'allPairJade', name: 'All Pair Jade', group: 'Pairs', desc: 'A pair (or two) of Green dragons and pairs of green bamboos (2, 3, 4, 6, 8)', value: 1000, fishing: 400, expose: 0,
	gen: () => [
		C([GD, GD, GD, GD, ...GREEN_BAM.flatMap((k) => [k, k])]),
		...GREEN_BAM.map((x) => C([GD, GD, ...GREEN_BAM.flatMap((k) => [k, k]), x, x]))
	]
});
add({
	id: 'allPairRubyJade', name: 'All Pair Ruby Jade', group: 'Pairs', desc: 'A pair of Green and of Red dragons plus five pairs of red and green bamboos', value: 1000, fishing: 400, expose: 0,
	gen: () => choose(run(BAM, 1, 9), 5).filter((ks) => ks.some((k) => RED_BAM.includes(k)) && ks.some((k) => GREEN_BAM.includes(k))).map((ks) => C([GD, GD, RD, RD, ...ks.flatMap((k) => [k, k])]))
});
add({
	id: 'dragonette', name: 'Dragonette', group: 'Pairs', desc: 'One of each wind and dragon (one of them paired) plus three pairs in one suit, no 1s or 9s', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => choose(run(s, 2, 8), 3).flatMap((ks) => HONOURS.map((x) => C([...ESWN, ...GRW, x, ...ks.flatMap((k) => [k, k])]))))
});
add({
	id: 'windfall', name: 'Windfall', group: 'Pairs', desc: 'One of each wind plus five pairs in one suit', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => choose(run(s, 1, 9), 5).map((ks) => C([...ESWN, ...ks.flatMap((k) => [k, k])])))
});
add({
	id: 'dragonsBreath', name: 'Dragon’s Breath', group: 'Pairs', desc: 'One of each dragon, one dragon paired, plus five pairs in one suit', value: 1000, fishing: 400, expose: 0,
	gen: () => SUITS.flatMap((s) => choose(run(s, 1, 9), 5).flatMap((ks) => DRAGONS.map((d) => C([...GRW, d, ...ks.flatMap((k) => [k, k])]))))
});
add({
	id: 'windyDragons', name: 'Windy Dragons', group: 'Pairs', desc: 'A pair of each wind plus pungs of two dragons', value: 1000, fishing: 400, expose: 2,
	gen: () => pairsOf(DRAGONS).map(([a, b]) => C([...WINDS.flatMap((w) => [w, w]), ...rep(a, 3), ...rep(b, 3)], [a, b]))
});

// WINDS
const windyPungs = (nums: number[] | null): (() => Cand[]) => () => {
	const out: Cand[] = [];
	const ns = nums ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
	for (const a of ns) for (const b of nums ? [a] : ns) for (const c of nums ? [a] : ns)
		for (const w of WINDS) {
			const ps = [t(BAM, a), t(CHR, b), t(CIR, c)];
			out.push(C([...ESWN, w, ...ps.flatMap((p) => rep(p, 3))], ps));
		}
	return out;
};
add({ id: 'windyOnes', name: 'Windy Ones', group: 'Winds', desc: 'One of each wind (one paired) plus a pung of 1s in each suit', value: 1000, fishing: 400, expose: 1, gen: windyPungs([1]) });
add({ id: 'windyNines', name: 'Windy Nines', group: 'Winds', desc: 'One of each wind (one paired) plus a pung of 9s in each suit', value: 1000, fishing: 400, expose: 1, gen: windyPungs([9]) });
add({ id: 'threeSisters', name: 'Three Sisters', group: 'Winds', desc: 'One of each wind (one paired) plus a pung of 3s in each suit', value: 1000, fishing: 400, expose: 2, gen: windyPungs([3]) });
add({ id: 'sevenBrothers', name: 'Seven Brothers', group: 'Winds', desc: 'One of each wind (one paired) plus a pung of 7s in each suit', value: 1000, fishing: 400, expose: 2, gen: windyPungs([7]) });
add({ id: 'windvane', name: 'Windvane', group: 'Winds', desc: 'One of each wind (one paired) plus a pung in each suit', value: 1000, fishing: 400, expose: 2, gen: windyPungs(null) });
add({
	id: 'civilWar', name: 'Civil War', group: 'Winds', desc: 'Pungs of North and South, 1-1-6-8 in one suit and 1-5-6-8 in another', value: 1500, fishing: 600, expose: 0,
	gen: () => SUITS.flatMap((a) => SUITS.filter((b) => b !== a).map((b) => C([...rep(N, 3), ...rep(S, 3), t(a, 1), t(a, 1), t(a, 6), t(a, 8), t(b, 1), t(b, 5), t(b, 6), t(b, 8)], [N, S])))
});
add({
	id: 'upYouGo', name: 'Up You Go', group: 'Winds', desc: 'One of each wind plus 2, 44, 666, 8888 in one suit', value: 2000, fishing: 800, expose: 0,
	gen: () => SUITS.map((s) => C([...ESWN, t(s, 2), ...rep(t(s, 4), 2), ...rep(t(s, 6), 3), ...rep(t(s, 8), 4)], [t(s, 8)]))
});
add({
	id: 'downYouGo', name: 'Down You Go', group: 'Winds', desc: 'One of each wind plus 2222, 444, 66, 8 in one suit', value: 2000, fishing: 800, expose: 0,
	gen: () => SUITS.map((s) => C([...ESWN, ...rep(t(s, 2), 4), ...rep(t(s, 4), 3), ...rep(t(s, 6), 2), t(s, 8)], [t(s, 2)]))
});
add({
	id: 'fourBlessings', name: 'Four Blessings', group: 'Winds', desc: 'A pung of every wind plus any pair', value: 1500, fishing: 600, expose: 2,
	gen: () => Array.from({ length: 34 }, (_, k) => k).filter((k) => !WINDS.includes(k)).map((p) => C([...WINDS.flatMap((w) => rep(w, 3)), p, p], WINDS))
});

// DRAGONS
add({
	id: 'dragonfly', name: 'Dragonfly', group: 'Dragons', desc: 'One of each dragon, a pung in each suit and a pair', value: 1000, fishing: 400, expose: 1,
	gen: () => {
		const out: Cand[] = [];
		for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
			const ps = [t(BAM, a), t(CHR, b), t(CIR, c)];
			for (let p = 0; p < 27; p++) if (!ps.includes(p)) out.push(C([...GRW, ...ps.flatMap((x) => rep(x, 3)), p, p], ps));
		}
		return out;
	}
});
const pungsAndPair = (suit: number, pungs: number, pairFrom: number[], extra: number[], extraPungs: number[], allowChow = false) => {
	const out: Cand[] = [];
	for (const ps of choose(run(suit, 1, 9), pungs))
		for (const p of pairFrom) if (!ps.includes(p)) out.push(C([...extra, ...ps.flatMap((k) => rep(k, 3)), p, p], [...extraPungs, ...ps]));
	if (allowChow) {
		for (const ps of choose(run(suit, 1, 9), pungs - 1))
			for (let n = 1; n <= 7; n++)
				for (const p of pairFrom) {
					const ch = [t(suit, n), t(suit, n + 1), t(suit, n + 2)];
					const tiles = [...extra, ...ps.flatMap((k) => rep(k, 3)), ...ch, p, p];
					const cnt = new Map<number, number>();
					for (const k of tiles) cnt.set(k, (cnt.get(k) ?? 0) + 1);
					if ([...cnt.values()].every((v) => v <= 4)) out.push(C(tiles, [...extraPungs, ...ps]));
				}
	}
	return out;
};
add({
	id: 'threeGreatScholars', name: 'Three Great Scholars', group: 'Dragons', desc: 'Pungs of all three dragons plus a pung or chow and a pair in one suit', value: 1500, fishing: 600, expose: 2,
	gen: () => SUITS.flatMap((s) => pungsAndPair(s, 1, run(s, 1, 9), [...rep(RD, 3), ...rep(GD, 3), ...rep(WD, 3)], DRAGONS, true))
});
add({ id: 'greenJade', name: 'Green Jade', group: 'Dragons', desc: 'A pung of Green dragons plus three pungs and a pair in Bamboo', value: 1000, fishing: 400, expose: 2, gen: () => pungsAndPair(BAM, 3, run(BAM, 1, 9), rep(GD, 3), [GD]) });
add({ id: 'redCoral', name: 'Red Coral', group: 'Dragons', desc: 'A pung of Red dragons plus three pungs and a pair in Characters', value: 1000, fishing: 400, expose: 2, gen: () => pungsAndPair(CHR, 3, run(CHR, 1, 9), rep(RD, 3), [RD]) });
add({ id: 'whiteOpal', name: 'White Opal', group: 'Dragons', desc: 'A pung of White dragons plus three pungs and a pair in Circles', value: 1000, fishing: 400, expose: 2, gen: () => pungsAndPair(CIR, 3, run(CIR, 1, 9), rep(WD, 3), [WD]) });
const sub = (all: number[], from: number[]) => all.filter((k) => from.includes(k));
const greenOnly = (n: number, extra: number[], extraPungs: number[], chow = false) => () => {
	// pungs and pair must all be green bamboos (2, 3, 4, 6, 8); the chow option is 234
	const out: Cand[] = [];
	for (const ps of choose(GREEN_BAM, n)) for (const p of GREEN_BAM) if (!ps.includes(p)) out.push(C([...extra, ...ps.flatMap((k) => rep(k, 3)), p, p], [...extraPungs, ...ps]));
	if (chow) for (const ps of choose(GREEN_BAM, n - 1)) for (const p of GREEN_BAM) {
		const tiles = [...extra, ...ps.flatMap((k) => rep(k, 3)), t(BAM, 2), t(BAM, 3), t(BAM, 4), p, p];
		const cnt = new Map<number, number>();
		for (const k of tiles) cnt.set(k, (cnt.get(k) ?? 0) + 1);
		if ([...cnt.values()].every((v) => v <= 4)) out.push(C(tiles, [...extraPungs, ...ps]));
	}
	return out;
};
add({ id: 'imperialJade', name: 'Imperial Jade', group: 'Dragons', desc: 'A pung of Green dragons plus three pungs (or a 234 chow) and a pair, all green bamboos', value: 2000, fishing: 800, expose: 2, gen: greenOnly(3, rep(GD, 3), [GD], true) });
add({ id: 'lilyOfTheValley', name: 'Lily of the Valley', group: 'Dragons', desc: 'Pungs of Green and White dragons plus two pungs and a pair of green bamboos', value: 2000, fishing: 800, expose: 2, gen: greenOnly(2, [...rep(GD, 3), ...rep(WD, 3)], [GD, WD]) });
add({
	id: 'lillypilly', name: 'Lillypilly', group: 'Dragons', desc: 'A pung of Green dragons, a pair of White dragons and three pungs in Circles', value: 1000, fishing: 400, expose: 1,
	gen: () => choose(run(CIR, 1, 9), 3).map((ps) => C([...rep(GD, 3), WD, WD, ...ps.flatMap((k) => rep(k, 3))], [GD, ...ps]))
});
add({
	id: 'redWaratah', name: 'Red Waratah', group: 'Dragons', desc: 'A pung of Red dragons, a pair of Green dragons, a pung of red bamboos (1, 5, 7, 9) and a pung each in Circles and Characters', value: 1000, fishing: 400, expose: 2,
	gen: () => RED_BAM.flatMap((r) => run(CIR, 1, 9).flatMap((c) => run(CHR, 1, 9).map((h) => C([...rep(RD, 3), GD, GD, ...rep(r, 3), ...rep(c, 3), ...rep(h, 3)], [RD, r, c, h]))))
});
const bamPungs = (n: number, pairFrom: number[], extra: number[], extraPungs: number[], pungFrom = run(BAM, 1, 9)) => () => {
	const out: Cand[] = [];
	for (const ps of choose(pungFrom, n)) for (const p of pairFrom) if (!ps.includes(p)) out.push(C([...extra, ...ps.flatMap((k) => rep(k, 3)), p, p], [...extraPungs, ...ps]));
	return out;
};
add({ id: 'rubyJade', name: 'Ruby Jade', group: 'Dragons', desc: 'Pungs of Red and Green dragons plus two pungs and a pair of red and green bamboos', value: 1000, fishing: 400, expose: 2, gen: bamPungs(2, run(BAM, 1, 9), [...rep(RD, 3), ...rep(GD, 3)], [RD, GD]) });
add({ id: 'royalRuby', name: 'Royal Ruby', group: 'Dragons', desc: 'A pung of Red dragons plus three pungs and a pair of red bamboos (1, 5, 7, 9), no chow', value: 2000, fishing: 800, expose: 2, gen: bamPungs(3, RED_BAM, rep(RD, 3), [RD], RED_BAM) });
add({ id: 'redLily', name: 'Red Lily', group: 'Dragons', desc: 'Pungs of Red and White dragons plus two pungs and a pair of red bamboos', value: 2000, fishing: 800, expose: 2, gen: bamPungs(2, RED_BAM, [...rep(RD, 3), ...rep(WD, 3)], [RD, WD], RED_BAM) });
const suitPungs = (suit: number, allowed: number[], extra: number[], extraPungs: number[]) => () => {
	const out: Cand[] = [];
	for (const ps of choose(allowed, 3)) for (const p of allowed) if (!ps.includes(p)) out.push(C([...extra, ...ps.flatMap((k) => rep(k, 3)), p, p], [...extraPungs, ...ps]));
	return out;
};
add({ id: 'blueMountains', name: 'Blue Mountains', group: 'Dragons', desc: 'A pung of Green dragons plus three pungs and a pair of blue circles (2, 3, 4, 5, 8, 9)', value: 1000, fishing: 400, expose: 2, gen: suitPungs(CIR, BLUE_CIR, rep(GD, 3), [GD]) });
add({ id: 'whiteElephant', name: 'White Elephant', group: 'Dragons', desc: 'A pung of White dragons plus three pungs and a pair of even Circles', value: 1000, fishing: 400, expose: 2, gen: suitPungs(CIR, [2, 4, 6, 8].map((n) => t(CIR, n)), rep(WD, 3), [WD]) });
add({ id: 'drivenSnow', name: 'Driven Snow', group: 'Dragons', desc: 'A pung of White dragons plus three pungs and a pair of odd Characters', value: 1000, fishing: 400, expose: 2, gen: suitPungs(CHR, [1, 3, 5, 7, 9].map((n) => t(CHR, n)), rep(WD, 3), [WD]) });
add({ id: 'dragonsScales', name: 'Dragon’s Scales', group: 'Dragons', desc: 'A pung of Red dragons plus three pungs and a pair of even Characters', value: 1000, fishing: 400, expose: 2, gen: suitPungs(CHR, [2, 4, 6, 8].map((n) => t(CHR, n)), rep(RD, 3), [RD]) });

// ALL HONOURS
add({
	id: 'uniqueWonder', name: 'Unique Wonder', group: 'All Honours', desc: 'One of each wind and dragon, the 1 and 9 of each suit, and any one of them paired', value: 2000, fishing: 800, expose: 0,
	gen: () => {
		const base = [...HONOURS, ...SUITS.flatMap((s) => [t(s, 1), t(s, 9)])];
		return base.map((x) => C([...base, x]));
	}
});
add({
	id: 'allWindsDragons', name: 'All Winds and Dragons', group: 'All Honours', desc: 'Four pungs and a pair, all winds and dragons', value: 1000, fishing: 400, expose: 2,
	gen: () => choose(HONOURS, 4).flatMap((ps) => HONOURS.filter((h) => !ps.includes(h)).map((p) => C([...ps.flatMap((k) => rep(k, 3)), p, p], ps)))
});
add({
	id: 'headsAndTails', name: 'Heads and Tails', group: 'All Honours', desc: 'Four pungs and a pair of 1s and 9s, any suits', value: 1000, fishing: 400, expose: 2,
	gen: () => {
		const ends = SUITS.flatMap((s) => [t(s, 1), t(s, 9)]);
		return choose(ends, 4).flatMap((ps) => ends.filter((h) => !ps.includes(h)).map((p) => C([...ps.flatMap((k) => rep(k, 3)), p, p], ps)));
	}
});

// WINDS & DRAGONS WITH SUITS
add({
	id: 'dragonsRun', name: 'Dragon’s Run', group: 'With suits', desc: 'One of each dragon, a pair of winds and 1–9 in one suit', value: 1500, fishing: 600, expose: 0,
	gen: () => SUITS.flatMap((s) => WINDS.map((w) => C([...GRW, w, w, ...run(s, 1, 9)])))
});
const eachSuitPungs2to8 = (head: number[], headPungs: number[]) => () => {
	const out: Cand[] = [];
	for (let a = 2; a <= 8; a++) for (let b = 2; b <= 8; b++) for (let c = 2; c <= 8; c++) {
		const ps = [t(BAM, a), t(CHR, b), t(CIR, c)];
		out.push(C([...head, ...ps.flatMap((k) => rep(k, 3))], [...headPungs, ...ps]));
	}
	return out;
};
add({ id: 'sunrise', name: 'Sunrise', group: 'With suits', desc: 'A pung of East wind, a pair of White dragons and a pung in each suit, no 1s or 9s', value: 1000, fishing: 400, expose: 1, gen: eachSuitPungs2to8([...rep(E, 3), WD, WD], [E]) });
add({ id: 'sunset', name: 'Sunset', group: 'With suits', desc: 'A pung of West wind, a pair of Red dragons and a pung in each suit, no 1s or 9s', value: 1000, fishing: 400, expose: 1, gen: eachSuitPungs2to8([...rep(W, 3), RD, RD], [W]) });
add({
	id: 'numbersInParallel', name: 'Numbers in Parallel', group: 'With suits', desc: 'A pung and a pair of winds or dragons plus the same number pung in each suit, no 1s or 9s', value: 1500, fishing: 600, expose: 2,
	gen: () => {
		const out: Cand[] = [];
		for (const grp of [WINDS, DRAGONS]) for (const p of grp) for (const q of grp) if (p !== q) for (let n = 2; n <= 8; n++) {
			const ps = SUITS.map((s) => t(s, n));
			out.push(C([...rep(p, 3), q, q, ...ps.flatMap((k) => rep(k, 3))], [p, ...ps]));
		}
		return out;
	}
});
add({
	id: 'numbersDoubled', name: 'Numbers Doubled', group: 'With suits', desc: 'A pair of winds or dragons plus pungs of two numbers in the same two suits, no 1s or 9s', value: 1500, fishing: 600, expose: 2,
	gen: () => {
		const out: Cand[] = [];
		for (const h of HONOURS) for (const [a, b] of pairsOf(SUITS)) for (const [m, n] of pairsOf([2, 3, 4, 5, 6, 7, 8])) {
			const ps = [t(a, m), t(b, m), t(a, n), t(b, n)];
			out.push(C([h, h, ...ps.flatMap((k) => rep(k, 3))], ps));
		}
		return out;
	}
});

// ONE SUIT / THREE SUITS
add({
	id: 'chineseOdds', name: 'Chinese Odds', group: 'One suit', desc: 'Four pungs and a pair of odd numbers, all one suit', value: 1500, fishing: 600, expose: 1,
	gen: () => SUITS.flatMap((s) => { const odd = [1, 3, 5, 7, 9].map((n) => t(s, n)); return choose(odd, 4).map((ps) => C([...ps.flatMap((k) => rep(k, 3)), ...odd.filter((k) => !ps.includes(k)).flatMap((k) => [k, k])], ps)); })
});
add({
	id: 'oddsAndEvens', name: 'Odds & Evens', group: 'Three suits', desc: 'The odd numbers in two suits and the even numbers in the third, one of each', value: 1500, fishing: 600, expose: 0,
	gen: () => SUITS.map((ev) => C([...SUITS.filter((s) => s !== ev).flatMap((s) => [1, 3, 5, 7, 9].map((n) => t(s, n))), ...[2, 4, 6, 8].map((n) => t(ev, n))]))
});
add({
	id: 'robin', name: 'Robin', group: 'Three suits', desc: 'A chow in one suit, two chows in another, and a chow and a pair in the third', value: 500, fishing: 200, expose: 0,
	check: (c) => perms3.some(([a, b, d]) => splits(c, [`chow:${a}`, `chow:${b}`, `chow:${b}`, `chow:${d}`, `pair:${d}`]))
});

// CALCULATED (points and doubles)
add({ id: 'ordinary', name: 'Ordinary Mah Jong', group: 'Pungs', desc: 'Four pungs (or three and a chow) and a pair, one suit, winds and dragons allowed — scored by points', value: 'calc', fishing: 0, expose: 1 });
add({ id: 'purity', name: 'Purity', group: 'Pungs', desc: 'Four pungs (or three and a chow) and a pair, one suit, no winds or dragons — scored by points', value: 'calc', fishing: 0, expose: 1 });
add({ id: 'allHonour', name: 'All Honour Hand', group: 'Pungs', desc: 'Four pungs and a pair of winds, dragons and the 1s and 9s of one suit — scored by points', value: 'calc', fishing: 0, expose: 1 });

export const BOOK_HANDS = HANDS;
void OWN;
void ownWindOf;
void each;
void isTerminal;
void sub;

// ---- the candidate table: every tile set a listed hand can take ----
type Entry = { hand: BookHand; cand: Cand & { own?: number } };
let TABLE: Map<string, Entry[]> | null = null;
let ALL: { hand: BookHand; cand: Cand & { own?: number }; c: Int8Array }[] = [];
const keyOf = (c: ArrayLike<number>) => Array.prototype.join.call(c, '');
function table() {
	if (TABLE) return TABLE;
	TABLE = new Map();
	ALL = [];
	for (const hand of HANDS) {
		if (!hand.gen) continue;
		for (const cand of hand.gen()) {
			const c = new Int8Array(34);
			for (const k of cand.tiles) c[k]++;
			if (cand.tiles.length !== 14 || c.some((x) => x > 4)) continue;
			const key = keyOf(c);
			const list = TABLE.get(key) ?? [];
			list.push({ hand, cand });
			TABLE.set(key, list);
			ALL.push({ hand, cand, c });
		}
	}
	return TABLE;
}

const countsOf = (tiles: Tile[]) => {
	const c = new Array(34).fill(0);
	for (const x of tiles) {
		const i = KIND_INDEX[x.k];
		if (i !== undefined) c[i]++;
	}
	return c;
};

export interface BookMatch {
	hand: BookHand;
	value: number;
	fishing: number;
	halved: boolean;
	lines?: ScoreLine[];
	summary?: string;
}

/** melds as the matcher sees them: kinds of exposed pungs/kongs, and whether anything else is exposed */
function meldInfo(melds: Meld[]) {
	const exposedPungs: number[] = [];
	let exposedOther = false;
	const kongs: number[] = [];
	for (const m of melds) {
		const k = KIND_INDEX[m.tiles[0].k];
		if (m.type === 'kong') kongs.push(k);
		if (m.concealed) continue;
		if (m.type === 'chow') exposedOther = true;
		else exposedPungs.push(k);
	}
	return { exposedPungs, exposedOther, kongs, anyExposed: exposedPungs.length > 0 || exposedOther };
}

/** does this candidate allow these exposed pungs? */
function exposureOk(hand: BookHand, cand: Cand, info: ReturnType<typeof meldInfo>) {
	if (!info.anyExposed) return true;
	if (info.exposedOther || hand.expose === 0) return false;
	const left = [...cand.pungs];
	for (const k of info.exposedPungs) {
		const i = left.indexOf(k);
		if (i < 0) return false;
		left.splice(i, 1);
	}
	return true;
}

/** the 14 tiles to match: hand + melds, with each kong counted as a pung (also tried as four) */
function fourteen(concealed: Tile[], melds: Meld[]): number[][] {
	const c = countsOf([...concealed, ...melds.flatMap((m) => m.tiles)]);
	const kongs = melds.filter((m) => m.type === 'kong').map((m) => KIND_INDEX[m.tiles[0].k]);
	const out: number[][] = [];
	// every way to count each kong as 3 or 4 tiles, keeping 14 in total
	const n = kongs.length;
	for (let mask = 0; mask < 1 << n; mask++) {
		const x = c.slice();
		kongs.forEach((k, i) => {
			if (!(mask & (1 << i))) x[k]--;
		});
		if (x.reduce((a, b) => a + b, 0) === 14) out.push(x);
	}
	return out;
}

/** every listed hand these tiles make, best first */
export function bookMatches(ctx: { concealed: Tile[]; melds: Meld[]; selfDraw: boolean; seatWind: number }, calc?: (hand: BookHand) => { lines: ScoreLine[]; total: number; summary: string } | null): BookMatch[] {
	const info = meldInfo(ctx.melds);
	const res: BookMatch[] = [];
	const T = table();
	const anyWind = ctx.seatWind < 0; // shape check only: any seat's wind will do
	const own = 27 + ctx.seatWind;
	for (const c of fourteen(ctx.concealed, ctx.melds)) {
		for (const e of T.get(keyOf(c)) ?? []) {
			if (!anyWind && e.cand.own !== undefined && e.cand.own !== own) continue;
			if (e.hand.selfDrawOnly && (!ctx.selfDraw || info.anyExposed)) continue;
			if (!exposureOk(e.hand, e.cand, info)) continue;
			const halved = info.anyExposed && e.hand.expose === 1;
			const base = e.hand.valueFor ? e.hand.valueFor(c) : (e.hand.value as number);
			res.push({ hand: e.hand, value: halved ? base / 2 : base, fishing: halved ? e.hand.fishing / 2 : e.hand.fishing, halved });
		}
		for (const hand of HANDS) {
			if (!hand.check) continue;
			if (info.anyExposed || ctx.melds.length) continue; // checked hands are concealed only
			if (hand.selfDrawOnly && !ctx.selfDraw) continue;
			// own-wind chow hands: only your own wind counts
			const ownOnly = hand.id === 'hoveringAngel' || hand.id === 'littleBrother' || hand.id === 'professors';
			if (ownOnly && !(anyWind ? WINDS.some((w) => ownWindCheck(hand, c, w)) : ownWindCheck(hand, c, own))) continue;
			if (hand.check(c)) res.push({ hand, value: hand.value as number, fishing: hand.fishing, halved: false });
		}
	}
	if (calc) for (const hand of HANDS.filter((h) => h.value === 'calc')) {
		const r = calc(hand);
		if (r) res.push({ hand, value: r.total, fishing: 0, halved: false, lines: r.lines, summary: r.summary });
	}
	// dedupe by hand, keep the best value
	const best = new Map<string, BookMatch>();
	for (const m of res) if (!best.has(m.hand.id) || best.get(m.hand.id)!.value < m.value) best.set(m.hand.id, m);
	// equal values: the more specific hand wins the name (Purity over Ordinary Mah Jong)
	return [...best.values()].sort((a, b) => b.value - a.value || (a.hand.id === 'ordinary' ? 1 : 0) - (b.hand.id === 'ordinary' ? 1 : 0));
}

function ownWindCheck(hand: BookHand, c: number[], own: number): boolean {
	const r = c.slice();
	if (hand.id === 'hoveringAngel') return DRAGONS.some((d) => each3(r, (x) => splits(x, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`]), [own, own, own, d, d]));
	if (hand.id === 'littleBrother') return each3(r, (x) => splits(x, [`chow:${BAM}`, `chow:${CHR}`, `chow:${CIR}`, 'chow:*']), [own, own]);
	if (hand.id === 'professors') return each3(r, (x) => splits(x, ['mixed', 'mixed', 'mixed']), [...GRW, own, own]);
	return true;
}

// ---- calculated hands ----
function calcFor(ctx: WinContext) {
	return (hand: BookHand) => {
		const tiles = [...ctx.concealed, ...ctx.melds.flatMap((m) => m.tiles)].map((x) => KIND_INDEX[x.k]).filter((x) => x !== undefined);
		const suits = new Set(tiles.filter((k) => k < 27).map((k) => Math.floor(k / 9)));
		const honours = tiles.some((k) => k >= 27);
		const chowsOk = (it: Interpretation) => it.groups.filter((g) => g.type === 'chow').length <= 1;
		if (hand.id === 'ordinary') {
			if (suits.size !== 1) return null;
			return scoreCalculated(ctx, chowsOk);
		}
		if (hand.id === 'purity') {
			if (suits.size !== 1 || honours) return null;
			return scoreCalculated(ctx, chowsOk);
		}
		if (hand.id === 'allHonour') {
			if (suits.size > 1 || !tiles.every((k) => k >= 27 || k % 9 === 0 || k % 9 === 8)) return null;
			return scoreCalculated(ctx, (it) => it.groups.every((g) => g.type !== 'chow'));
		}
		return null;
	};
}

export const BOOK_LIMIT = 1000;

export function scoreBook(ctx: WinContext): Scored {
	const ms = bookMatches(ctx, calcFor(ctx));
	if (!ms.length) return { valid: false, reason: 'Not one of the hands in the book', lines: [], total: 0, summary: '' };
	const m = ms[0];
	const tier = (v: number) => (v >= 2000 ? 'Double limit' : v >= 1500 ? 'Middle limit' : v >= 1000 ? 'Limit' : v >= 500 ? 'Half limit' : '');
	if (m.lines) {
		return { valid: true, lines: [{ name: m.hand.name, value: '' }, ...m.lines], total: m.value, summary: `${m.hand.name} · ${m.summary}` };
	}
	const lines: ScoreLine[] = [{ name: m.hand.name, value: m.value }];
	if (m.halved) lines.push({ name: 'Exposed: half value', value: '÷2' });
	return { valid: true, lines, total: m.value, summary: `${m.hand.name} · ${tier(m.value) ? `${tier(m.value)} · ` : ''}${m.value}` };
}

/** for the engine: can these tiles be declared? (shape only; scoring confirms) */
export function bookComplete(concealed: Tile[], melds: Meld[]): boolean {
	if (concealed.length + melds.length * 3 !== 14) return false;
	return bookMatches({ concealed, melds, selfDraw: true, seatWind: -1 }).length > 0 || calcShape(concealed, melds);
}
/** the calculated hands' shape: four sets and a pair, all one suit (+ honours), at most one chow */
function calcShape(concealed: Tile[], melds: Meld[]) {
	const tilesK = [...concealed, ...melds.flatMap((m) => m.tiles)].map((x) => KIND_INDEX[x.k]);
	if (new Set(tilesK.filter((k) => k < 27).map((k) => Math.floor(k / 9))).size > 1) return false;
	const c = countsOf(concealed);
	return shantenStandard(c, 4 - melds.length, 0) === -1;
}

// ---- distance to the nearest hand (bots, hints, fishing) ----
/** tiles still missing for the closest listed hand, with what the melds allow; 0 = complete */
export function bookDistance(concealed: Tile[], melds: Meld[], seatWind: number, skipTable = false): { missing: number; targets: number } {
	table();
	const info = meldInfo(melds);
	const own = 27 + seatWind;
	const all = countsOf([...concealed, ...melds.flatMap((m) => m.tiles)]);
	for (const m of melds) if (m.type === 'kong') all[KIND_INDEX[m.tiles[0].k]]--; // a kong fills a pung slot
	let missing = 99;
	let targets = 0;
	for (const e of skipTable ? [] : ALL) {
		if (e.cand.own !== undefined && e.cand.own !== own) continue;
		if (!exposureOk(e.hand, e.cand, info)) continue;
		let d = 0;
		const c = e.c;
		for (let k = 0; k < 34; k++) {
			if (c[k] > all[k]) {
				d += c[k] - all[k];
				if (d > missing) break;
			}
		}
		if (d < missing) {
			missing = d;
			targets = 1;
		} else if (d === missing) targets++;
	}
	// one-suit calculated hands: standard shape distance on one suit + honours
	if (!info.exposedOther) {
		for (let s = 0; s < 3; s++) {
			const c = all.slice();
			let off = 0;
			for (let k = 0; k < 27; k++) if (Math.floor(k / 9) !== s) {
				off += c[k];
				c[k] = 0;
			}
			if (melds.some((m) => { const k = KIND_INDEX[m.tiles[0].k]; return k < 27 && Math.floor(k / 9) !== s; })) continue;
			const meldSets = melds.length;
			const conc = c.slice();
			for (const m of melds) { const k = KIND_INDEX[m.tiles[0].k]; conc[k] -= 3; }
			const sh = shantenStandard(conc.map((x) => Math.max(0, x)), 4 - meldSets, 0);
			const d = sh + 1 + (off > 0 ? 0 : 0);
			if (d < missing) {
				missing = d;
				targets = 1;
			} else if (d === missing) targets++;
		}
	}
	// seven-pair families (checked hands)
	const pairs = (allowed: number[]) => {
		const have = allowed.map((k) => Math.min(2, all[k])).sort((a, b) => b - a).slice(0, 7);
		return 14 - have.reduce((a, b) => a + b, 0);
	};
	if (!melds.length) {
		for (let s = 0; s < 3; s++) missing = Math.min(missing, pairs([...run(s, 1, 9), ...HONOURS]));
		missing = Math.min(missing, pairs([...HONOURS, ...SUITS.flatMap((s) => [t(s, 1), t(s, 9)])]));
	}
	return { missing, targets };
}

/** for each kind you could throw from these 14 tiles: what bookDistance would say afterwards.
 *  One pass over the hand table instead of one per discard (bots call this every turn). */
export function bookDiscardDistances(concealed: Tile[], melds: Meld[], seatWind: number): Map<string, { missing: number; targets: number }> {
	table();
	const info = meldInfo(melds);
	const own = 27 + seatWind;
	const all = countsOf([...concealed, ...melds.flatMap((m) => m.tiles)]);
	for (const m of melds) if (m.type === 'kong') all[KIND_INDEX[m.tiles[0].k]]--;
	const kinds = [...new Set(concealed.map((x) => x.k))].filter((k) => KIND_INDEX[k] !== undefined);
	const idx = kinds.map((k) => KIND_INDEX[k]);
	const best = idx.map(() => ({ missing: 99, targets: 0 }));
	let floor = 99; // best missing seen for any discard, to skip hopeless candidates
	for (const e of ALL) {
		if (e.cand.own !== undefined && e.cand.own !== own) continue;
		if (!exposureOk(e.hand, e.cand, info)) continue;
		let d = 0;
		const c = e.c;
		for (let k = 0; k < 34; k++) {
			if (c[k] > all[k]) {
				d += c[k] - all[k];
				if (d > floor + 1) break;
			}
		}
		if (d > floor + 1) continue;
		for (let i = 0; i < idx.length; i++) {
			// throwing a tile this hand needs costs one more missing tile
			const m = d + (all[idx[i]] <= c[idx[i]] ? 1 : 0);
			const b = best[i];
			if (m < b.missing) {
				b.missing = m;
				b.targets = 1;
			} else if (m === b.missing) b.targets++;
			if (m < floor) floor = m;
		}
	}
	const out = new Map<string, { missing: number; targets: number }>();
	kinds.forEach((k, i) => {
		const rest = concealed.slice();
		rest.splice(rest.findIndex((x) => x.k === k), 1);
		// calculated and seven-pair hands: cheap enough per discard
		const extra = bookDistance(rest, melds, seatWind, true).missing;
		const b = best[i];
		out.set(k, extra < b.missing ? { missing: extra, targets: 1 } : b);
	});
	return out;
}

/** fishing value if these 13 tiles are one away from a fixed-value hand when the wall runs out */
export function fishingValue(concealed: Tile[], melds: Meld[], seatWind: number): { name: string; value: number } | null {
	table();
	const info = meldInfo(melds);
	const own = 27 + seatWind;
	const all = countsOf([...concealed, ...melds.flatMap((m) => m.tiles)]);
	for (const m of melds) if (m.type === 'kong') all[KIND_INDEX[m.tiles[0].k]]--;
	let best: { name: string; value: number } | null = null;
	for (const e of ALL) {
		if (e.cand.own !== undefined && e.cand.own !== own) continue;
		if (e.hand.selfDrawOnly || !exposureOk(e.hand, e.cand, info)) continue;
		let d = 0;
		for (let k = 0; k < 34 && d <= 1; k++) if (e.c[k] > all[k]) d += e.c[k] - all[k];
		if (d !== 1) continue;
		const v = info.anyExposed && e.hand.expose === 1 ? e.hand.fishing / 2 : e.hand.fishing;
		if (!best || v > best.value) best = { name: e.hand.name, value: v };
	}
	// checked hands: one tile away = adding some tile completes it
	if (!melds.length) {
		const c = countsOf(concealed);
		for (const hand of HANDS) {
			if (!hand.check || hand.selfDrawOnly) continue;
			for (let k = 0; k < 34; k++) {
				if (c[k] >= 4) continue;
				c[k]++;
				const ok = (hand.id === 'hoveringAngel' || hand.id === 'littleBrother' || hand.id === 'professors') ? ownWindCheck(hand, c, own) : hand.check(c);
				c[k]--;
				if (ok) {
					if (!best || hand.fishing > best.value) best = { name: hand.name, value: hand.fishing };
					break;
				}
			}
		}
	}
	return best;
}

const seatWindOf = (s: GameState, seat: number) => (seat - s.dealer + 4) % 4;

export const book: Variant = {
	id: 'international',
	name: 'International Mahjong',
	tagline: 'The Australian club game: dozens of named hands, from Wriggly Snake to Imperial Jade.',
	handSize: 13,
	sets: 4,
	wall: { flowers: true, jokers: 0, redFives: false },
	reserve: 0,
	allowChow: false,
	multipleWinners: false,
	startScore: 0,
	riichi: false,
	goulash: false,
	streakOnDraw: false,
	bustOut: false,
	rotateDealer: true,
	shantenSpecials: { pairs: true, orphans: true },
	complete: bookComplete,
	distance: (c, m, w) => bookDistance(c, m, w),
	discardDistances: bookDiscardDistances,
	scoreWin: scoreBook,
	settleWin(state, wins) {
		const deltas = [0, 0, 0, 0];
		const w = wins[0];
		for (let s = 0; s < 4; s++) {
			if (s === w.seat) continue;
			deltas[s] -= w.scored.total;
			deltas[w.seat] += w.scored.total;
		}
		return { deltas, notes: ['Each player pays the winner the value of the hand.'] };
	},
	settleDraw(state) {
		const deltas = [0, 0, 0, 0];
		const notes: string[] = [];
		state.players.forEach((p, seat) => {
			const f = fishingValue(p.hand, p.melds, seatWindOf(state, seat));
			if (!f || !f.value) return;
			notes.push(`${p.name} was fishing for ${f.name}: collects ${f.value} from each player.`);
			for (let o = 0; o < 4; o++) {
				if (o === seat) continue;
				deltas[o] -= f.value;
				deltas[seat] += f.value;
			}
		});
		if (!notes.length) notes.push('Wall game: nobody was fishing. No score.');
		return { deltas, notes, dealerKeeps: false };
	},
	rulesSummary: [
		'The Australian club game from The Mah Jong Player’s Companion (Thompson & Maloney). 144 tiles with flowers and seasons.',
		'A win must be one of the named hands listed below. Most score a fixed amount: half limit 500, limit 1,000, middle limit 1,500, double limit 2,000.',
		'Ordinary Mah Jong, Purity and All Honour are scored by points and doubles, up to 1,000. There’s no extra double for being one suit.',
		'Hands marked “exposed OK” may have pungs claimed and shown at full value; “exposed half” hands may too, at half value. All other hands stay hidden until you claim the winning tile.',
		'No chows may be claimed: you can only take a discard for a pung, a kong, or the tile that wins.',
		'Each player pays the winner the value of the hand.',
		'Fishing: if the wall runs out while you’re one tile from a hand, you collect its fishing value from each player.',
		'Each player is East once a round, so a round is four hands.'
	],
	scoringTable: HANDS.map((h) => ({
		name: `${h.name} — ${h.desc}`,
		value: h.value === 'calc' ? 'Points' : `${h.value}${h.valueFor ? '+' : ''}`,
		note: `${h.expose === 2 ? 'Exposed OK' : h.expose === 1 ? 'Exposed half' : 'Concealed'}${h.fishing ? ` · fishing ${h.fishing}` : ''}${h.selfDrawOnly ? ' · all from the wall' : ''}`
	}))
};
