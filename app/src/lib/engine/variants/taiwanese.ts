import { handCounts, interpretations, winningKinds, type Interpretation } from '../hand';
import { idxIsDragon, idxIsWind, idxTermOrHonor, windIdx } from '../tiles';
import type { GameState, ScoreLine } from '../types';
import type { Scored, Variant, WinContext } from '../variant';

// Scoring follows the Ladies' Recreation Club (LRC) Taiwanese Mahjong scoresheet.
export const ROUND_MINIMUM = [20, 22, 24, 26];
const BASE = 5;
const WIND = ['East', 'South', 'West', 'North'];
const DRAGON = ['Red', 'Green', 'White']; // dragon index 31,32,33

type Line = [string, number];

const suitIdx = (i: number) => (i < 27 ? Math.floor(i / 9) : -1); // 0=char 1=circle 2=bamboo
const numIdx = (i: number) => (i % 9) + 1; // 1..9

/** Seven pairs plus one pung, 17 tiles, fully concealed. */
function isNicoNico(counts: number[]) {
	let pairs = 0;
	let pungs = 0;
	for (const n of counts) {
		if (n === 2) pairs++;
		else if (n === 3) pungs++;
		else if (n === 4) pairs += 2;
		else if (n !== 0) return false;
	}
	return pairs === 7 && pungs === 1;
}

/** 13 terminals/honours + one duplicate + a set (17 tiles). */
function isThirteenOrphans(counts: number[]) {
	const c = counts.slice();
	for (let i = 0; i < 34; i++) if (idxTermOrHonor(i)) { if (!c[i]) return false; c[i]--; }
	for (let p = 0; p < 34; p++) {
		if (!idxTermOrHonor(p) || !c[p]) continue;
		c[p]--;
		const rest = c.flatMap((n, i) => Array(n).fill(i));
		const ok =
			rest.length === 3 &&
			((rest[0] === rest[1] && rest[1] === rest[2]) ||
				(rest[0] < 27 && rest[1] === rest[0] + 1 && rest[2] === rest[0] + 2 && Math.floor(rest[0] / 9) === Math.floor(rest[2] / 9)));
		c[p]++;
		if (ok) return true;
	}
	return false;
}

/** Three tiles per suit with gaps of at least 3, all seven honours, one duplicate. */
function isSixteenOrphans(counts: number[]) {
	if (counts.reduce((a, b) => a + b, 0) !== 17) return false;
	for (let i = 27; i < 34; i++) if (!counts[i]) return false;
	let dup = 0;
	for (let s = 0; s < 3; s++) {
		const nums: number[] = [];
		for (let n = 0; n < 9; n++) {
			const k = counts[s * 9 + n];
			if (k > 2) return false;
			if (k === 2) dup++;
			if (k) nums.push(n);
		}
		if (nums.length !== 3) return false;
		if (nums[1] - nums[0] < 3 || nums[2] - nums[1] < 3) return false;
	}
	for (let i = 27; i < 34; i++) {
		if (counts[i] > 2) return false;
		if (counts[i] === 2) dup++;
	}
	return dup === 1;
}

/** Discarded + exposed tiles currently showing on the table (for "win within N"). */
function tilesOnTable(ctx: WinContext): number {
	const discards = ctx.state.log.filter((e) => e.type === 'discard').length;
	let exposed = 0;
	for (const p of ctx.state.players)
		for (const m of p.melds) if (!m.concealed) exposed += m.tiles.length;
	return discards + exposed;
}

function flowerLines(ctx: WinContext, lines: Line[]) {
	const fl = ctx.flowers.map((t) => t.k);
	if (!fl.length) return;
	lines.push([`Flower tiles ×${fl.length}`, fl.length]); // 1 point each
	const seatNo = String(ctx.seatWind + 1);
	if (fl.includes('f' + seatNo)) lines.push(['Seat flower', 1]);
	if (fl.includes('s' + seatNo)) lines.push(['Seat season', 1]);
}

function situational(ctx: WinContext, concealedHand: boolean, lines: Line[]) {
	if (ctx.selfDraw) {
		if (ctx.afterKong) lines.push(['Win by self-drawing a gong', 30]);
		else lines.push(['Self-draw (zi mo)', 1]);
		if (concealedHand) lines.push(['Concealed hand — self-drawn', 10]);
	} else if (concealedHand) {
		lines.push(['Concealed hand — win from discard', 5]);
	}
	if (ctx.robbingKong) lines.push(['Robbing the gong', 10]);
	if (ctx.lastTile) lines.push(['Seabed — last tile', 10]);
	if (ctx.isDealer || ctx.from === ctx.state.dealer) lines.push(['Dealer tile', 1]);

	if (ctx.firstGoAround && ctx.melds.length === 0) {
		if (ctx.isDealer && ctx.selfDraw) lines.push(['Heavenly hand', 100]);
		else if (!ctx.isDealer) lines.push(['Earthly hand', 90]);
	} else {
		const w = tilesOnTable(ctx);
		if (w <= 4) lines.push(['Human hand (win within 4)', 80]);
		else if (w <= 7) lines.push(['Win within 7 tiles', 20]);
		else if (w <= 10) lines.push(['Win within 10 tiles', 10]);
	}
}

/** Purity, terminals-only and the five-suits rows. */
function suitLines(all: number[], lines: Line[]) {
	const suits = new Set(all.filter((i) => i < 27).map((i) => Math.floor(i / 9)));
	const honors = all.some((i) => i >= 27);
	if (suits.size === 0) lines.push(['Honours hand — winds & dragons only', 90]);
	else if (suits.size === 1 && !honors) lines.push(['Pure suit hand', 90]);
	else if (suits.size === 1 && honors) lines.push(['Semi-pure hand', 30]);
	else if (suits.size === 2 && !honors) lines.push(['Two-suit hand', 5]);
	if (suits.size === 3 && all.some(idxIsWind) && all.some(idxIsDragon)) lines.push(['All five suits', 10]);
	const allTermNoHonor = all.every((i) => i < 27 && (i % 9 === 0 || i % 9 === 8));
	const allTermHonor = all.every(idxTermOrHonor);
	if (allTermNoHonor) lines.push(['Terminals only, no honours', 40]);
	else if (allTermHonor && honors && suits.size > 0) lines.push(['Terminals & honours', 20]);
}

/** LRC coloured special hands: one suit plus only its matching dragon. +20 each. */
function colouredHand(all: number[], lines: Line[]) {
	const suits = new Set(all.filter((i) => i < 27).map((i) => Math.floor(i / 9)));
	const honours = new Set(all.filter((i) => i >= 27));
	if (suits.size !== 1 || honours.size !== 1) return;
	const suit = [...suits][0]; // 0 char, 1 circle, 2 bamboo
	const dragon = [...honours][0]; // 31 red, 32 green, 33 white
	if (suit === 2 && dragon === 32) lines.push(['LRC Jade hand', 20]);
	else if (suit === 0 && dragon === 31) lines.push(['LRC Ruby hand', 20]);
	else if (suit === 0 && dragon === 33) lines.push(['LRC Sapphire hand', 20]);
	else if (suit === 1 && dragon === 33) lines.push(['LRC Diamond hand', 20]);
}

function evalStandard(ctx: WinContext, it: Interpretation, singleWait: boolean): Line[] {
	const lines: Line[] = [];
	const concealedHand = ctx.melds.every((m) => m.concealed);
	situational(ctx, concealedHand, lines);

	const gs = it.groups;
	const pungs = gs.filter((g) => g.type !== 'chow'); // pung or kong
	const chows = gs.filter((g) => g.type === 'chow');
	const suitedPungs = pungs.filter((g) => g.i < 27);
	const all = [...gs.flatMap((g) => (g.type === 'chow' ? [g.i, g.i + 1, g.i + 2] : [g.i])), it.pair];
	const noHonours = !all.some((i) => i >= 27);
	const noFlowers = ctx.flowers.length === 0;
	const allSheung = pungs.length === 0;
	const allPong = chows.length === 0;

	// ---- Winds ----
	const windPungs = pungs.filter((g) => idxIsWind(g.i));
	if (windPungs.length === 4) lines.push(['Big four winds', 60]);
	else if (windPungs.length === 3 && idxIsWind(it.pair)) lines.push(['Little four winds', 50]);
	else if (windPungs.length === 3) lines.push(['Big three winds', 30]);
	else if (windPungs.length === 2 && idxIsWind(it.pair)) lines.push(['Little three winds', 15]);
	else
		for (const g of windPungs) {
			if (g.i === windIdx(ctx.seatWind)) lines.push([`Seat wind pong (${WIND[ctx.seatWind]})`, 1]);
			if (g.i === windIdx(ctx.roundWind)) lines.push([`Round wind pong (${WIND[ctx.roundWind]})`, 1]);
		}

	// ---- Dragons ----
	const dragonPungs = pungs.filter((g) => idxIsDragon(g.i));
	if (dragonPungs.length === 3) lines.push(['Big three dragons', 40]);
	else if (dragonPungs.length === 2 && idxIsDragon(it.pair)) lines.push(['Little three dragons', 20]);
	else for (const g of dragonPungs) lines.push([`${DRAGON[g.i - 31]} dragon pong`, 2]);

	// ---- Sister pongs: same number, different suits ----
	const pongSuitsByNum = new Map<number, Set<number>>();
	for (const g of suitedPungs) {
		const n = g.i % 9;
		if (!pongSuitsByNum.has(n)) pongSuitsByNum.set(n, new Set());
		pongSuitsByNum.get(n)!.add(Math.floor(g.i / 9));
	}
	for (const [n, suits] of pongSuitsByNum) {
		if (suits.size >= 3) lines.push([`Sister pongs ×3 (${n + 1}s)`, 10]);
		else if (suits.size === 2) lines.push([`Sister pongs ×2 (${n + 1}s)`, 3]);
	}

	// ---- Neighbour / uncle pongs: consecutive pongs, same suit ----
	const neighbourVal: Record<number, number> = { 2: 5, 3: 15, 4: 30, 5: 60 };
	for (let s = 0; s < 3; s++) {
		const nums = suitedPungs.filter((g) => Math.floor(g.i / 9) === s).map((g) => g.i % 9).sort((a, b) => a - b);
		let i = 0;
		while (i < nums.length) {
			let j = i;
			while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
			const len = j - i + 1;
			if (neighbourVal[len]) lines.push([`Neighbour pongs ×${len}`, neighbourVal[len]]);
			i = j + 1;
		}
	}

	// ---- Brother sheungs (identical, same suit) & sister sheungs (same run, different suits) ----
	const brotherVal: Record<number, number> = { 2: 5, 3: 15, 4: 30 };
	const sameChow = new Map<number, number>();
	for (const g of chows) sameChow.set(g.i, (sameChow.get(g.i) ?? 0) + 1);
	for (const [, c] of sameChow) if (brotherVal[c]) lines.push([`Brother sheungs ×${c}`, brotherVal[c]]);
	const chowSuitsByStart = new Map<number, Set<number>>();
	for (const g of chows) {
		const n = g.i % 9;
		if (!chowSuitsByStart.has(n)) chowSuitsByStart.set(n, new Set());
		chowSuitsByStart.get(n)!.add(Math.floor(g.i / 9));
	}
	for (const [, suits] of chowSuitsByStart) {
		if (suits.size >= 3) lines.push(['Sister sheungs ×3', 10]);
		else if (suits.size === 2) lines.push(['Sister sheungs ×2', 3]);
	}

	// ---- Dragon sequence 123-456-789 (award the higher of pure / mixed) ----
	const startSuits = (n: number) => chows.filter((g) => g.i % 9 === n).map((g) => Math.floor(g.i / 9));
	const s0 = startSuits(0), s3 = startSuits(3), s6 = startSuits(6);
	if (s0.length && s3.length && s6.length) {
		const concealedSeq = concealedHand && ctx.selfDraw;
		const pure = [0, 1, 2].some((su) => s0.includes(su) && s3.includes(su) && s6.includes(su));
		if (pure) lines.push(['Pure dragon sequence', concealedSeq ? 20 : 10]);
		else lines.push(['Mixed dragon sequence', concealedSeq ? 10 : 5]);
	}

	// ---- Terminal pongs / terminal sheung sets ----
	const termPongs = suitedPungs.filter((g) => g.i % 9 === 0 || g.i % 9 === 8).length;
	if (termPongs >= 4) lines.push(['Terminal pongs ×2 sets', 15]);
	else if (termPongs >= 2) lines.push(['Terminal pong set', 3]);
	let termSheungSets = 0;
	for (let s = 0; s < 3; s++)
		if (chows.some((g) => g.i === s * 9) && chows.some((g) => g.i === s * 9 + 6)) termSheungSets++;
	if (termSheungSets >= 2) lines.push(['Terminal sheung sets ×2', 15]);
	else if (termSheungSets === 1) lines.push(['Terminal sheung set', 3]);

	// ---- Step-up sheungs: 5 consecutive (special hand) or 3 consecutive ----
	const chowStarts = chows.map((g) => ({ n: g.i % 9, s: Math.floor(g.i / 9) }));
	let stepUp5 = false;
	if (chows.length === 5) {
		const ns = chowStarts.map((x) => x.n).sort((a, b) => a - b);
		if (ns.every((n, i) => i === 0 || n === ns[i - 1] + 1)) {
			const pure = new Set(chowStarts.map((x) => x.s)).size === 1;
			lines.push([pure ? 'All step-up hand (pure)' : 'All step-up hand (mixed)', pure ? 90 : 20]);
			stepUp5 = true;
		}
	}
	if (!stepUp5)
		for (let n = 0; n <= 4; n++) {
			const a = chowStarts.filter((x) => x.n === n);
			const b = chowStarts.filter((x) => x.n === n + 1);
			const c = chowStarts.filter((x) => x.n === n + 2);
			if (a.length && b.length && c.length) {
				const pure = a.some((x) => b.some((y) => y.s === x.s) && c.some((z) => z.s === x.s));
				lines.push([pure ? 'Pure step-up sheungs' : 'Mixed step-up sheungs', pure ? 10 : 5]);
				break;
			}
		}

	// ---- Gongs ----
	for (const g of gs.filter((g) => g.type === 'kong')) lines.push(g.concealedKong ? ['Concealed gong', 2] : ['Gong', 1]);

	// ---- Concealed pongs (5 includes the 25 all-pong) ----
	const concealedPungs = pungs.filter((g) => !g.open).length;
	if (concealedPungs >= 5) lines.push(['Five concealed pongs', 80]);
	else {
		if (concealedPungs === 4) lines.push(['Four concealed pongs', 15]);
		else if (concealedPungs === 3) lines.push(['Three concealed pongs', 10]);
		else if (concealedPungs === 2) lines.push(['Two concealed pongs', 5]);
		if (allPong) lines.push(['All pong hand', 25]);
	}

	// ---- All-sheung / no flowers-winds-dragons (15 includes the 5) ----
	if (allSheung && noFlowers && noHonours) lines.push(['All sheung, no flowers/winds/dragons', 15]);
	else {
		if (allSheung) lines.push(['All sheung hand', 5]);
		if (noFlowers && noHonours) lines.push(['No flowers, winds or dragons', 5]);
		else {
			if (noFlowers) lines.push(['No flowers', 1]);
			if (noHonours) lines.push(['No winds or dragons', 1]);
		}
	}

	flowerLines(ctx, lines);
	suitLines(all, lines);
	colouredHand(all, lines);
	if (singleWait) lines.push(['Single wait', 2]);
	if (it.pair < 27 && [2, 5, 8].includes((it.pair % 9) + 1)) lines.push(['Good eyes (2, 5 or 8 pair)', 2]);
	return lines;
}

function evalSpecial(ctx: WinContext, name: string, value: number): Line[] {
	const lines: Line[] = [[name, value]];
	if (ctx.selfDraw) lines.push(['Self-draw (zi mo)', 1]);
	flowerLines(ctx, lines);
	return lines;
}

export function scoreTaiwanese(ctx: WinContext): Scored {
	const { counts } = handCounts(ctx.concealed);
	const candidates: Line[][] = [];
	if (ctx.melds.length === 0) {
		if (isThirteenOrphans(counts)) candidates.push(evalSpecial(ctx, '13 Orphans', 90));
		if (isSixteenOrphans(counts)) candidates.push(evalSpecial(ctx, '16 Orphans', 50));
		if (isNicoNico(counts)) {
			const l = evalSpecial(ctx, 'Nico Nico (seven pairs and a pong)', 40);
			suitLines(counts.flatMap((n, i) => (n ? [i] : [])), l);
			candidates.push(l);
		}
	}
	const its = interpretations(ctx.concealed, ctx.melds, 5, ctx.winTile.k, ctx.selfDraw);
	if (its.length) {
		const without = ctx.concealed.filter((t) => t.id !== ctx.winTile.id);
		const single = winningKinds(without, ctx.melds.length, 5).length === 1;
		for (const it of its) candidates.push(evalStandard(ctx, it, single));
	}
	if (!candidates.length) return { valid: false, reason: 'Not a complete hand', lines: [], total: 0, summary: '' };

	let best: { lines: Line[]; total: number } | null = null;
	for (let lines of candidates) {
		let pts = lines.reduce((a, [, v]) => a + v, 0);
		// Chicken hand: a winning hand worth exactly 1 point scores 20 (Gai Wu).
		if (pts === 1 && !lines.some(([n]) => n.includes('Orphans') || n.includes('Nico'))) {
			lines = [['Chicken hand', 20]];
			pts = 20;
		}
		const total = pts + BASE;
		if (!best || total > best.total) best = { lines: [...lines, ['Mahjong base', BASE]], total };
	}
	const b = best!;
	const min = ROUND_MINIMUM[ctx.roundWind];
	const streakBonus = streakBonusFor(ctx.state, ctx.seat, ctx.from);
	const lines: ScoreLine[] = b.lines.map(([name, value]) => ({ name, value }));
	if (streakBonus) lines.push({ name: `Dealer streak ×${ctx.state.streak}`, value: streakBonus });
	const total = b.total + streakBonus;
	if (ctx.state.opts.minimum && b.total < min) {
		return { valid: false, reason: `${b.total} points is below the ${WIND[ctx.roundWind]} round minimum of ${min}`, lines, total, summary: '' };
	}
	return { valid: true, lines, total, summary: `${total} points` };
}

function streakBonusFor(state: GameState, seat: number, from: number | null) {
	if (state.streak <= 0) return 0;
	const dealerInvolved = seat === state.dealer || from === state.dealer || from === null;
	return dealerInvolved ? 2 * state.streak + 1 : 0;
}

export const taiwanese: Variant = {
	id: 'taiwanese',
	name: 'Taiwanese Mahjong',
	tagline: 'Sixteen tiles, flowers, gongs and big point hands.',
	handSize: 16,
	sets: 5,
	wall: { flowers: true, jokers: 0, redFives: false },
	reserve: 16,
	allowChow: true,
	multipleWinners: true,
	startScore: 0,
	riichi: false,
	goulash: false,
	streakOnDraw: false,
	bustOut: false,
	minimumHand: true,
	shantenSpecials: {},
	special: (counts, _j, meldCount) =>
		meldCount === 0 && (isNicoNico(counts) || isThirteenOrphans(counts) || isSixteenOrphans(counts)) ? 'special' : null,
	scoreWin: scoreTaiwanese,
	settleWin(state, wins) {
		const deltas = [0, 0, 0, 0];
		const notes: string[] = [];
		for (const w of wins) {
			if (w.from !== null) {
				deltas[w.from] -= w.scored.total;
				deltas[w.seat] += w.scored.total;
			} else {
				for (let s = 0; s < 4; s++) {
					if (s === w.seat) continue;
					deltas[s] -= w.scored.total;
					deltas[w.seat] += w.scored.total;
				}
			}
		}
		const selfDrawWinner = wins.find((w) => w.from === null);
		if (selfDrawWinner && state.sticks) {
			deltas[selfDrawWinner.seat] += state.sticks;
			notes.push(`Kitty: +${state.sticks}`);
			return { deltas, notes, potTaken: true };
		}
		return { deltas, notes };
	},
	settleDraw() {
		return {
			deltas: [-5, -5, -5, -5],
			notes: ['Wall exhausted: everyone puts 5 into the kitty for the next self-draw winner.'],
			dealerKeeps: false,
			potAdd: 20
		};
	},
	rulesSummary: [
		'LRC (Ladies’ Recreation Club) house scoring. 144 tiles including eight flowers; flowers are set aside and replaced from the back of the wall.',
		'Each player holds 16 tiles; a win is five sets and a pair (17 tiles). The dealer starts with 17.',
		'Chow only from the player before you. Pong, gong and Mahjong from anyone. Mahjong beats pong beats chow.',
		'If you pass a tile you could claim, you cannot claim that tile again until your next draw.',
		'Several players may win on the same discard; each is paid in full.',
		'Add up the scoring rows, then the base of 5. The total must reach the round minimum: East 20, South 22, West 24, North 26.',
		'Discard win: the discarder pays. Self-draw: all three opponents pay. A dealer streak adds 2n+1.',
		'A drawn hand sends 5 from each player to a kitty that the next self-draw winner collects.'
	],
	scoringTable: [
		{ name: 'Mahjong base', value: '5' },
		{ name: 'Flower tiles (each) / Seat flower / season', value: '1 / +1 / +1' },
		{ name: 'No flowers, winds & dragons', value: '5' },
		{ name: 'Seat wind pong / Round wind pong', value: '+1 / +1' },
		{ name: 'Little / Big three winds', value: '15 / 30' },
		{ name: 'Little / Big four winds', value: '50 / 60' },
		{ name: 'Dragon pong', value: '2 each' },
		{ name: 'Little / Big dragons', value: '20 / 40' },
		{ name: 'Sister pongs ×2 / ×3', value: '3 / 10' },
		{ name: 'Neighbour pongs ×2 / ×3 / ×4 / ×5', value: '5 / 15 / 30 / 60' },
		{ name: 'Brother sheungs ×2 / ×3 / ×4', value: '5 / 15 / 30' },
		{ name: 'Sister sheungs ×2 / ×3', value: '3 / 10' },
		{ name: 'Dragon sequence mixed / pure', value: '5–10 / 10–20' },
		{ name: 'Terminal pong set / ×2', value: '3 / 15' },
		{ name: 'Terminal sheung set / ×2', value: '3 / 15' },
		{ name: 'Step-up sheungs mixed / pure (3 sets)', value: '5 / 10' },
		{ name: 'Gong / Concealed gong', value: '1 / 2' },
		{ name: 'Two / Three / Four / Five concealed pongs', value: '5 / 10 / 15 / 80' },
		{ name: 'All pong hand', value: '25' },
		{ name: 'All sheung hand (no flowers/honours: 15)', value: '5' },
		{ name: 'Two-suit / All five suits', value: '5 / 10' },
		{ name: 'Semi-pure / Pure suit hand', value: '30 / 90' },
		{ name: 'Terminals & honours / terminals only', value: '20 / 40' },
		{ name: 'Honours hand (winds & dragons only)', value: '90' },
		{ name: 'LRC Jade / Ruby / Sapphire / Diamond (+ semi-pure 30)', value: '20' },
		{ name: 'All step-up hand mixed / pure', value: '20 / 90' },
		{ name: 'Single wait / Good eyes', value: '2 / 2' },
		{ name: 'Self-draw / Concealed (discard) / Concealed (self-draw)', value: '1 / 5 / 10' },
		{ name: 'Win within 4 / 7 / 10 tiles', value: '80 / 20 / 10' },
		{ name: 'Robbing the gong / Self-draw a gong / Seabed', value: '10 / 30 / 10' },
		{ name: 'Chicken hand (exactly 1 point)', value: '20 (25 with base)' },
		{ name: 'Nico Nico (seven pairs + pong)', value: '40' },
		{ name: '16 Orphans / 13 Orphans', value: '50 / 90' },
		{ name: 'Earthly / Heavenly hand', value: '90 / 100' }
	]
};

export { WIND };
export type { GameState };
