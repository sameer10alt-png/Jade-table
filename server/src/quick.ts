// Quick match: a waiting line per game type, shared by guests and signed-in players.
// Four real people waiting for the same game → a table at once. Two or three → a table a few
// seconds after the last one arrived. Alone → named players join and the table starts within
// seconds when nobody else is around, or a bit later when other people are online and might join.
// Filled seats are bots with human names, pictures and records, at the player's skill level.
// The line lives in memory (one Node server on Railway); after a restart the waiting page
// rejoins with its original start time, so the timer and names don't reset.
import type { BotLevel, VariantId } from '../../app/src/lib/engine/types';
import { VARIANTS } from '../../app/src/lib/engine/game';
import { fillProfile, seeded, type Profile } from '../../app/src/lib/online/profile';

/** alone and nobody else online: players "join" at these times and the table starts at START */
const FAST_BASE = { joins: [900, 1900, 2900], start: 3600 };
const FAST = { ...FAST_BASE, joins: [...FAST_BASE.joins] };
/** alone but other people are online (one of them might join): a little longer */
const SLOW_BASE = { joins: [5_000, 8_500, 11_500], start: 13_000 };
const SLOW = { ...SLOW_BASE, joins: [...SLOW_BASE.joins] };
/** admin: how quickly empty seats fill (1 = normal, 2 = twice as slow, 0.5 = twice as fast) */
export function setFillPace(mult: number) {
	const m = Math.max(0.5, Math.min(6, mult));
	FAST.joins = FAST_BASE.joins.map((x) => x * m);
	FAST.start = FAST_BASE.start * m;
	SLOW.joins = SLOW_BASE.joins.map((x) => x * m);
	SLOW.start = SLOW_BASE.start * m;
}
/** with 2-3 real people: start this long after the last one arrived */
const GROUP_SETTLE = 3_000;
/** a waiting page checks in every ~2 s; silent this long = they left */
const STALE_MS = 30_000;
const MATCHED_KEEP_MS = 60_000;
const MAX_WAITING = 400;
/** a page coming back after a server restart may keep its original start time this long */
const RESTORE_MS = 3 * 60_000;

// A pool of ordinary first names so filled seats read as people, not "Bot 1".
const FILL_NAMES = [
	'Ploy', 'Mint', 'Arm', 'Nok', 'Ming', 'Lek', 'Fah', 'Gap', 'June', 'Nan', 'Tar', 'Bee',
	'Som', 'Aon', 'Noon', 'Ice', 'Praew', 'Boss', 'Kao', 'Pim', 'Oat', 'View', 'Mild', 'Nice',
	'Leo', 'Mia', 'Kai', 'Sam', 'Ava', 'Finn', 'Noa', 'Rin', 'Yuki', 'Haru', 'Wei', 'Lin',
	'Priya', 'Arjun', 'Neha', 'Rohan', 'Tara', 'Dev', 'Ana', 'Lucas', 'Emma', 'Noah', 'Chloe', 'Ethan',
	'Hana', 'Sora', 'Jun', 'Mei', 'Kenji', 'Aiko', 'Tom', 'Lily', 'Max', 'Zoe', 'Ben', 'Ella'
];
function pickNames(n: number, seed: string): string[] {
	const r = seeded(seed);
	const pool = FILL_NAMES.slice();
	const out: string[] = [];
	for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
	return out;
}

interface Waiter {
	pid: string;
	name: string;
	picture: string | null;
	variant: VariantId;
	level: BotLevel;
	fill: string[]; // human-looking names used for the simulated joiners / bot seats
	seed: string;
	joinedAt: number;
	seenAt: number;
	now?: boolean;
	code?: string;
	matchedAt?: number;
}

export interface Joined {
	name: string;
	picture: string | null;
}

export type QuickStatus =
	| { state: 'waiting'; variant: VariantId; waiting: number; waitedMs: number; startsInMs: number; joined: Joined[]; since: number }
	| { state: 'matched'; code: string }
	| { state: 'none' };

/** makes the table and seats these players; bots fill the rest using `fill` names at `level`. returns its code */
export type MakeTable = (
	variant: VariantId,
	players: { pid: string; name: string }[],
	fill: { names: string[]; level: BotLevel; profiles: Profile[] }
) => Promise<string>;

/** real people active elsewhere on the site right now (other lines, online tables), not counting `pid` */
export type OthersOnline = (pid: string) => number;

export class QuickQueue {
	private waiters = new Map<string, Waiter>();
	private busy: Promise<void> = Promise.resolve();

	constructor(
		private makeTable: MakeTable,
		private othersOnline: OthersOnline = () => 0
	) {}

	/** `since`: when this page first joined (sent again after a server restart, so nothing resets) */
	async join(pid: string, name: string, variant: VariantId, level: BotLevel = 'intermediate', since?: number, picture: string | null = null): Promise<QuickStatus> {
		if (!VARIANTS[variant]) return { state: 'none' };
		const now = Date.now();
		const w = this.waiters.get(pid);
		if (w && !w.code && w.variant === variant) {
			w.seenAt = now;
			w.level = level;
		} else {
			if (this.waiters.size >= MAX_WAITING) return { state: 'none' };
			const joinedAt = since && since <= now && now - since < RESTORE_MS ? since : now;
			const seed = `${pid}:${joinedAt}`;
			this.waiters.set(pid, { pid, name, picture, variant, level, fill: pickNames(3, seed), seed, joinedAt, seenAt: now });
		}
		return this.status(pid);
	}

	async status(pid: string): Promise<QuickStatus> {
		const w = this.waiters.get(pid);
		if (w && !w.code) w.seenAt = Date.now();
		await this.match();
		return this.view(pid);
	}

	async now(pid: string): Promise<QuickStatus> {
		const w = this.waiters.get(pid);
		if (w && !w.code) w.now = true;
		return this.status(pid);
	}

	leave(pid: string) {
		const w = this.waiters.get(pid);
		if (w && !w.code) this.waiters.delete(pid);
	}

	/** people waiting in any line, other than `pid` */
	activeOthers(pid: string): number {
		const now = Date.now();
		return [...this.waiters.values()].filter((w) => w.pid !== pid && !w.code && now - w.seenAt < STALE_MS).length;
	}

	counts(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const w of this.waiters.values()) if (!w.code && Date.now() - w.seenAt < STALE_MS) out[w.variant] = (out[w.variant] ?? 0) + 1;
		return out;
	}

	/** the line for a variant, longest-waiting first */
	private line(variant: VariantId): Waiter[] {
		return [...this.waiters.values()].filter((x) => !x.code && x.variant === variant).sort((a, b) => a.joinedAt - b.joinedAt);
	}

	/** timing for a line: when bots "join" and when the table starts (ms since epoch) */
	private plan(line: Waiter[]): { joins: number[]; startAt: number } {
		const head = line[0];
		if (line.length >= 2) {
			const startAt = Math.max(head.joinedAt + FAST.start, line[line.length - 1].joinedAt + GROUP_SETTLE);
			return { joins: FAST.joins.map((o) => head.joinedAt + o), startAt };
		}
		const t = this.othersOnline(head.pid) > 0 ? SLOW : FAST;
		return { joins: t.joins.map((o) => head.joinedAt + o), startAt: head.joinedAt + t.start };
	}

	private view(pid: string): QuickStatus {
		const w = this.waiters.get(pid);
		if (!w) return { state: 'none' };
		if (w.code) return { state: 'matched', code: w.code };
		const line = this.line(w.variant).slice(0, 4);
		const now = Date.now();
		const { joins, startAt } = this.plan(line);
		const head = line[0];
		// other real people first, then the filled seats that have "joined" so far
		const people: Joined[] = line.filter((x) => x.pid !== pid).map((x) => ({ name: x.name, picture: x.picture }));
		const room = 4 - line.length;
		const arrived = joins.filter((t) => now >= t).length;
		const fill = head.fill.slice(0, Math.min(room, arrived)).map((n) => ({ name: n, picture: fillProfile(n, head.level, head.seed).picture }));
		return {
			state: 'waiting',
			variant: w.variant,
			waiting: line.length,
			waitedMs: now - w.joinedAt,
			startsInMs: Math.max(0, startAt - now),
			joined: [...people, ...fill],
			since: w.joinedAt
		};
	}

	private match(): Promise<void> {
		this.busy = this.busy.then(() => this.matchNow()).catch((e) => console.error('quick match failed', e));
		return this.busy;
	}

	private async matchNow() {
		const now = Date.now();
		for (const [pid, w] of this.waiters) {
			if (w.code ? now - w.matchedAt! > MATCHED_KEEP_MS : now - w.seenAt > STALE_MS) this.waiters.delete(pid);
		}
		const byVariant = new Map<VariantId, Waiter[]>();
		for (const w of this.waiters.values()) {
			if (w.code) continue;
			byVariant.set(w.variant, [...(byVariant.get(w.variant) ?? []), w]);
		}
		for (const [variant, line] of byVariant) {
			line.sort((a, b) => a.joinedAt - b.joinedAt);
			// four real people first, longest-waiting first
			while (line.length >= 4) await this.seat(variant, line.splice(0, 4));
			// otherwise start when the plan says, or on an explicit start-now
			if (line.length && (now >= this.plan(line).startAt || line.some((w) => w.now))) await this.seat(variant, line.splice(0, 4));
		}
	}

	private async seat(variant: VariantId, group: Waiter[]) {
		const host = group[0];
		const botsNeeded = Math.max(0, 4 - group.length);
		const names = host.fill.slice(0, botsNeeded);
		const code = await this.makeTable(
			variant,
			group.map((w) => ({ pid: w.pid, name: w.name })),
			{ names, level: host.level, profiles: names.map((n) => fillProfile(n, host.level, host.seed)) }
		);
		const at = Date.now();
		for (const w of group) {
			w.code = code;
			w.matchedAt = at;
		}
	}
}
