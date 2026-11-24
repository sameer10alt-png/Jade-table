// American Mahjong (National Mah Jongg League style) on Pung Table.
// - 152 tiles: the 136 standard tiles, 8 flowers (all alike, part of the hand) and 8 jokers.
// - Every hand starts with the Charleston. A win must be one of the hands on the card.
// - Jokers stand in for any tile in a group of 3 or more (pung, kong, quint), never in a single or pair.
// - You may take a discard only to expose a pung, kong or quint, or for Mahjong.
// - On your turn you may swap a tile from your hand for a joker in anyone's exposed group.
// - Discarder pays double; self-drawn wins are paid double by everyone; no jokers doubles the hand.
//
// The card below is Pung Table's own. It is NOT the official NMJL card, which is copyrighted and
// changes every year. Hands follow the usual American categories.
import { isFlower, isJoker, type Tile } from '../tiles';
import type { Meld } from '../types';
import type { Scored, Variant, WinContext } from '../variant';

export interface CardHand {
	id: string;
	cat: string;
	/** groups separated by spaces; a run of the same character is one group. :a/:b/:c = suit.
	 *  F flower · N E W S winds · 0 White (soap) · D the dragon of that suit · R G red/green dragon ·
	 *  1–9 numbers · x y z u v = any number and the next four (a run) */
	pattern: string;
	value: number;
	/** concealed only (C) or may expose groups (X) */
	concealed: boolean;
	note?: string;
	/** allowed starting numbers for x (default: any that fits) */
	base?: number[];
}

export const CARD: CardHand[] = [
	// 2026
	{ id: 'y1', cat: '2026', pattern: 'FF 2026:a 2222:b 6666:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 'y2', cat: '2026', pattern: '2222:a 000 222:b 6666:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 'y3', cat: '2026', pattern: 'FFF 2026:a 2026:b 666:c', value: 30, concealed: false, note: 'Any three suits' },
	{ id: 'y4', cat: '2026', pattern: 'NN EEE WWW SS 2026:a', value: 30, concealed: true, note: 'Any suit' },
	{ id: 'y5', cat: '2026', pattern: 'FF 2026:a 2026:b 2026:c', value: 50, concealed: true, note: 'Any three suits' },
	// 2468
	{ id: 'e1', cat: '2468', pattern: '222:a 4444:a 666:a 8888:a', value: 25, concealed: false, note: 'Any one suit' },
	{ id: 'e2', cat: '2468', pattern: 'FF 2222:a 44:a 66:b 8888:b', value: 25, concealed: false, note: 'Any two suits' },
	{ id: 'e3', cat: '2468', pattern: '22:a 444:a 66:b 888:b DDDD:c', value: 25, concealed: false, note: 'Any three suits, dragon of the third' },
	{ id: 'e4', cat: '2468', pattern: 'FFFF 2468:a 222:b 888:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 'e5', cat: '2468', pattern: 'FF 22:a 44:a 66:a 88:a 22:b 88:b', value: 50, concealed: true, note: 'Any two suits' },
	// Like numbers
	{ id: 'l1', cat: 'Like Numbers', pattern: 'FF xxxx:a xxxx:b xxxx:c', value: 25, concealed: false, note: 'Any one number in three suits' },
	{ id: 'l2', cat: 'Like Numbers', pattern: 'xxx:a DDDD:a xxx:b DDDD:b', value: 30, concealed: false, note: 'Any number, two suits with their dragons' },
	{ id: 'l3', cat: 'Like Numbers', pattern: 'FFF xxx:a xxxx:b xxxx:c', value: 25, concealed: false, note: 'Any one number in three suits' },
	// Addition
	{ id: 'a1', cat: 'Addition', pattern: 'FF 1111:a 6666:b 7777:b', value: 25, concealed: false, note: '1 + 6 = 7. Any two suits' },
	{ id: 'a2', cat: 'Addition', pattern: 'FF 2222:a 5555:b 7777:c', value: 25, concealed: false, note: '2 + 5 = 7. Any three suits' },
	{ id: 'a3', cat: 'Addition', pattern: 'FF 3333:a 3333:b 6666:c', value: 25, concealed: false, note: '3 + 3 = 6. Any three suits' },
	{ id: 'a4', cat: 'Addition', pattern: 'FF 4444:a 4444:b 8888:a', value: 30, concealed: false, note: '4 + 4 = 8. Any two suits' },
	// Quints
	{ id: 'q1', cat: 'Quints', pattern: 'xxxxx:a yyyy:b zzzzz:c', value: 40, concealed: false, note: 'Any three numbers in a row, three suits' },
	{ id: 'q2', cat: 'Quints', pattern: 'FFFFF xxxxx:a DDDD:a', value: 40, concealed: false, note: 'Any number and its matching dragon' },
	{ id: 'q3', cat: 'Quints', pattern: 'NNNNN EEEE SSSSS', value: 45, concealed: false },
	// Consecutive run
	{ id: 'r1', cat: 'Consecutive Run', pattern: 'xxx:a yyy:a zzzz:a uuuu:a', value: 25, concealed: false, note: 'Any four numbers in a row, one suit' },
	{ id: 'r2', cat: 'Consecutive Run', pattern: 'FF xxxx:a yyyy:b zzzz:c', value: 25, concealed: false, note: 'Any three numbers in a row, three suits' },
	{ id: 'r3', cat: 'Consecutive Run', pattern: 'xxx:a yyyy:a xxx:b yyyy:b', value: 25, concealed: false, note: 'Any two numbers in a row, two suits' },
	{ id: 'r4', cat: 'Consecutive Run', pattern: 'FFFF xyz:a xyz:b DDDD:c', value: 30, concealed: false, note: 'Any three in a row in two suits, dragon of the third' },
	{ id: 'r5', cat: 'Consecutive Run', pattern: 'FF xxx:a yyy:a zzz:a uuu:a', value: 25, concealed: false, note: 'Any four numbers in a row, one suit' },
	// 13579
	{ id: 'o1', cat: '13579', pattern: '111:a 3333:a 555:a 7777:a', value: 25, concealed: false, note: 'Any one suit' },
	{ id: 'o2', cat: '13579', pattern: 'FF 1111:a 33:a 55:b 7777:b', value: 25, concealed: false, note: 'Any two suits' },
	{ id: 'o3', cat: '13579', pattern: '11:a 333:a 55:b 777:b 9999:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 'o4', cat: '13579', pattern: 'FFFF 1357:a 999:b 999:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 'o5', cat: '13579', pattern: '555:a 7777:a 999:a DDDD:b', value: 25, concealed: false, note: 'Any two suits, dragon of the second' },
	// Winds and dragons
	{ id: 'w1', cat: 'Winds & Dragons', pattern: 'NNNN EEE WWW SSSS', value: 25, concealed: false },
	{ id: 'w2', cat: 'Winds & Dragons', pattern: 'FF NNN EE WW SSS DD:a', value: 30, concealed: true, note: 'Any dragon' },
	{ id: 'w3', cat: 'Winds & Dragons', pattern: 'NNN SSS DDDD:a DDDD:b', value: 25, concealed: false, note: 'Any two dragons' },
	{ id: 'w4', cat: 'Winds & Dragons', pattern: 'FF EEEE WWWW 0000', value: 30, concealed: false },
	{ id: 'w5', cat: 'Winds & Dragons', pattern: 'NEWS DDD:a DDD:b DDDD:c', value: 30, concealed: false, note: 'All three dragons' },
	// 369
	{ id: 't1', cat: '369', pattern: '333:a 666:a 9999:a FFFF', value: 25, concealed: false, note: 'Any one suit' },
	{ id: 't2', cat: '369', pattern: 'FF 3333:a 66:b 99:b 3333:c', value: 25, concealed: false, note: 'Any three suits' },
	{ id: 't3', cat: '369', pattern: '369:a 369:b 3333:c 9999:c', value: 30, concealed: false, note: 'Any three suits' },
	// Singles and pairs (always concealed, no jokers possible)
	{ id: 's1', cat: 'Singles & Pairs', pattern: 'xx:a yy:a zz:a xx:b yy:b zz:b DD:c', value: 50, concealed: true, note: 'Three in a row in two suits, dragon pair of the third' },
	{ id: 's2', cat: 'Singles & Pairs', pattern: 'NEWS 13579:a 13579:b', value: 50, concealed: true, note: 'Any two suits' },
	{ id: 's3', cat: 'Singles & Pairs', pattern: 'FF 2468:a 2468:b 2468:c', value: 50, concealed: true, note: 'Any three suits' }
];

// ---- expanding the card into concrete hands ----
const SUIT_PERMS = [
	['c', 'b', 'p'],
	['c', 'p', 'b'],
	['b', 'c', 'p'],
	['b', 'p', 'c'],
	['p', 'c', 'b'],
	['p', 'b', 'c']
];
const DRAGON_OF: Record<string, string> = { c: 'dr', b: 'dg', p: 'dw' };
const WIND: Record<string, string> = { N: 'wn', E: 'we', W: 'ww', S: 'ws' };
const OFFSET: Record<string, number> = { x: 0, y: 1, z: 2, u: 3, v: 4 };
/** flowers are all alike in American Mahjong */
export const cls = (k: string) => (isFlower(k as never) ? 'F' : k);

interface Group {
	k: string;
	n: number;
}
export interface Concrete {
	hand: CardHand;
	groups: Group[];
	/** per tile kind: tiles in singles/pairs (must be real) and in groups of 3+ (jokers OK) */
	need: Map<string, { small: number; big: number }>;
}

function tokens(pattern: string) {
	return pattern.split(' ').map((tok) => {
		const [chars, suit] = tok.split(':');
		const runs: string[] = [];
		for (const ch of chars) {
			if (runs.length && runs[runs.length - 1][0] === ch) runs[runs.length - 1] += ch;
			else runs.push(ch);
		}
		return { runs, suit: suit as 'a' | 'b' | 'c' | undefined };
	});
}

function expand(h: CardHand): Concrete[] {
	const toks = tokens(h.pattern);
	const vars = [...new Set(toks.map((t) => t.suit).filter(Boolean))] as string[];
	const usesX = toks.some((t) => t.runs.some((r) => r[0] in OFFSET));
	const maxOff = Math.max(0, ...toks.flatMap((t) => t.runs.map((r) => OFFSET[r[0]] ?? 0)));
	const bases = usesX ? (h.base ?? [1, 2, 3, 4, 5, 6, 7, 8, 9]).filter((b) => b + maxOff <= 9) : [0];
	const seen = new Set<string>();
	const out: Concrete[] = [];
	for (const perm of SUIT_PERMS) {
		const suitOf = (v?: string) => (v ? perm[vars.indexOf(v)] : 'c');
		for (const base of bases) {
			const groups: Group[] = [];
			for (const t of toks) {
				const s = suitOf(t.suit);
				for (const r of t.runs) {
					const ch = r[0];
					let k: string;
					if (ch === 'F') k = 'F';
					else if (ch in WIND) k = WIND[ch];
					else if (ch === '0') k = 'dw';
					else if (ch === 'D') k = DRAGON_OF[s];
					else if (ch === 'R') k = 'dr';
					else if (ch === 'G') k = 'dg';
					else if (ch in OFFSET) k = s + (base + OFFSET[ch]);
					else k = s + ch;
					groups.push({ k, n: r.length });
				}
			}
			const sig = groups.map((g) => g.k + g.n).sort().join(',');
			if (seen.has(sig)) continue;
			seen.add(sig);
			const need = new Map<string, { small: number; big: number }>();
			for (const g of groups) {
				const e = need.get(g.k) ?? { small: 0, big: 0 };
				if (g.n >= 3) e.big += g.n;
				else e.small += g.n;
				need.set(g.k, e);
			}
			out.push({ hand: h, groups, need });
		}
	}
	return out;
}

export const CONCRETE: Concrete[] = CARD.flatMap(expand);
export const handSize = (h: CardHand) => tokens(h.pattern).reduce((a, t) => a + t.runs.reduce((b, r) => b + r.length, 0), 0);

// ---- matching ----
const meldKind = (m: Meld) => cls(m.tiles.find((t) => !isJoker(t.k))?.k ?? 'jk');

/** the groups an exposed meld can't share: null if the melds don't fit this hand */
function remainingNeed(c: Concrete, melds: Meld[]): Map<string, { small: number; big: number }> | null {
	if (!melds.length) return c.need;
	if (c.hand.concealed) return null;
	const used = new Set<number>();
	const need = new Map([...c.need].map(([k, v]) => [k, { ...v }]));
	for (const m of melds) {
		const k = meldKind(m);
		const i = c.groups.findIndex((g, j) => !used.has(j) && g.k === k && g.n === m.tiles.length);
		if (i < 0) return null;
		used.add(i);
		need.get(k)!.big -= m.tiles.length;
	}
	return need;
}

function countHand(concealed: Tile[]) {
	const counts = new Map<string, number>();
	let jokers = 0;
	for (const t of concealed) {
		if (isJoker(t.k)) jokers++;
		else counts.set(cls(t.k), (counts.get(cls(t.k)) ?? 0) + 1);
	}
	return { counts, jokers };
}

/** tiles still missing for this hand (0 = complete); Infinity if the exposures rule it out */
function missingFor(c: Concrete, counts: Map<string, number>, jokers: number, melds: Meld[]): number {
	const need = remainingNeed(c, melds);
	if (!need) return Infinity;
	let total = 0;
	let usable = 0;
	let jokerRoom = 0;
	for (const [k, { small, big }] of need) {
		total += small + big;
		const have = counts.get(k) ?? 0;
		const s = Math.min(have, small);
		const b = Math.min(Math.max(0, have - small), big);
		usable += s + b;
		jokerRoom += big - b;
	}
	usable += Math.min(jokers, jokerRoom);
	return total - usable;
}

function isComplete(c: Concrete, counts: Map<string, number>, jokers: number, melds: Meld[]) {
	const need = remainingNeed(c, melds);
	if (!need) return false;
	let size = 0;
	let have = 0;
	for (const [k, { small, big }] of need) {
		const n = counts.get(k) ?? 0;
		if (n < small || n > small + big) return false;
		size += small + big;
		have += n;
	}
	for (const k of counts.keys()) if (!need.has(k)) return false;
	return size - have === jokers;
}

export function matches(concealed: Tile[], melds: Meld[]): Concrete[] {
	const { counts, jokers } = countHand(concealed);
	return CONCRETE.filter((c) => isComplete(c, counts, jokers, melds));
}

function distanceOf(concealed: Tile[], melds: Meld[]) {
	const { counts, jokers } = countHand(concealed);
	let missing = Infinity;
	let targets = 0;
	for (const c of CONCRETE) {
		const m = missingFor(c, counts, jokers, melds);
		if (m < missing) {
			missing = m;
			targets = 1;
		} else if (m === missing) targets++;
	}
	return { missing: missing === Infinity ? 14 : missing, targets };
}

/** the nearest card hands, for hints ("closest: 2468 #2, 3 tiles away") */
export function nearest(concealed: Tile[], melds: Meld[], limit = 3) {
	const { counts, jokers } = countHand(concealed);
	const best = new Map<string, { hand: CardHand; missing: number }>();
	for (const c of CONCRETE) {
		const m = missingFor(c, counts, jokers, melds);
		const cur = best.get(c.hand.id);
		if (m < Infinity && (!cur || m < cur.missing)) best.set(c.hand.id, { hand: c.hand, missing: m });
	}
	return [...best.values()].sort((a, b) => a.missing - b.missing || b.hand.value - a.hand.value).slice(0, limit);
}

export const handLabel = (h: CardHand) => `${h.cat} #${CARD.filter((x) => x.cat === h.cat).indexOf(h) + 1}`;

function scoreAmerican(ctx: WinContext): Scored {
	const all = matches(ctx.concealed, ctx.melds);
	if (!all.length) return { valid: false, reason: 'Not a hand on the card.', lines: [], total: 0, summary: '' };
	const best = all.reduce((a, b) => (b.hand.value > a.hand.value ? b : a));
	const tiles = [...ctx.concealed, ...ctx.melds.flatMap((m) => m.tiles)];
	const jokerless = !tiles.some((t) => isJoker(t.k)) && best.hand.cat !== 'Singles & Pairs';
	const lines = [{ name: `${handLabel(best.hand)}: ${best.hand.pattern.replace(/:[abc]/g, '')}`, value: String(best.hand.value) }];
	let total = best.hand.value;
	if (jokerless) {
		lines.push({ name: 'No jokers', value: '×2' });
		total *= 2;
	}
	return { valid: true, lines, total, summary: `${handLabel(best.hand)} · ${total}` };
}

export const american: Variant = {
	id: 'american',
	name: 'American Mahjong',
	tagline: 'The US club game. The Charleston, jokers and a card of hands.',
	handSize: 13,
	sets: 4,
	wall: { flowers: true, jokers: 8, redFives: false },
	reserve: 0,
	allowChow: false,
	multipleWinners: false,
	startScore: 0,
	riichi: false,
	goulash: false,
	american: true,
	rotateDealer: true,
	shantenSpecials: {},
	streakOnDraw: false,
	bustOut: false,
	complete: (concealed, melds) => matches(concealed, melds).length > 0,
	distance: (concealed, melds) => distanceOf(concealed, melds),
	discardDistances: (concealed, melds) => {
		const out = new Map<string, { missing: number; targets: number }>();
		for (const t of concealed) {
			if (out.has(t.k)) continue;
			out.set(
				t.k,
				distanceOf(
					concealed.filter((x) => x.id !== t.id),
					melds
				)
			);
		}
		return out;
	},
	scoreWin: scoreAmerican,
	settleWin(state, wins) {
		const deltas = [0, 0, 0, 0];
		const w = wins[0];
		const v = w.scored.total;
		for (let s = 0; s < 4; s++) {
			if (s === w.seat) continue;
			const pay = w.from === null || s === w.from ? 2 * v : v;
			deltas[s] -= pay;
			deltas[w.seat] += pay;
		}
		return {
			deltas,
			notes: [w.from === null ? 'Self-drawn: everyone pays double.' : `${state.players[w.from].name} threw the winning tile and pays double; the others pay the hand value.`]
		};
	},
	settleDraw() {
		return { deltas: [0, 0, 0, 0], notes: ['Wall game: nobody wins, nobody pays.'], dealerKeeps: false };
	},
	scoringTable: CARD.map((h) => ({
		name: handLabel(h),
		pattern: h.pattern,
		value: `${h.value} ${h.concealed ? 'C' : 'X'}`,
		note: h.note
	})),
	rulesSummary: [
		'152 tiles: the 136 standard tiles, 8 flowers and 8 jokers. Flowers are all alike and are part of your hand.',
		'Every hand starts with the Charleston: pass 3 tiles right, across and left. If everyone agrees, pass again left, across and right. Then an optional courtesy pass of 0–3 tiles across.',
		'To win, your 14 tiles must match a hand on the card. This is Pung Table’s own card, not the official National Mah Jongg League card.',
		'Card key: colours show suits (each colour is a different suit; any suits you like). F flower, N E W S winds, D a dragon (Red goes with Characters, Green with Bamboo, White with Circles), 0 the White dragon. “x y z” means any numbers in a row. X = you may expose groups, C = concealed until Mahjong.',
		'Jokers can stand in for any tile in a pung, kong or quint (3, 4 or 5 alike), never in a single or a pair. A discarded joker can’t be taken.',
		'You may take a discard only to expose a pung, kong or quint for your hand, or to declare Mahjong. No chows. There’s no extra draw after a kong.',
		'On your turn you may swap a matching tile from your hand for a joker in any exposed group, then use the joker.',
		'Paying: the player who threw the winning tile pays double, the others pay the hand value. A self-drawn win is paid double by everyone. A hand with no jokers counts double (not Singles & Pairs).',
		'The deal passes after every hand. If the wall runs out, nobody pays.'
	]
};
