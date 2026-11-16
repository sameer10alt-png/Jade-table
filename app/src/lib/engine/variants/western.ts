// International Mahjong on Pung Table = classic Western rules (British / Australian club style):
// points for sets, doubled for every "double", up to a 1,000-point limit.
// 144 tiles with flowers and seasons, no jokers, no minimum hand.
import { shantenKokushi } from '../analysis';
import { handCounts, interpretations, winningKinds, type Interpretation } from '../hand';
import { idxIsDragon, idxIsWind, idxTermOrHonor, windIdx } from '../tiles';
import type { ScoreLine } from '../types';
import type { Scored, Variant, WinContext } from '../variant';

export const WESTERN_LIMIT = 1000;
const WIND = ['East', 'South', 'West', 'North'];
const DRAGON = ['Red', 'Green', 'White'];

interface Tally {
	points: [string, number][];
	doubles: [string, number][];
	limit?: string;
}

/** points and doubles that don't depend on how the hand splits into sets */
function common(ctx: WinContext, t: Tally) {
	t.points.push(['Mahjong', 20]);
	if (ctx.selfDraw) t.points.push(['Self-drawn winning tile', 2]);
	for (const f of ctx.flowers) t.points.push([f.k[0] === 'f' ? 'Flower' : 'Season', 4]);
	const seatNo = String(ctx.seatWind + 1);
	for (const set of ['f', 's']) {
		const fl = ctx.flowers.filter((x) => x.k[0] === set);
		const label = set === 'f' ? 'flower' : 'season';
		if (fl.length === 4) t.doubles.push([`All four ${label}s`, 3]);
		else if (fl.some((x) => x.k === set + seatNo)) t.doubles.push([`Own ${label}`, 1]);
	}
	if (ctx.melds.every((m) => m.concealed)) t.doubles.push(['Concealed hand', 1]);
	if (ctx.robbingKong) t.doubles.push(['Robbing the kong', 1]);
	if (ctx.afterKong && ctx.selfDraw) t.doubles.push(['Winning on a kong replacement', 1]);
	if (ctx.lastTile) t.doubles.push([ctx.selfDraw ? 'Last tile from the wall' : 'Last discard', 1]);
}

function evalStandard(ctx: WinContext, it: Interpretation, onlyTile: boolean): Tally {
	const t: Tally = { points: [], doubles: [] };
	common(ctx, t);
	const seatW = windIdx(ctx.seatWind);
	const roundW = windIdx(ctx.roundWind);
	const sets = it.groups.filter((g) => g.type !== 'chow');
	const chows = it.groups.filter((g) => g.type === 'chow');

	for (const g of sets) {
		const big = idxTermOrHonor(g.i);
		const concealed = !g.open;
		// pung: 2 simple / 4 terminal-honour, doubled when concealed; a kong is 4× its pung
		let v = big ? 4 : 2;
		if (concealed) v *= 2;
		if (g.type === 'kong') v *= 4;
		t.points.push([`${concealed ? 'Concealed' : 'Exposed'} ${g.type}${big ? ' of terminals/honours' : ''}`, v]);
		if (idxIsDragon(g.i)) t.doubles.push([`${DRAGON[g.i - 31]} dragon ${g.type}`, 1]);
		if (g.i === seatW) t.doubles.push([`Seat wind ${g.type} (${WIND[ctx.seatWind]})`, 1]);
		if (g.i === roundW) t.doubles.push([`Prevalent wind ${g.type} (${WIND[ctx.roundWind]})`, 1]);
	}
	// pair of dragons, seat wind or prevalent wind
	if (idxIsDragon(it.pair)) t.points.push(['Pair of dragons', 2]);
	if (it.pair === seatW) t.points.push(['Pair of seat wind', 2]);
	if (it.pair === roundW) t.points.push(['Pair of prevalent wind', 2]);
	if (onlyTile) t.points.push(['Winning on the only possible tile', 2]);

	// whole-hand doubles
	const concealedPungs = sets.filter((g) => !g.open).length;
	if (chows.length === 0) t.doubles.push(['No chows', 1]);
	const pointsBeyondMahjong = t.points.some(([n]) => n !== 'Mahjong' && n !== 'Self-drawn winning tile' && n !== 'Flower' && n !== 'Season');
	if (sets.length === 0 && !pointsBeyondMahjong) t.doubles.push(['No score but Mahjong', 1]);
	if (concealedPungs === 3) t.doubles.push(['Three concealed pungs', 1]);

	const tiles = [...it.groups.flatMap((g) => (g.type === 'chow' ? [g.i, g.i + 1, g.i + 2] : [g.i])), it.pair];
	const suits = new Set(tiles.filter((i) => i < 27).map((i) => Math.floor(i / 9)));
	const honours = tiles.some((i) => i >= 27);
	if (suits.size === 0) t.limit = 'All honours';
	else if (tiles.every((i) => idxTermOrHonor(i) && i < 27)) t.limit = 'All terminals (Heads and tails)';
	else if (suits.size === 1 && !honours) t.doubles.push(['Full flush (one suit)', 3]);
	else if (suits.size === 1) t.doubles.push(['Half flush (one suit + honours)', 1]);
	if (tiles.every((i) => idxTermOrHonor(i)) && !t.limit) t.doubles.push(['All terminals and honours', 1]);

	const dragonSets = sets.filter((g) => idxIsDragon(g.i)).length;
	const windSets = sets.filter((g) => idxIsWind(g.i)).length;
	if (dragonSets === 3) t.limit = 'Big three dragons';
	else if (dragonSets === 2 && idxIsDragon(it.pair)) t.doubles.push(['Little three dragons', 1]);
	if (windSets === 4) t.limit = 'Big four winds';
	else if (windSets === 3 && idxIsWind(it.pair)) t.limit = 'Little four winds';
	if (concealedPungs === 4) t.limit = 'Four concealed pungs';
	if (it.groups.filter((g) => g.type === 'kong').length === 4) t.limit = 'Four kongs';
	if (ctx.firstGoAround && ctx.melds.length === 0 && ctx.selfDraw && ctx.isDealer) t.limit = 'Heavenly hand';
	if (ctx.firstGoAround && ctx.melds.length === 0 && !ctx.selfDraw && !ctx.isDealer) t.limit = 'Earthly hand';
	return t;
}

/** Nine gates: 1112345678999 of one suit, concealed, plus any tile of that suit */
function nineGates(ctx: WinContext): boolean {
	if (ctx.melds.length) return false;
	const { counts } = handCounts(ctx.concealed);
	for (let s = 0; s < 3; s++) {
		const c = counts.slice(s * 9, s * 9 + 9);
		if (c.reduce((a, b) => a + b, 0) !== 14) continue;
		const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
		if (c.every((n, i) => n >= need[i])) return true;
	}
	return false;
}

function total(t: Tally) {
	if (t.limit) return WESTERN_LIMIT;
	const pts = t.points.reduce((a, [, v]) => a + v, 0);
	const dbl = t.doubles.reduce((a, [, v]) => a + v, 0);
	// round up to the next 2, as clubs do, and cap at the limit
	return Math.min(WESTERN_LIMIT, Math.ceil((pts * Math.pow(2, dbl)) / 2) * 2);
}

export function scoreWestern(ctx: WinContext): Scored {
	const { counts } = handCounts(ctx.concealed);
	const tallies: Tally[] = [];
	if (ctx.melds.length === 0 && shantenKokushi(counts) === -1) tallies.push({ points: [], doubles: [], limit: 'Thirteen orphans' });
	if (nineGates(ctx)) tallies.push({ points: [], doubles: [], limit: 'Nine gates' });
	const its = interpretations(ctx.concealed, ctx.melds, 4, ctx.winTile.k, ctx.selfDraw);
	if (its.length) {
		const without = ctx.concealed.filter((x) => x.id !== ctx.winTile.id);
		const only = winningKinds(without, ctx.melds.length, 4).length === 1;
		for (const it of its) tallies.push(evalStandard(ctx, it, only));
	}
	if (!tallies.length) return { valid: false, reason: 'Not a complete hand', lines: [], total: 0, summary: '' };
	let best = tallies[0];
	for (const t of tallies) if (total(t) > total(best)) best = t;
	const value = total(best);
	const dbl = best.doubles.reduce((a, [, v]) => a + v, 0);
	const lines: ScoreLine[] = best.limit
		? [{ name: best.limit, value: 'Limit' }]
		: [...best.points.map(([name, v]) => ({ name, value: v })), ...best.doubles.map(([name, v]) => ({ name, value: v === 1 ? '1 double' : `${v} doubles` }))];
	const pts = best.points.reduce((a, [, v]) => a + v, 0);
	return {
		valid: true,
		lines,
		total: value,
		summary: best.limit || value >= WESTERN_LIMIT ? `Limit · ${WESTERN_LIMIT}` : dbl ? `${pts} × ${Math.pow(2, dbl)} = ${value} points` : `${value} points`
	};
}

export const western: Variant = {
	id: 'international',
	name: 'International Mahjong',
	tagline: 'Classic Western rules. Points and doubles, flowers and seasons, limit hands.',
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
	shantenSpecials: { orphans: true },
	special: (counts, jokers, meldCount) => (meldCount === 0 && jokers === 0 && shantenKokushi(counts) === -1 ? 'special' : null),
	scoreWin: scoreWestern,
	settleWin(state, wins) {
		const deltas = [0, 0, 0, 0];
		const w = wins[0];
		for (let s = 0; s < 4; s++) {
			if (s === w.seat) continue;
			// everyone pays the winner's score; East (the dealer) pays or collects double
			let pay = w.scored.total;
			if (s === state.dealer || w.seat === state.dealer) pay *= 2;
			deltas[s] -= pay;
			deltas[w.seat] += pay;
		}
		return { deltas, notes: ['Each player pays the winner’s score. East pays and collects double.'] };
	},
	settleDraw() {
		return { deltas: [0, 0, 0, 0], notes: ['Wall game: no score. East deals again.'], dealerKeeps: true };
	},
	rulesSummary: [
		'Classic Western mahjong, as played in British and Australian clubs. 144 tiles: the 136 standard tiles plus four flowers and four seasons.',
		'Each player holds 13 tiles; a win (Mahjong) is four sets and a pair. Thirteen orphans and nine gates are special limit hands.',
		'Chow only from the player before you. Pung, kong and Mahjong from anyone.',
		'Score = points, doubled once for every double, rounded up to the next 2, up to a limit of 1,000.',
		'Concealed pungs and kongs score double the exposed ones. A kong scores four times a pung.',
		'Each player pays the winner’s score. East pays and collects double. There’s no minimum hand.',
		'If East wins or the wall runs out, East deals again. Otherwise the deal passes to the right.',
		'Club rules vary. This is the common core; some clubs also settle points between the losers.'
	],
	scoringTable: [
		{ name: 'Mahjong (going out)', value: '20' },
		{ name: 'Self-drawn winning tile', value: '2' },
		{ name: 'Winning on the only possible tile', value: '2' },
		{ name: 'Flower or season', value: '4 each' },
		{ name: 'Pung of 2-8: exposed / concealed', value: '2 / 4' },
		{ name: 'Pung of terminals or honours: exposed / concealed', value: '4 / 8' },
		{ name: 'Kong of 2-8: exposed / concealed', value: '8 / 16' },
		{ name: 'Kong of terminals or honours: exposed / concealed', value: '16 / 32' },
		{ name: 'Pair of dragons, seat wind or prevalent wind', value: '2 each' },
		{ name: 'Pung or kong of dragons', value: '1 double' },
		{ name: 'Pung or kong of seat wind / prevalent wind', value: '1 double each' },
		{ name: 'Own flower / own season', value: '1 double each' },
		{ name: 'All four flowers or all four seasons', value: '3 doubles' },
		{ name: 'Concealed hand / No chows / Three concealed pungs', value: '1 double each' },
		{ name: 'No score but Mahjong (all chows, plain pair)', value: '1 double' },
		{ name: 'Half flush (one suit + honours)', value: '1 double' },
		{ name: 'Full flush (one suit only)', value: '3 doubles' },
		{ name: 'All terminals and honours / Little three dragons', value: '1 double each' },
		{ name: 'Robbing the kong / Kong replacement / Last tile or last discard', value: '1 double each' },
		{
			name: 'Limit hands: Thirteen orphans, Nine gates, Big three dragons, Big or Little four winds, All honours, All terminals, Four concealed pungs, Four kongs, Heavenly hand, Earthly hand',
			value: '1,000'
		}
	]
};
