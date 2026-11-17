// Tile kinds:
//   suits      b1-b9 (bamboo), c1-c9 (characters), p1-p9 (circles)
//   winds      we ws ww wn
//   dragons    dr dg dw
//   flowers    f1-f4 (plum, orchid, chrysanthemum, bamboo), s1-s4 (seasons)
//   joker      jk
export type Kind = string;

export interface Tile {
	id: number;
	k: Kind;
	red?: boolean;
}

export const SUITS = ['c', 'p', 'b'] as const;
export const WINDS = ['we', 'ws', 'ww', 'wn'] as const;
export const DRAGONS = ['dr', 'dg', 'dw'] as const;

/** The 34 playable kinds, in counting-array order: b1..b9, c1..c9, p1..p9, winds, dragons. */
export const KINDS34: Kind[] = [
	...['b', 'c', 'p'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => s + n)),
	...WINDS,
	...DRAGONS
];
export const KIND_INDEX: Record<string, number> = Object.fromEntries(KINDS34.map((k, i) => [k, i]));

export const isSuited = (k: Kind) => /^[bcp][1-9]$/.test(k);
export const isWind = (k: Kind) => k[0] === 'w';
export const isDragon = (k: Kind) => k === 'dr' || k === 'dg' || k === 'dw';
export const isHonor = (k: Kind) => isWind(k) || isDragon(k);
export const isFlower = (k: Kind) => /^[fs][1-4]$/.test(k);
export const isJoker = (k: Kind) => k === 'jk';
export const num = (k: Kind) => (isSuited(k) ? Number(k[1]) : 0);
export const suitOf = (k: Kind) => (isSuited(k) ? k[0] : null);
export const isTerminal = (k: Kind) => isSuited(k) && (num(k) === 1 || num(k) === 9);
export const isTermOrHonor = (k: Kind) => isTerminal(k) || isHonor(k);
export const isSimple = (k: Kind) => isSuited(k) && !isTerminal(k);

/** Index helpers for the 34-array. */
export const idxSuited = (i: number) => i < 27;
export const idxNum = (i: number) => (i % 9) + 1;
export const idxTermOrHonor = (i: number) => i >= 27 || i % 9 === 0 || i % 9 === 8;
export const idxIsDragon = (i: number) => i >= 31;
export const idxIsWind = (i: number) => i >= 27 && i <= 30;
export const windIdx = (w: number) => 27 + w; // 0=E 1=S 2=W 3=N
export const sameSuit = (a: number, b: number) => a < 27 && b < 27 && Math.floor(a / 9) === Math.floor(b / 9);

const SUIT_NAME: Record<string, string> = { b: 'Bamboo', c: 'Character', p: 'Circle' };
const HONOR_NAME: Record<string, string> = {
	we: 'East',
	ws: 'South',
	ww: 'West',
	wn: 'North',
	dr: 'Red',
	dg: 'Green',
	dw: 'White',
	jk: 'Joker'
};
const FLOWER_NAME = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
const SEASON_NAME = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function kindName(k: Kind): string {
	if (isSuited(k)) return `${num(k)} ${SUIT_NAME[k[0]]}`;
	if (k[0] === 'f') return FLOWER_NAME[Number(k[1]) - 1];
	if (k[0] === 's') return SEASON_NAME[Number(k[1]) - 1];
	return HONOR_NAME[k] ?? k;
}

export const WIND_NAMES = ['East', 'South', 'West', 'North'];
export const WIND_SHORT = ['E', 'S', 'W', 'N'];

/** Display / sort order: characters, circles, bamboo, winds, dragons, flowers, jokers. */
export function sortKey(k: Kind): number {
	if (isSuited(k)) return 'cpb'.indexOf(k[0]) * 10 + num(k);
	if (isWind(k)) return 40 + WINDS.indexOf(k as (typeof WINDS)[number]);
	if (isDragon(k)) return 50 + DRAGONS.indexOf(k as (typeof DRAGONS)[number]);
	if (isFlower(k)) return (k[0] === 'f' ? 60 : 70) + Number(k[1]);
	return 90;
}

export function sortTiles(tiles: Tile[]): Tile[] {
	return [...tiles].sort((a, b) => sortKey(a.k) - sortKey(b.k) || Number(!!b.red) - Number(!!a.red) || a.id - b.id);
}

/** Counting array (34) for the non-flower, non-joker tiles. */
export function countsOf(kinds: Kind[]): number[] {
	const c = new Array(34).fill(0);
	for (const k of kinds) {
		const i = KIND_INDEX[k];
		if (i !== undefined) c[i]++;
	}
	return c;
}

// ---- seeded RNG (mulberry32), kept as a plain number in game state ----
export function nextRandom(seed: number): [number, number] {
	let t = (seed + 0x6d2b79f5) | 0;
	const nextSeed = t;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return [((t ^ (t >>> 14)) >>> 0) / 4294967296, nextSeed];
}

export interface WallOptions {
	flowers: boolean;
	jokers: number;
	redFives: boolean;
}

export function buildTiles(opts: WallOptions): Tile[] {
	const tiles: Tile[] = [];
	let id = 0;
	for (const k of KINDS34) {
		for (let n = 0; n < 4; n++) {
			const red = opts.redFives && isSuited(k) && num(k) === 5 && n === 0;
			tiles.push(red ? { id: id++, k, red: true } : { id: id++, k });
		}
	}
	if (opts.flowers) for (const k of ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4']) tiles.push({ id: id++, k });
	for (let n = 0; n < opts.jokers; n++) tiles.push({ id: id++, k: 'jk' });
	return tiles;
}

export function shuffle<T>(arr: T[], seed: number): [T[], number] {
	const a = [...arr];
	let s = seed;
	for (let i = a.length - 1; i > 0; i--) {
		let r: number;
		[r, s] = nextRandom(s);
		const j = Math.floor(r * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return [a, s];
}

/**
 * "Organise" a hand: finished sets first (pungs, then runs), then pairs and two-tile
 * shapes, then loose tiles, each group in suit order. Jokers and flowers go last.
 */
/** ways a player can sort their hand */
export type SortMode = 'pungs' | 'chows' | 'pairs' | 'suit' | 'number' | 'honoursFirst';
export const SORT_MODES: { id: SortMode; label: string }[] = [
	{ id: 'pungs', label: 'Pungs first' },
	{ id: 'chows', label: 'Chows first' },
	{ id: 'pairs', label: 'Pairs first' },
	{ id: 'suit', label: 'By suit' },
	{ id: 'number', label: 'By number' },
	{ id: 'honoursFirst', label: 'Honours first' }
];
export function sortHand(tiles: Tile[], mode: SortMode): Tile[] {
	if (mode === 'pungs' || mode === 'chows' || mode === 'pairs') return organiseTiles(tiles, mode);
	if (mode === 'suit') return sortTiles(tiles);
	const key = (k: Kind) => {
		const base = sortKey(k);
		if (mode === 'number') return isSuited(k) ? num(k) * 10 + 'cpb'.indexOf(k[0]) : 100 + base; // all the 1s, then 2s… then honours
		return isSuited(k) ? 100 + base : base; // winds, dragons, flowers, then the suits
	};
	return [...tiles].sort((a, b) => key(a.k) - key(b.k) || a.id - b.id);
}

export function organiseTiles(tiles: Tile[], first: 'pungs' | 'chows' | 'pairs' = 'pungs'): Tile[] {
	let rest = sortTiles(tiles);
	const take = (pick: (t: Tile, pool: Tile[]) => Tile[] | null) => {
		const out: Tile[][] = [];
		for (let i = 0; i < rest.length; ) {
			const got = pick(rest[i], rest);
			if (got) {
				out.push(got);
				const ids = new Set(got.map((t) => t.id));
				rest = rest.filter((t) => !ids.has(t.id));
				i = 0;
			} else i++;
		}
		return out;
	};
	const same = (t: Tile, pool: Tile[], n: number) => {
		if (isJoker(t.k) || isFlower(t.k)) return null;
		const g = pool.filter((x) => x.k === t.k);
		return g.length >= n ? g.slice(0, n) : null;
	};
	const run = (t: Tile, pool: Tile[], len: number) => {
		if (!isSuited(t.k)) return null;
		const s = t.k[0];
		const n = num(t.k);
		const seq = [t];
		for (let d = 1; d < len; d++) {
			const x = pool.find((y) => y.k === `${s}${n + d}`);
			if (!x) return null;
			seq.push(x);
		}
		return seq;
	};
	const bySuit = (gs: Tile[][]) => gs.sort((a, b) => sortKey(a[0].k) - sortKey(b[0].k)).flat();
	const pungsOf = () => bySuit(take((t, p) => same(t, p, 3)));
	const chowsOf = () => bySuit(take((t, p) => run(t, p, 3)));
	const pairsOf = () => bySuit(take((t, p) => same(t, p, 2)));
	let groups: Tile[][];
	if (first === 'chows') {
		const c = chowsOf();
		groups = [c, pungsOf(), pairsOf()];
	} else if (first === 'pairs') {
		const pr = pairsOf();
		groups = [pr, pungsOf(), chowsOf()];
	} else {
		const pg = pungsOf();
		groups = [pg, chowsOf(), pairsOf()];
	}
	const twos = bySuit(take((t, p) => run(t, p, 2)));
	const extras = rest.filter((t) => isJoker(t.k) || isFlower(t.k));
	const loose = rest.filter((t) => !isJoker(t.k) && !isFlower(t.k));
	return [...groups.flat(), ...twos, ...loose, ...extras];
}
