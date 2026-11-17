// Saved progress: points (Elo-style rating), win/draw/loss counts, a history of every rated
// hand, and saved practice diagnostics. Online hands are rated by the server itself; hands
// played offline against bots are reported by the browser (worth less, rate-limited).
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
	BOT_RATING,
	GUEST_RATING,
	handDeltas,
	K_BOTS,
	K_ONLINE,
	outcomesOf,
	rankFor,
	START_RATING,
	type HandOutcome
} from '../../app/src/lib/ranks';
import { currentUser, getDb, type User } from './accounts';
import type { Room } from './core/table';
import { awardHand } from './rewards';

const OFFLINE_MIN_GAP_MS = 15_000; // one offline hand report per 15 s at most

export async function migrateProgress() {
	const db = getDb();
	if (!db) return;
	await db.query(`alter table users add column if not exists rating integer`);
	await db.query(`alter table users add column if not exists wins integer not null default 0`);
	await db.query(`alter table users add column if not exists losses integer not null default 0`);
	await db.query(`alter table users add column if not exists draws integer not null default 0`);
	await db.query(`
		create table if not exists rating_events (
			id bigserial primary key,
			user_id bigint not null references users(id) on delete cascade,
			outcome text not null,
			delta integer not null,
			rating integer not null,
			source text not null,
			hand_key text,
			created_at timestamptz not null default now()
		)`);
	await db.query(`create index if not exists rating_events_user on rating_events (user_id, created_at desc)`);
	await db.query(`alter table rating_events add column if not exists variant text`);
	await db.query(`create index if not exists rating_events_time on rating_events (created_at)`);
	await db.query(`create unique index if not exists rating_events_key on rating_events (user_id, hand_key)`);
	await db.query(`
		create table if not exists diagnostics (
			id bigserial primary key,
			user_id bigint not null references users(id) on delete cascade,
			data jsonb not null,
			created_at timestamptz not null default now()
		)`);
	await db.query(`create index if not exists diagnostics_user on diagnostics (user_id, created_at desc)`);
	// real records for the filled seats (bots), by name, from online hands they actually played
	await db.query(`
		create table if not exists bot_stats (
			name text primary key,
			hands integer not null default 0,
			wins integer not null default 0,
			created_at timestamptz not null default now()
		)`);
}

/** count one finished online hand for every bot seat at the table */
async function recordBotHand(room: Room) {
	const db = getDb();
	const g = room.game;
	if (!db || !g?.result) return;
	const outcomes = outcomesOf(g.result, g.players.length);
	await Promise.all(
		g.players.map((p, i) =>
			p.bot && !room.seats[i]
				? db
						.query(
							`insert into bot_stats (name, hands, wins) values ($1, 1, $2)
							 on conflict (name) do update set hands = bot_stats.hands + 1, wins = bot_stats.wins + $2`,
							[p.name, outcomes[i] === 'win' ? 1 : 0]
						)
						.catch((e) => console.error('bot stats', e))
				: null
		)
	);
}

/** real records of these filled-seat names */
export async function botStats(names: string[]) {
	const out = new Map<string, { hands: number; wins: number; since: string }>();
	const db = getDb();
	if (!db || !names.length) return out;
	const { rows } = await db.query<{ name: string; hands: number; wins: number; created_at: string | Date }>(
		`select name, hands, wins, created_at from bot_stats where name = any($1::text[])`,
		[names]
	);
	for (const r of rows) {
		const d = new Date(r.created_at);
		out.set(r.name, { hands: Number(r.hands), wins: Number(r.wins), since: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
	}
	return out;
}

const startFor = (skill: string | null | undefined) => START_RATING[skill ?? ''] ?? START_RATING.intermediate;

async function ratingOf(userId: number): Promise<number> {
	const db = getDb()!;
	const { rows } = await db.query<{ rating: number | null; skill: string | null }>(
		`select rating, skill from users where id = $1`,
		[userId]
	);
	if (!rows[0]) return GUEST_RATING;
	return rows[0].rating ?? startFor(rows[0].skill);
}

/** Save one rated hand for one account. Returns the new rating, or null if already counted. */
/** bumped on every new online win, so the leaderboard refreshes straight after a game */
let boardVersion = 0;
export const leaderboardVersion = () => boardVersion;

async function applyHand(userId: number, outcome: HandOutcome, delta: number, source: string, key: string, variant: string | null = null) {
	const db = getDb()!;
	const before = await ratingOf(userId);
	const after = Math.max(0, before + delta);
	const ins = await db.query<{ id: number }>(
		`insert into rating_events (user_id, outcome, delta, rating, source, hand_key, variant)
		 values ($1, $2, $3, $4, $5, $6, $7) on conflict (user_id, hand_key) do nothing returning id`,
		[userId, outcome, after - before, after, source, key, variant]
	);
	if (!ins.rows.length) return null;
	if (source === 'online' && outcome === 'win') boardVersion++;
	const col = outcome === 'win' ? 'wins' : outcome === 'draw' ? 'draws' : 'losses';
	await db.query(`update users set rating = $2, ${col} = ${col} + 1 where id = $1`, [userId, after]);
	const jade = await awardHand(userId, outcome, source === 'online').catch((e) => (console.error('jade', e), 0));
	return { before, after, delta: after - before, jade };
}

const userIdOf = (pid: string | undefined) => {
	const m = pid?.match(/^account-(\d+)$/);
	return m ? Number(m[1]) : null;
};

/** Rate a finished online hand (called by the table once per hand). */
export async function rateOnlineHand(room: Room) {
	const db = getDb();
	const g = room.game;
	if (!db || !g?.result) return;
	if (room.adminTouched) return; // an admin used a test power: nothing here counts
	await recordBotHand(room);
	const humans = room.seats.filter(Boolean).length;
	const k = humans >= 2 ? K_ONLINE : K_BOTS; // a game of you vs bots is worth less
	const outcomes = outcomesOf(g.result, g.players.length);
	const ids = g.players.map((_, i) => userIdOf(room.seats[i]?.playerId));
	const ratings = await Promise.all(
		g.players.map(async (p, i) => {
			const id = ids[i];
			if (id !== null) return ratingOf(id);
			if (room.seats[i]) return GUEST_RATING; // guest
			return BOT_RATING[p.bot ?? 'intermediate'] ?? BOT_RATING.intermediate;
		})
	);
	const deltas = handDeltas(
		ratings.map((rating, i) => ({ rating, outcome: outcomes[i] })),
		k
	);
	const source = humans >= 2 ? 'online' : 'bots';
	await Promise.all(
		ids.map((id, i) =>
			id === null ? null : applyHand(id, outcomes[i], deltas[i], source, `${room.code}:${g.opts.seed}:${g.handNo}`, g.opts.variant).catch((e) => console.error('rating', e))
		)
	);
}

// ---- HTTP ----

async function body(req: IncomingMessage, limit = 4000): Promise<Record<string, unknown>> {
	let s = '';
	for await (const c of req) {
		s += c;
		if (s.length > limit) throw new Error('too large');
	}
	return (JSON.parse(s || '{}') as Record<string, unknown>) ?? {};
}

function send(res: ServerResponse, status: number, data: unknown) {
	res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
	res.end(JSON.stringify(data));
}

const lastOffline = new Map<number, number>();

async function progressOf(user: User) {
	const db = getDb()!;
	const [{ rows: u }, { rows: history }, { rows: diags }] = await Promise.all([
		db.query<{ rating: number | null; skill: string | null; wins: number; losses: number; draws: number }>(
			`select rating, skill, wins, losses, draws from users where id = $1`,
			[user.id]
		),
		db.query<{ outcome: string; delta: number; rating: number; source: string; created_at: string }>(
			`select outcome, delta, rating, source, created_at from rating_events where user_id = $1 order by id desc limit 60`,
			[user.id]
		),
		db.query<{ id: number; data: unknown; created_at: string }>(
			`select id, data, created_at from diagnostics where user_id = $1 order by id desc limit 10`,
			[user.id]
		)
	]);
	const row = u[0];
	const rating = row?.rating ?? startFor(row?.skill);
	return {
		enabled: true,
		signedIn: true,
		rating,
		rank: rankFor(rating).name,
		start: startFor(row?.skill),
		wins: row?.wins ?? 0,
		losses: row?.losses ?? 0,
		draws: row?.draws ?? 0,
		history: history.reverse().map((h) => ({ ...h, at: h.created_at })),
		diagnostics: diags.map((d) => ({ id: d.id, at: d.created_at, report: d.data }))
	};
}

export async function handleProgress(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	if (!url.pathname.startsWith('/api/progress')) return false;
	if (!getDb()) {
		send(res, 200, { enabled: false, signedIn: false });
		return true;
	}
	const user = await currentUser(req);
	if (url.pathname === '/api/progress' && req.method === 'GET') {
		send(res, 200, user ? await progressOf(user) : { enabled: true, signedIn: false });
		return true;
	}
	if (!user) {
		send(res, 401, { error: 'Not signed in' });
		return true;
	}
	// a hand you played offline against bots
	if (url.pathname === '/api/progress/hand' && req.method === 'POST') {
		const b = await body(req).catch(() => ({}) as Record<string, unknown>);
		const outcome = String(b.outcome) as HandOutcome;
		const key = typeof b.key === 'string' ? b.key.slice(0, 80) : '';
		const opp = Array.isArray(b.opponents) ? b.opponents.slice(0, 3).map(String) : [];
		if (!['win', 'loss', 'dealin', 'draw'].includes(outcome) || !key || opp.length !== 3) {
			send(res, 400, { error: 'Bad request' });
			return true;
		}
		const now = Date.now();
		if (now - (lastOffline.get(user.id) ?? 0) < OFFLINE_MIN_GAP_MS) {
			send(res, 429, { error: 'Too fast' });
			return true;
		}
		lastOffline.set(user.id, now);
		// rebuild the table: you plus the three bots; who dealt in among them doesn't change your points
		const mine = await ratingOf(user.id);
		const oppOutcome: HandOutcome = outcome === 'win' ? 'loss' : outcome === 'draw' ? 'draw' : 'loss';
		const seats = [
			{ rating: mine, outcome },
			...opp.map((lvl, i) => ({
				rating: BOT_RATING[lvl] ?? BOT_RATING.intermediate,
				// someone has to win if you lost
				outcome: (outcome === 'loss' || outcome === 'dealin') && i === 0 ? ('win' as HandOutcome) : oppOutcome
			}))
		];
		const delta = handDeltas(seats, K_BOTS)[0];
		const variant = ['riichi', 'taiwanese', 'bombay', 'international'].includes(String(b.variant)) ? String(b.variant) : null;
		const r = await applyHand(user.id, outcome, delta, 'bots', `offline:${key}`, variant);
		send(res, 200, r ? { ...r, rank: rankFor(r.after).name } : { duplicate: true });
		return true;
	}
	if (url.pathname === '/api/progress/diagnostic' && req.method === 'POST') {
		const b = await body(req, 20_000).catch(() => null);
		if (!b || typeof b.report !== 'object' || !b.report) {
			send(res, 400, { error: 'Bad request' });
			return true;
		}
		const db = getDb()!;
		await db.query(`insert into diagnostics (user_id, data) values ($1, $2)`, [user.id, JSON.stringify(b.report)]);
		// keep the last 20
		await db.query(
			`delete from diagnostics where user_id = $1 and id not in (select id from diagnostics where user_id = $1 order by id desc limit 20)`,
			[user.id]
		);
		send(res, 200, { ok: true });
		return true;
	}
	send(res, 404, { error: 'Not found' });
	return true;
}

/** picture and hand record of these accounts, for the seat cards at a table */
export async function accountProfiles(ids: number[]) {
	const out = new Map<number, { picture: string | null; hands: number; wins: number; since: string | null }>();
	const db = getDb();
	if (!db || !ids.length) return out;
	const { rows } = await db.query<{ id: number; picture: string | null; wins: number; losses: number; draws: number; created_at: string | Date }>(
		`select id, picture, wins, losses, draws, created_at from users where id = any($1::int[])`,
		[ids]
	);
	for (const r of rows) {
		const d = new Date(r.created_at);
		const since = isNaN(+d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		out.set(r.id, { picture: r.picture, hands: r.wins + r.losses + r.draws, wins: r.wins, since });
	}
	return out;
}

/** Top players by wins at online tables (checked by the server, so they can't be faked).
 *  Solo games against the computer don't count: their results come from the browser. */
export async function leaderboard(period: 'week' | 'all', limit = 3) {
	const db = getDb();
	if (!db) return [];
	const since = period === 'week' ? `and e.created_at > now() - interval '7 days'` : '';
	const { rows } = await db.query<{ id: number; name: string; picture: string | null; wins: string; hands: string }>(
		`select u.id, u.name, u.picture,
		        count(*) filter (where e.outcome = 'win') as wins,
		        count(*) as hands
		   from rating_events e join users u on u.id = e.user_id
		  where e.source <> 'bots' and not u.banned ${since}
		  group by u.id, u.name, u.picture
		 having count(*) filter (where e.outcome = 'win') > 0
		  order by wins desc, hands asc, u.id asc
		  limit $1`,
		[limit]
	);
	return rows.map((r) => ({ name: r.name, picture: r.picture, wins: Number(r.wins), hands: Number(r.hands) }));
}
