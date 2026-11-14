// Quick match: a waiting line per game type, shared by guests and signed-in players.
// Four real people waiting for the same game → a table at once. Otherwise, so a lone player
// isn't staring at an empty lobby, named "players" join over ~15–22s and the table starts at
// ~24s; those seats are bots with human-looking names, matched to the player's skill level.
// The line lives in memory (one Node server on Railway); a restart just empties it.
import type { BotLevel, VariantId } from '../../app/src/lib/engine/types';
import { VARIANTS } from '../../app/src/lib/engine/game';

/** when the simulated players "join" (ms since you started waiting) */
const JOIN_OFFSETS = [15_000, 19_000, 22_000];
/** the table starts (filling any empty seats with bots) at this point if 4 real people haven't matched */
export const START_MS = 24_000;
/** a waiting page checks in every ~2 s; silent this long = they left */
const STALE_MS = 12_000;
const MATCHED_KEEP_MS = 60_000;
const MAX_WAITING = 400;

// A pool of ordinary first names so filled seats read as people, not "Bot 1".
const FILL_NAMES = [
	'Ploy', 'Mint', 'Arm', 'Nok', 'Ming', 'Lek', 'Fah', 'Gap', 'June', 'Nan', 'Tar', 'Bee',
	'Som', 'Aon', 'Noon', 'Ice', 'Praew', 'Boss', 'Kao', 'Pim', 'Oat', 'View', 'Mild', 'Nice',
	'Leo', 'Mia', 'Kai', 'Sam', 'Ava', 'Finn', 'Noa', 'Rin', 'Yuki', 'Haru', 'Wei', 'Lin'
];
function pickNames(n: number): string[] {
	const pool = FILL_NAMES.slice();
	const out: string[] = [];
	for (let i = 0; i < n && pool.length; i++) out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
	return out;
}

interface Waiter {
	pid: string;
	name: string;
	variant: VariantId;
	level: BotLevel;
	fill: string[]; // human-looking names used for the simulated joiners / bot seats
	joinedAt: number;
	seenAt: number;
	now?: boolean;
	code?: string;
	matchedAt?: number;
}

export type QuickStatus =
	| { state: 'waiting'; variant: VariantId; waiting: number; waitedMs: number; startsInMs: number; joined: string[] }
	| { state: 'matched'; code: string }
	| { state: 'none' };

/** makes the table and seats these players; bots fill the rest using `fill` names at `level`. returns its code */
export type MakeTable = (
	variant: VariantId,
	players: { pid: string; name: string }[],
	fill: { names: string[]; level: BotLevel }
) => Promise<string>;

export class QuickQueue {
	private waiters = new Map<string, Waiter>();
	private busy: Promise<void> = Promise.resolve();

	constructor(private makeTable: MakeTable) {}

	async join(pid: string, name: string, variant: VariantId, level: BotLevel = 'intermediate'): Promise<QuickStatus> {
		if (!VARIANTS[variant]) return { state: 'none' };
		const now = Date.now();
		const w = this.waiters.get(pid);
		if (w && !w.code && w.variant === variant) {
			w.seenAt = now;
			w.level = level;
		} else {
			if (this.waiters.size >= MAX_WAITING) return { state: 'none' };
			this.waiters.set(pid, { pid, name, variant, level, fill: pickNames(3), joinedAt: now, seenAt: now });
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

	counts(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const w of this.waiters.values()) if (!w.code && Date.now() - w.seenAt < STALE_MS) out[w.variant] = (out[w.variant] ?? 0) + 1;
		return out;
	}

	private view(pid: string): QuickStatus {
		const w = this.waiters.get(pid);
		if (!w) return { state: 'none' };
		if (w.code) return { state: 'matched', code: w.code };
		const waiting = [...this.waiters.values()].filter((x) => !x.code && x.variant === w.variant).length;
		const waitedMs = Date.now() - w.joinedAt;
		// how many simulated players have "joined" so far (only matters when you're waiting alone)
		const joined = waiting >= 4 ? [] : w.fill.filter((_, i) => waitedMs >= JOIN_OFFSETS[i]);
		return { state: 'waiting', variant: w.variant, waiting, waitedMs, startsInMs: Math.max(0, START_MS - waitedMs), joined };
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
			// otherwise start once the lobby "filled" (START_MS), or on an explicit start-now
			if (line.length && (now - line[0].joinedAt >= START_MS || line.some((w) => w.now))) await this.seat(variant, line.splice(0, 4));
		}
	}

	private async seat(variant: VariantId, group: Waiter[]) {
		const host = group[0];
		const botsNeeded = Math.max(0, 4 - group.length);
		const code = await this.makeTable(
			variant,
			group.map((w) => ({ pid: w.pid, name: w.name })),
			{ names: host.fill.slice(0, botsNeeded), level: host.level }
		);
		const at = Date.now();
		for (const w of group) {
			w.code = code;
			w.matchedAt = at;
		}
	}
}
