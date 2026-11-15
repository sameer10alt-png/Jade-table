import { decompose, shantenKokushi } from '../analysis';
import { handCounts, interpretations, winningKinds, type Interpretation, type ScoreGroup } from '../hand';
import { idxIsDragon, idxIsWind, idxTermOrHonor, KIND_INDEX, windIdx } from '../tiles';
import type { GameState, ScoreLine } from '../types';
import type { Scored, Variant, WinContext } from '../variant';

// International Mahjong — Mahjong Competition Rules (MCR, "Chinese Official").
// 81 scoring patterns (fan). A hand needs 8 fan, not counting flowers, to be declared.
// Fans that a bigger fan already implies are not counted again (the exclusion rules).

export const MCR_MINIMUM = 8;
const WIND = ['East', 'South', 'West', 'North'];
const DRAGON = ['Red', 'Green', 'White'];

// counting-array layout: 0-8 bamboo, 9-17 characters, 18-26 circles, 27-30 winds, 31-33 dragons
const suit = (i: number) => (i < 27 ? Math.floor(i / 9) : -1);
const num = (i: number) => (i % 9) + 1;
const GREEN = new Set([1, 2, 3, 5, 7, 32]); // b2 b3 b4 b6 b8, green dragon
const REVERSIBLE = new Set([
	...[2, 4, 5, 6, 8, 9].map((n) => n - 1), // bamboo 2 4 5 6 8 9
	...[1, 2, 3, 4, 5, 8, 9].map((n) => 18 + n - 1), // circles 1 2 3 4 5 8 9
	33 // white dragon
]);

interface Fan {
	id: string;
	name: string;
	v: number;
}

/** Fans removed when a bigger fan is scored (MCR "non-repeat" principle). */
const EXCLUDES: Record<string, string[]> = {
	bigFourWinds: ['bigThreeWinds', 'littleFourWinds', 'allPungs', 'prevalentWind', 'seatWind', 'pungTermHonor'],
	bigThreeDragons: ['littleThreeDragons', 'dragonPung', 'twoDragonPungs'],
	allGreen: ['oneVoidedSuit'],
	nineGates: ['fullFlush', 'concealedHand', 'pungTermHonor', 'noHonors', 'oneVoidedSuit'],
	fourKongs: ['threeKongs', 'twoMeldedKongs', 'twoConcealedKongs', 'meldedKong', 'concealedKong', 'allPungs', 'singleWait'],
	sevenShiftedPairs: ['sevenPairs', 'fullFlush', 'concealedHand', 'singleWait', 'noHonors', 'oneVoidedSuit'],
	thirteenOrphans: ['allTypes', 'allTermHonors', 'concealedHand', 'singleWait'],
	allTerminals: ['allTermHonors', 'allPungs', 'pungTermHonor', 'outsideHand', 'noHonors'],
	littleFourWinds: ['bigThreeWinds', 'pungTermHonor'],
	littleThreeDragons: ['dragonPung', 'twoDragonPungs'],
	allHonors: ['allTermHonors', 'allPungs', 'outsideHand', 'pungTermHonor'],
	fourConcealedPungs: ['allPungs', 'threeConcealedPungs', 'twoConcealedPungs', 'concealedHand'],
	pureTerminalChows: ['fullFlush', 'allChows', 'pureDoubleChow', 'twoTerminalChows', 'noHonors', 'oneVoidedSuit'],
	quadrupleChow: ['pureTripleChow', 'pureDoubleChow', 'tileHog', 'pureShiftedPungs'],
	fourPureShiftedPungs: ['pureShiftedPungs', 'allPungs'],
	fourPureShiftedChows: ['pureShiftedChows', 'shortStraight', 'twoTerminalChows'],
	threeKongs: ['twoMeldedKongs', 'twoConcealedKongs', 'meldedKong', 'concealedKong'],
	allTermHonors: ['allPungs', 'outsideHand', 'pungTermHonor'],
	sevenPairs: ['concealedHand', 'singleWait'],
	greaterHonorsKnitted: ['lesserHonorsKnitted', 'allTypes', 'concealedHand'],
	lesserHonorsKnitted: ['allTypes', 'concealedHand'],
	allEvenPungs: ['allPungs', 'allSimples', 'noHonors'],
	fullFlush: ['noHonors', 'oneVoidedSuit'],
	pureTripleChow: ['pureDoubleChow'],
	upperTiles: ['upperFour', 'noHonors'],
	middleTiles: ['allSimples', 'noHonors'],
	lowerTiles: ['lowerFour', 'noHonors'],
	threeSuitedTerminalChows: ['allChows', 'twoTerminalChows', 'mixedDoubleChow', 'noHonors'],
	allFives: ['allSimples', 'noHonors'],
	upperFour: ['noHonors'],
	lowerFour: ['noHonors'],
	bigThreeWinds: ['pungTermHonor'],
	reversibleTiles: ['oneVoidedSuit'],
	twoConcealedKongs: ['concealedKong', 'twoConcealedPungs'],
	meldedConcealedKongs: ['meldedKong', 'concealedKong'],
	meldedHand: ['singleWait'],
	twoDragonPungs: ['dragonPung'],
	fullyConcealed: ['selfDrawn', 'concealedHand'],
	twoMeldedKongs: ['meldedKong'],
	lastTileDraw: ['selfDrawn'],
	outWithReplacement: ['selfDrawn'],
	robbingKong: ['lastTile'],
	allChows: ['noHonors'],
	allSimples: ['noHonors'],
	threeConcealedPungs: ['twoConcealedPungs']
};

function applyExclusions(fans: Fan[]): Fan[] {
	const present = new Set(fans.map((f) => f.id));
	const drop = new Set<string>();
	for (const id of present) for (const x of EXCLUDES[id] ?? []) drop.add(x);
	return fans.filter((f) => !drop.has(f.id));
}

/** Kinds visible on the table (discards still lying there + exposed melds), for "Last Tile". */
function visibleCount(state: GameState, i: number): number {
	let n = 0;
	state.players.forEach((p, s) => {
		for (const d of p.discards) if (!d.taken && KIND_INDEX[d.tile.k] === i) n++;
		for (const m of p.melds) if (!m.concealed) for (const t of m.tiles) if (KIND_INDEX[t.k] === i) n++;
	});
	return n;
}

/** Hand-wide fans that only depend on which tiles are used (shared by every shape). */
function tileFans(all: number[], fans: Fan[]) {
	const suits = new Set(all.filter((i) => i < 27).map(suit));
	const honors = all.some((i) => i >= 27);
	if (all.every((i) => GREEN.has(i))) fans.push({ id: 'allGreen', name: 'All Green', v: 88 });
	if (all.every((i) => i >= 27)) fans.push({ id: 'allHonors', name: 'All Honors', v: 64 });
	else if (all.every((i) => i < 27 && (num(i) === 1 || num(i) === 9))) fans.push({ id: 'allTerminals', name: 'All Terminals', v: 64 });
	else if (all.every(idxTermOrHonor)) fans.push({ id: 'allTermHonors', name: 'All Terminals and Honors', v: 32 });
	if (suits.size === 1 && !honors) fans.push({ id: 'fullFlush', name: 'Full Flush', v: 24 });
	else if (suits.size === 1 && honors) fans.push({ id: 'halfFlush', name: 'Half Flush', v: 6 });
	if (!honors) {
		const ns = all.map(num);
		if (ns.every((n) => n >= 7)) fans.push({ id: 'upperTiles', name: 'Upper Tiles (7-9)', v: 24 });
		else if (ns.every((n) => n >= 4 && n <= 6)) fans.push({ id: 'middleTiles', name: 'Middle Tiles (4-6)', v: 24 });
		else if (ns.every((n) => n <= 3)) fans.push({ id: 'lowerTiles', name: 'Lower Tiles (1-3)', v: 24 });
		else if (ns.every((n) => n >= 6)) fans.push({ id: 'upperFour', name: 'Upper Four (6-9)', v: 12 });
		else if (ns.every((n) => n <= 4)) fans.push({ id: 'lowerFour', name: 'Lower Four (1-4)', v: 12 });
		if (ns.every((n) => n >= 2 && n <= 8)) fans.push({ id: 'allSimples', name: 'All Simples', v: 2 });
		fans.push({ id: 'noHonors', name: 'No Honors', v: 1 });
	}
	if (all.every((i) => REVERSIBLE.has(i))) fans.push({ id: 'reversibleTiles', name: 'Reversible Tiles', v: 8 });
	if (suits.size === 3 && all.some(idxIsWind) && all.some(idxIsDragon)) fans.push({ id: 'allTypes', name: 'All Types', v: 6 });
	if (suits.size === 2) fans.push({ id: 'oneVoidedSuit', name: 'One Voided Suit', v: 1 });
}

/** Self-draw, last tile, kong replacement, robbing the kong. */
function situationFans(ctx: WinContext, concealedHand: boolean, fans: Fan[]) {
	if (ctx.selfDraw) {
		if (concealedHand) fans.push({ id: 'fullyConcealed', name: 'Fully Concealed Hand', v: 4 });
		else fans.push({ id: 'selfDrawn', name: 'Self-Drawn', v: 1 });
		if (ctx.afterKong) fans.push({ id: 'outWithReplacement', name: 'Out with Replacement Tile', v: 8 });
		if (ctx.lastTile) fans.push({ id: 'lastTileDraw', name: 'Last Tile Draw', v: 8 });
	} else {
		if (concealedHand) fans.push({ id: 'concealedHand', name: 'Concealed Hand', v: 2 });
		if (ctx.lastTile) fans.push({ id: 'lastTileClaim', name: 'Last Tile Claim', v: 8 });
	}
	if (ctx.robbingKong) fans.push({ id: 'robbingKong', name: 'Robbing the Kong', v: 8 });
	const w = KIND_INDEX[ctx.winTile.k];
	if (w !== undefined && !ctx.robbingKong && visibleCount(ctx.state, w) === 3)
		fans.push({ id: 'lastTile', name: 'Last Tile (4th of its kind)', v: 4 });
}

/** Tile Hog: all four of a kind used without declaring a kong. */
function tileHogs(groups: ScoreGroup[], pair: number, fans: Fan[]) {
	const c = new Array(34).fill(0);
	const kongKinds = new Set(groups.filter((g) => g.type === 'kong').map((g) => g.i));
	for (const g of groups) {
		if (g.type === 'chow') for (let d = 0; d < 3; d++) c[g.i + d]++;
		else if (g.type === 'pung') c[g.i] += 3;
	}
	c[pair] += 2;
	for (let i = 0; i < 34; i++) if (c[i] === 4 && !kongKinds.has(i)) fans.push({ id: 'tileHog', name: 'Tile Hog', v: 2 });
}

function evalStandard(ctx: WinContext, it: Interpretation, singleWaitOnly: boolean): Fan[] {
	const fans: Fan[] = [];
	const gs = it.groups;
	const chows = gs.filter((g) => g.type === 'chow');
	const pungs = gs.filter((g) => g.type !== 'chow');
	const kongs = gs.filter((g) => g.type === 'kong');
	const seatW = windIdx(ctx.seatWind);
	const roundW = windIdx(ctx.roundWind);
	const openMelds = ctx.melds.filter((m) => !m.concealed);
	const concealedHand = openMelds.length === 0;
	const all = [...gs.flatMap((g) => (g.type === 'chow' ? [g.i, g.i + 1, g.i + 2] : [g.i, g.i, g.i])), it.pair, it.pair];

	tileFans(all, fans);
	situationFans(ctx, concealedHand, fans);

	// ---- winds and dragons ----
	const windP = pungs.filter((g) => idxIsWind(g.i));
	const dragonP = pungs.filter((g) => idxIsDragon(g.i));
	if (windP.length === 4) fans.push({ id: 'bigFourWinds', name: 'Big Four Winds', v: 88 });
	else if (windP.length === 3 && idxIsWind(it.pair)) fans.push({ id: 'littleFourWinds', name: 'Little Four Winds', v: 64 });
	else if (windP.length === 3) fans.push({ id: 'bigThreeWinds', name: 'Big Three Winds', v: 12 });
	if (dragonP.length === 3) fans.push({ id: 'bigThreeDragons', name: 'Big Three Dragons', v: 88 });
	else if (dragonP.length === 2 && idxIsDragon(it.pair)) fans.push({ id: 'littleThreeDragons', name: 'Little Three Dragons', v: 64 });
	else if (dragonP.length === 2) fans.push({ id: 'twoDragonPungs', name: 'Two Dragon Pungs', v: 6 });
	for (const g of dragonP) fans.push({ id: 'dragonPung', name: `Dragon Pung (${DRAGON[g.i - 31]})`, v: 2 });
	for (const g of windP) {
		if (g.i === roundW) fans.push({ id: 'prevalentWind', name: `Prevalent Wind (${WIND[ctx.roundWind]})`, v: 2 });
		if (g.i === seatW) fans.push({ id: 'seatWind', name: `Seat Wind (${WIND[ctx.seatWind]})`, v: 2 });
		if (g.i !== roundW && g.i !== seatW) fans.push({ id: 'pungTermHonor', name: 'Pung of Terminals or Honors', v: 1 });
	}
	for (const g of pungs) if (g.i < 27 && (num(g.i) === 1 || num(g.i) === 9)) fans.push({ id: 'pungTermHonor', name: 'Pung of Terminals or Honors', v: 1 });

	// ---- kongs ----
	const openKongs = kongs.filter((g) => !g.concealedKong).length;
	const closedKongs = kongs.filter((g) => g.concealedKong).length;
	if (kongs.length === 4) fans.push({ id: 'fourKongs', name: 'Four Kongs', v: 88 });
	else if (kongs.length === 3) fans.push({ id: 'threeKongs', name: 'Three Kongs', v: 32 });
	else {
		// rulebook: one melded + one concealed kong are 6 points
		if (closedKongs === 2) fans.push({ id: 'twoConcealedKongs', name: 'Two Concealed Kongs', v: 8 });
		else if (openKongs === 2) fans.push({ id: 'twoMeldedKongs', name: 'Two Melded Kongs', v: 4 });
		else if (openKongs === 1 && closedKongs === 1) fans.push({ id: 'meldedConcealedKongs', name: 'Melded Kong + Concealed Kong', v: 6 });
		else if (closedKongs === 1) fans.push({ id: 'concealedKong', name: 'Concealed Kong', v: 2 });
		else if (openKongs === 1) fans.push({ id: 'meldedKong', name: 'Melded Kong', v: 1 });
	}

	// ---- pung shapes ----
	const concealedPungs = pungs.filter((g) => !g.open).length;
	if (concealedPungs === 4) fans.push({ id: 'fourConcealedPungs', name: 'Four Concealed Pungs', v: 64 });
	else if (concealedPungs === 3) fans.push({ id: 'threeConcealedPungs', name: 'Three Concealed Pungs', v: 16 });
	else if (concealedPungs === 2) fans.push({ id: 'twoConcealedPungs', name: 'Two Concealed Pungs', v: 2 });
	if (pungs.length === 4) {
		fans.push({ id: 'allPungs', name: 'All Pungs', v: 6 });
		if ([...pungs.map((g) => g.i), it.pair].every((i) => i < 27 && num(i) % 2 === 0))
			fans.push({ id: 'allEvenPungs', name: 'All Even Pungs', v: 24 });
	}
	const suitedP = pungs.filter((g) => g.i < 27);
	const pungUsed = new Set<number>();
	// shifted pungs in one suit (3 or 4 in a row)
	for (let s = 0; s < 3; s++) {
		const ns = suitedP.filter((g) => suit(g.i) === s).map((g) => num(g.i)).sort((a, b) => a - b);
		for (let start = 0; start < ns.length; start++) {
			let len = 1;
			while (ns.includes(ns[start] + len)) len++;
			if (len >= 4) {
				fans.push({ id: 'fourPureShiftedPungs', name: 'Four Pure Shifted Pungs', v: 48 });
				break;
			}
			if (len === 3) {
				fans.push({ id: 'pureShiftedPungs', name: 'Pure Shifted Pungs', v: 24 });
				break;
			}
		}
	}
	// same number across suits
	const byNum = new Map<number, ScoreGroup[]>();
	for (const g of suitedP) byNum.set(num(g.i), [...(byNum.get(num(g.i)) ?? []), g]);
	for (const [, list] of byNum) {
		const suitsHere = new Set(list.map((g) => suit(g.i)));
		if (suitsHere.size === 3) {
			fans.push({ id: 'triplePung', name: 'Triple Pung', v: 16 });
			list.forEach((g) => pungUsed.add(gs.indexOf(g)));
		}
	}
	// mixed shifted pungs: three suits, consecutive numbers
	for (let n = 1; n <= 7; n++) {
		const a = suitedP.filter((g) => num(g.i) === n);
		const b = suitedP.filter((g) => num(g.i) === n + 1);
		const c = suitedP.filter((g) => num(g.i) === n + 2);
		const ok = a.some((x) => b.some((y) => c.some((z) => new Set([suit(x.i), suit(y.i), suit(z.i)]).size === 3)));
		if (ok) {
			fans.push({ id: 'mixedShiftedPungs', name: 'Mixed Shifted Pungs', v: 8 });
			break;
		}
	}
	// double pung (two suits, same number), not already part of a triple pung
	for (const [, list] of byNum) {
		const free = list.filter((g) => !pungUsed.has(gs.indexOf(g)));
		if (new Set(free.map((g) => suit(g.i))).size === 2) fans.push({ id: 'doublePung', name: 'Double Pung', v: 2 });
	}

	// ---- chow shapes ----
	const used = new Set<number>(); // chows consumed by a 3-4 chow pattern
	const idx = (g: ScoreGroup) => chows.indexOf(g);
	const take = (list: ScoreGroup[]) => list.forEach((g) => used.add(idx(g)));
	if (chows.length === 4) {
		const same = chows.every((g) => g.i === chows[0].i);
		if (same) {
			fans.push({ id: 'quadrupleChow', name: 'Quadruple Chow', v: 48 });
			take(chows);
		} else if (new Set(chows.map((g) => suit(g.i))).size === 1) {
			const st = chows.map((g) => num(g.i)).sort((a, b) => a - b);
			const d = st[1] - st[0];
			if ((d === 1 || d === 2) && st.every((n, k) => k === 0 || n - st[k - 1] === d)) {
				fans.push({ id: 'fourPureShiftedChows', name: 'Four Pure Shifted Chows', v: 32 });
				take(chows);
			}
		}
		// pure terminal chows: 123 123 789 789 one suit + 55 of that suit
		const s0 = suit(chows[0].i);
		const st = chows.map((g) => num(g.i)).sort((a, b) => a - b).join();
		if (chows.every((g) => suit(g.i) === s0) && st === '1,1,7,7' && suit(it.pair) === s0 && num(it.pair) === 5) {
			fans.push({ id: 'pureTerminalChows', name: 'Pure Terminal Chows', v: 64 });
			take(chows);
		}
	}
	const trios = (pred: (a: ScoreGroup, b: ScoreGroup, c: ScoreGroup) => boolean) => {
		for (let a = 0; a < chows.length; a++)
			for (let b = 0; b < chows.length; b++)
				for (let c = 0; c < chows.length; c++) {
					if (a === b || b === c || a === c) continue;
					if ([a, b, c].some((x) => used.has(x))) continue;
					if (pred(chows[a], chows[b], chows[c])) return [chows[a], chows[b], chows[c]];
				}
		return null;
	};
	const pattern3: [string, string, number, (a: ScoreGroup, b: ScoreGroup, c: ScoreGroup) => boolean][] = [
		['pureTripleChow', 'Pure Triple Chow', 24, (a, b, c) => a.i === b.i && b.i === c.i],
		['pureStraight', 'Pure Straight', 16, (a, b, c) => suit(a.i) === suit(b.i) && suit(b.i) === suit(c.i) && num(a.i) === 1 && num(b.i) === 4 && num(c.i) === 7],
		[
			'pureShiftedChows',
			'Pure Shifted Chows',
			16,
			(a, b, c) =>
				suit(a.i) === suit(b.i) && suit(b.i) === suit(c.i) && ((b.i - a.i === 1 && c.i - b.i === 1) || (b.i - a.i === 2 && c.i - b.i === 2))
		],
		['mixedStraight', 'Mixed Straight', 8, (a, b, c) => new Set([suit(a.i), suit(b.i), suit(c.i)]).size === 3 && num(a.i) === 1 && num(b.i) === 4 && num(c.i) === 7],
		['mixedTripleChow', 'Mixed Triple Chow', 8, (a, b, c) => new Set([suit(a.i), suit(b.i), suit(c.i)]).size === 3 && num(a.i) === num(b.i) && num(b.i) === num(c.i)],
		[
			'mixedShiftedChows',
			'Mixed Shifted Chows',
			6,
			(a, b, c) => new Set([suit(a.i), suit(b.i), suit(c.i)]).size === 3 && num(b.i) === num(a.i) + 1 && num(c.i) === num(b.i) + 1
		]
	];
	for (const [id, name, v, pred] of pattern3) {
		const t = trios(pred);
		if (t) {
			fans.push({ id, name, v });
			take(t);
			break; // only one 3-chow pattern fits in a 4-set hand
		}
	}
	// three-suited terminal chows: 123+789 in two suits, 55 in the third
	if (chows.length === 4 && it.pair < 27 && num(it.pair) === 5) {
		const ps = suit(it.pair);
		const others = [0, 1, 2].filter((s) => s !== ps);
		const ok = others.every((s) => chows.some((g) => suit(g.i) === s && num(g.i) === 1) && chows.some((g) => suit(g.i) === s && num(g.i) === 7));
		if (ok && chows.every((g) => suit(g.i) !== ps)) {
			fans.push({ id: 'threeSuitedTerminalChows', name: 'Three-Suited Terminal Chows', v: 16 });
			take(chows);
		}
	}
	// two-chow fans (account-once rule): every new combination must bring in a chow that
	// hasn't been combined yet, so n chows give at most n-1 combinations; chows already used
	// by a bigger pattern may be linked to the rest only once
	const pairFan = (a: ScoreGroup, b: ScoreGroup): Fan | null => {
		if (a.i === b.i) return { id: 'pureDoubleChow', name: 'Pure Double Chow', v: 1 };
		if (num(a.i) === num(b.i) && suit(a.i) !== suit(b.i)) return { id: 'mixedDoubleChow', name: 'Mixed Double Chow', v: 1 };
		if (suit(a.i) === suit(b.i) && Math.abs(a.i - b.i) === 3) return { id: 'shortStraight', name: 'Short Straight', v: 1 };
		if (suit(a.i) === suit(b.i) && Math.min(num(a.i), num(b.i)) === 1 && Math.max(num(a.i), num(b.i)) === 7)
			return { id: 'twoTerminalChows', name: 'Two Terminal Chows', v: 1 };
		return null;
	};
	const combined = new Set<number>();
	let linkedToBig = false;
	for (let a = 0; a < chows.length; a++)
		for (let b = a + 1; b < chows.length; b++) {
			const ua = used.has(a);
			const ub = used.has(b);
			if (ua && ub) continue;
			if ((ua || ub) && linkedToBig) continue;
			if (combined.has(a) && combined.has(b)) continue;
			const f = pairFan(chows[a], chows[b]);
			if (!f) continue;
			fans.push(f);
			if (ua || ub) linkedToBig = true;
			combined.add(a);
			combined.add(b);
		}

	if (chows.length === 4 && it.pair < 27) fans.push({ id: 'allChows', name: 'All Chows', v: 2 });

	// ---- outside hand / all fives ----
	const sets = [...gs.map((g) => (g.type === 'chow' ? [g.i, g.i + 1, g.i + 2] : [g.i])), [it.pair]];
	if (sets.every((t) => t.some(idxTermOrHonor))) fans.push({ id: 'outsideHand', name: 'Outside Hand', v: 4 });
	if (sets.every((t) => t.some((i) => i < 27 && num(i) === 5))) fans.push({ id: 'allFives', name: 'All Fives', v: 16 });

	// ---- melded hand: every set exposed, won on a discard with a single wait ----
	if (!ctx.selfDraw && openMelds.length === 4) fans.push({ id: 'meldedHand', name: 'Melded Hand', v: 6 });

	// ---- nine gates ----
	if (ctx.melds.length === 0) {
		const s0 = suit(all[0]);
		if (s0 >= 0 && all.every((i) => suit(i) === s0)) {
			const c = new Array(9).fill(0);
			for (const i of all) c[num(i) - 1]++;
			const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
			if (base.every((n, k) => c[k] >= n)) fans.push({ id: 'nineGates', name: 'Nine Gates', v: 88 });
		}
	}

	tileHogs(gs, it.pair, fans);

	// ---- waits (only when it was the only tile that could win) ----
	if (singleWaitOnly) {
		if (it.wait === 'penchan') fans.push({ id: 'edgeWait', name: 'Edge Wait', v: 1 });
		else if (it.wait === 'kanchan') fans.push({ id: 'closedWait', name: 'Closed Wait', v: 1 });
		else if (it.wait === 'tanki') fans.push({ id: 'singleWait', name: 'Single Wait', v: 1 });
	}
	return fans;
}

// ---- special shapes ----

function sevenPairsKinds(counts: number[]): boolean {
	let pairs = 0;
	for (const n of counts) {
		if (n === 2) pairs++;
		else if (n === 4) pairs += 2;
		else if (n !== 0) return false;
	}
	return pairs === 7;
}

function isSevenShifted(counts: number[]): boolean {
	for (let s = 0; s < 3; s++)
		for (let start = 0; start <= 2; start++) {
			let ok = true;
			for (let i = 0; i < 34; i++) {
				const want = i >= s * 9 + start && i < s * 9 + start + 7 ? 2 : 0;
				if (counts[i] !== want) ok = false;
			}
			if (ok) return true;
		}
	return false;
}

const PERMS = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];
/** suit s takes the 1-4-7, 2-5-8 or 3-6-9 row */
const knitRow = (perm: number[]) => perm.flatMap((s, row) => [0, 3, 6].map((o) => s * 9 + row + o));

/** Honors and Knitted: 14 single tiles from one knitted row set plus honours. */
function honorsKnitted(counts: number[]): 'greater' | 'lesser' | null {
	if (counts.some((n) => n > 1)) return null;
	if (counts.reduce((a, b) => a + b, 0) !== 14) return null;
	for (const p of PERMS) {
		const allowed = new Set([...knitRow(p), 27, 28, 29, 30, 31, 32, 33]);
		if (counts.every((n, i) => !n || allowed.has(i))) {
			const honours = counts.slice(27).filter(Boolean).length;
			return honours === 7 ? 'greater' : 'lesser';
		}
	}
	return null;
}

/** Knitted Straight + one set + a pair. Returns the leftover set/pair readings. */
function knittedStraight(counts: number[], meldCount: number) {
	if (meldCount > 1) return null;
	for (const p of PERMS) {
		const row = knitRow(p);
		if (!row.every((i) => counts[i] >= 1)) continue;
		const c = counts.slice();
		for (const i of row) c[i]--;
		const d = decompose(c, 1 - meldCount, 0);
		if (d.length) return d;
	}
	return null;
}

function isThirteenOrphans(counts: number[]) {
	return shantenKokushi(counts) === -1;
}

export function mcrSpecial(counts: number[], _jokers: number, meldCount: number): string | null {
	if (meldCount === 0) {
		if (sevenPairsKinds(counts)) return 'pairs';
		if (isThirteenOrphans(counts)) return 'orphans';
		if (honorsKnitted(counts)) return 'knitted';
	}
	if (knittedStraight(counts, meldCount)) return 'knitted-straight';
	return null;
}

function allIndices(counts: number[]) {
	return counts.flatMap((n, i) => Array(n).fill(i) as number[]);
}

function evalSpecialShapes(ctx: WinContext, counts: number[], fullCounts: number[]): Fan[][] {
	const out: Fan[][] = [];
	const concealed = ctx.melds.every((m) => m.concealed);
	const base = (first: Fan[]) => {
		const fans = [...first];
		tileFans(allIndices(fullCounts), fans);
		situationFans(ctx, concealed, fans);
		return fans;
	};
	if (ctx.melds.length === 0) {
		if (isThirteenOrphans(counts)) out.push(base([{ id: 'thirteenOrphans', name: 'Thirteen Orphans', v: 88 }]));
		if (isSevenShifted(counts)) out.push(base([{ id: 'sevenShiftedPairs', name: 'Seven Shifted Pairs', v: 88 }]));
		else if (sevenPairsKinds(counts)) {
			const fans = base([{ id: 'sevenPairs', name: 'Seven Pairs', v: 24 }]);
			for (let i = 0; i < 34; i++) if (counts[i] === 4) fans.push({ id: 'tileHog', name: 'Tile Hog', v: 2 });
			out.push(fans);
		}
		const hk = honorsKnitted(counts);
		if (hk === 'greater') out.push(base([{ id: 'greaterHonorsKnitted', name: 'Greater Honors and Knitted Tiles', v: 24 }]));
		if (hk === 'lesser') out.push(base([{ id: 'lesserHonorsKnitted', name: 'Lesser Honors and Knitted Tiles', v: 12 }]));
	}
	const ks = knittedStraight(counts, ctx.melds.length);
	if (ks) {
		const fans = base([{ id: 'knittedStraight', name: 'Knitted Straight', v: 12 }]);
		// the extra set: dragon / wind pungs still count
		const extra = ks[0].groups[0] ?? (ctx.melds[0] ? { type: ctx.melds[0].type, i: KIND_INDEX[ctx.melds[0].tiles[0].k] } : null);
		if (extra && extra.type !== 'chow') {
			if (idxIsDragon(extra.i)) fans.push({ id: 'dragonPung', name: 'Dragon Pung', v: 2 });
			if (extra.i === windIdx(ctx.roundWind)) fans.push({ id: 'prevalentWind', name: 'Prevalent Wind', v: 2 });
			if (extra.i === windIdx(ctx.seatWind)) fans.push({ id: 'seatWind', name: 'Seat Wind', v: 2 });
		}
		out.push(fans);
	}
	return out;
}

export function scoreMCR(ctx: WinContext): Scored {
	const { counts } = handCounts(ctx.concealed);
	const meldCounts = handCounts(ctx.melds.flatMap((m) => m.tiles.slice(0, 3))).counts;
	const fullCounts = counts.map((n, i) => n + meldCounts[i]);
	const candidates: Fan[][] = evalSpecialShapes(ctx, counts, fullCounts);

	const its = interpretations(ctx.concealed, ctx.melds, 4, ctx.winTile.k, ctx.selfDraw);
	if (its.length) {
		const without = ctx.concealed.filter((t) => t.id !== ctx.winTile.id);
		const onlyOne = winningKinds(without, ctx.melds.length, 4).length === 1;
		for (const it of its) candidates.push(evalStandard(ctx, it, onlyOne));
	}
	if (!candidates.length) return { valid: false, reason: 'Not a complete hand', lines: [], total: 0, summary: '' };

	let best: { fans: Fan[]; total: number } | null = null;
	for (const raw of candidates) {
		let fans = applyExclusions(raw);
		let total = fans.reduce((a, f) => a + f.v, 0);
		if (total === 0) {
			fans = [{ id: 'chicken', name: 'Chicken Hand', v: 8 }];
			total = 8;
		}
		if (!best || total > best.total) best = { fans, total };
	}
	const b = best!;
	const lines: ScoreLine[] = b.fans.map((f) => ({ name: f.name, value: f.v }));
	const flowers = ctx.flowers.length;
	if (flowers) lines.push({ name: `Flower tiles ×${flowers}`, value: flowers });
	const total = b.total + flowers;
	if (ctx.state.opts.minimum && b.total < MCR_MINIMUM) {
		return {
			valid: false,
			reason: `${b.total} fan is below the 8-fan minimum (flowers don't count)`,
			lines,
			total,
			summary: ''
		};
	}
	return { valid: true, lines, total, summary: `${total} fan` };
}

export const mcr: Variant = {
	id: 'international',
	name: 'International Mahjong',
	tagline: 'The tournament game. 81 scoring patterns and an 8-point minimum.',
	handSize: 13,
	sets: 4,
	wall: { flowers: true, jokers: 0, redFives: false },
	reserve: 0,
	allowChow: true,
	multipleWinners: false,
	startScore: 0,
	riichi: false,
	goulash: false,
	streakOnDraw: false,
	bustOut: false,
	rotateDealer: true,
	minimumHand: true,
	shantenSpecials: { pairs: true, orphans: true },
	special: mcrSpecial,
	scoreWin: scoreMCR,
	settleWin(state, wins) {
		const deltas = [0, 0, 0, 0];
		const w = wins[0];
		for (let s = 0; s < 4; s++) {
			if (s === w.seat) continue;
			// everyone pays 8; the discarder (or everyone, on a self-draw) also pays the hand's value
			const pay = 8 + (w.from === null || w.from === s ? w.scored.total : 0);
			deltas[s] -= pay;
			deltas[w.seat] += pay;
		}
		return {
			deltas,
			notes: [w.from === null ? 'Self-draw: each player pays 8 + the hand value.' : 'The discarder pays 8 + the hand value; the other two pay 8.']
		};
	},
	settleDraw() {
		return { deltas: [0, 0, 0, 0], notes: ['Drawn hand: no score. The deal passes on.'], dealerKeeps: false };
	},
	rulesSummary: [
		'Mahjong Competition Rules (MCR), the rules used in international tournaments. 144 tiles including eight flowers.',
		'Each player holds 13 tiles; a win is four sets and a pair, or a special hand (seven pairs, thirteen orphans, knitted hands).',
		'Chow only from the player before you. Pung, kong and Mahjong from anyone.',
		'Your hand must be worth at least 8 fan, not counting flowers. A hand with no other fan is a Chicken Hand, worth 8.',
		'Fans that a bigger fan already includes are not counted twice. Flowers add 1 fan each.',
		'Out with Replacement Tile counts only for a kong replacement, not a flower replacement.',
		'Discard win: the discarder pays 8 + the hand value, the other two pay 8. Self-draw: everyone pays 8 + the hand value.',
		'The deal passes after every hand, win or draw. A full game is four rounds of four hands.',
		'Account-once rule: two-chow fans (Pure Double Chow, Short Straight and so on) each need a chow that hasn’t been combined yet.'
	],
	scoringTable: [
		{ name: 'Big Four Winds / Big Three Dragons / All Green / Nine Gates', value: '88' },
		{ name: 'Four Kongs / Seven Shifted Pairs / Thirteen Orphans', value: '88' },
		{ name: 'All Terminals / Little Four Winds / Little Three Dragons', value: '64' },
		{ name: 'All Honors / Four Concealed Pungs / Pure Terminal Chows', value: '64' },
		{ name: 'Quadruple Chow / Four Pure Shifted Pungs', value: '48' },
		{ name: 'Four Pure Shifted Chows / Three Kongs / All Terminals and Honors', value: '32' },
		{ name: 'Seven Pairs / Greater Honors and Knitted / All Even Pungs', value: '24' },
		{ name: 'Full Flush / Pure Triple Chow / Pure Shifted Pungs', value: '24' },
		{ name: 'Upper Tiles / Middle Tiles / Lower Tiles', value: '24' },
		{ name: 'Pure Straight / Three-Suited Terminal Chows / Pure Shifted Chows', value: '16' },
		{ name: 'All Fives / Triple Pung / Three Concealed Pungs', value: '16' },
		{ name: 'Lesser Honors and Knitted / Knitted Straight / Upper Four / Lower Four / Big Three Winds', value: '12' },
		{ name: 'Mixed Straight / Reversible Tiles / Mixed Triple Chow / Mixed Shifted Pungs', value: '8' },
		{ name: 'Chicken Hand / Last Tile Draw / Last Tile Claim / Out with Replacement / Robbing the Kong', value: '8' },
		{ name: 'Two Concealed Kongs', value: '8' },
		{ name: 'All Pungs / Half Flush / Mixed Shifted Chows / All Types / Melded Hand / Two Dragon Pungs', value: '6' },
		{ name: 'Melded Kong + Concealed Kong', value: '6' },
		{ name: 'Outside Hand / Fully Concealed Hand / Two Melded Kongs / Last Tile', value: '4' },
		{ name: 'Dragon Pung / Prevalent Wind / Seat Wind / Concealed Hand / All Chows', value: '2' },
		{ name: 'Tile Hog / Double Pung / Two Concealed Pungs / Concealed Kong / All Simples', value: '2' },
		{ name: 'Pure Double Chow / Mixed Double Chow / Short Straight / Two Terminal Chows', value: '1' },
		{ name: 'Pung of Terminals or Honors / Melded Kong / One Voided Suit / No Honors', value: '1' },
		{ name: 'Edge Wait / Closed Wait / Single Wait / Self-Drawn', value: '1' },
		{ name: 'Flower tile', value: '1 each (not toward the minimum)' }
	]
};

