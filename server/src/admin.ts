// God mode: an admin panel for accounts with users.is_admin = true (set it in Railway's Postgres).
// - messages on players' screens (banner or pop-up, everyone or one player, with an expiry)
// - live overview: who's online, queues, tables, sign-ups, hands, Dragon use
// - players: search, ban / unban, reset record, make / remove admin, rename
// - tables: see every live table and who's at it, close one
// - settings: maintenance message, Dragon on / off
// Every admin action is written to admin_log.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentUser, getDb, type User } from './accounts';
import { setTimeLimits } from './core/table';
import { setFillPace } from './quick';

export interface LiveTable {
	code: string;
	variant: string;
	status: string;
	hand: number | null;
	quick: boolean;
	seats: { name: string; person: boolean; online: boolean }[];
	updated: number;
}
/** what only the running server knows: tables in memory, queues, connections */
export interface AdminLive {
	tables(): LiveTable[];
	closeTable(code: string, message: string): Promise<boolean>;
	/** put the admin into a bot's seat mid-game */
	takeSeat(code: string, seat: number, admin: User): Promise<string | null>;
	/** end the hand with this seat winning; only when no other person is at the table */
	forceWin(code: string, seat: number, points: number, admin: User): Promise<string | null>;
	waiting(): Record<string, number>;
	online(): number;
	dragonToday(): number;
}

// ---- site settings (cached; read on every request by other modules) ----
const settings = {
	maintenance: null as string | null,
	dragon: true,
	/** online turn clock, seconds */
	turnSeconds: 30,
	/** online claim window, seconds */
	claimSeconds: 15,
	/** Dragon questions + reviews per player per day */
	dragonLimit: 80,
	/** quick match: how long before empty seats fill (1 = normal) */
	fillPace: 1
};
export const siteSettings = () => settings;
const NUMERIC = { turnSeconds: [10, 120], claimSeconds: [5, 60], dragonLimit: [0, 1000], fillPace: [0.5, 6] } as const;
function applyLive() {
	setTimeLimits(settings.turnSeconds, settings.claimSeconds);
	setFillPace(settings.fillPace);
}

/** count one Dragon use (question or game review) for the stats */
export function noteDragonUse(userId: number, kind: 'ask' | 'review') {
	getDb()
		?.query(
			`insert into dragon_usage (day, user_id, kind, n) values (current_date, $1, $2, 1)
			 on conflict (day, user_id, kind) do update set n = dragon_usage.n + 1`,
			[userId, kind]
		)
		.catch(() => {});
}

export async function migrateAdmin() {
	const db = getDb();
	if (!db) return;
	await db.query(`
		create table if not exists announcements (
			id bigserial primary key,
			text text not null,
			style text not null default 'banner',
			level text not null default 'info',
			link text,
			target_user bigint references users(id) on delete cascade,
			created_by bigint,
			created_at timestamptz not null default now(),
			expires_at timestamptz,
			ended boolean not null default false
		)`);
	await db.query(`create table if not exists site_settings (key text primary key, value jsonb not null)`);
	await db.query(`
		create table if not exists admin_log (
			id bigserial primary key,
			admin_id bigint,
			action text not null,
			detail jsonb,
			created_at timestamptz not null default now()
		)`);
	await db.query(`
		create table if not exists dragon_usage (
			day date not null,
			user_id bigint not null,
			kind text not null,
			n integer not null default 0,
			primary key (day, user_id, kind)
		)`);
	const { rows } = await db.query<{ key: string; value: unknown }>(`select key, value from site_settings`);
	for (const r of rows) {
		if (r.key === 'maintenance') settings.maintenance = typeof r.value === 'string' && r.value ? r.value : null;
		if (r.key === 'dragon') settings.dragon = r.value !== false;
		if (r.key in NUMERIC && typeof r.value === 'number') (settings as Record<string, unknown>)[r.key] = r.value;
	}
	applyLive();
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	let b = '';
	for await (const c of req) {
		b += c;
		if (b.length > 20_000) break;
	}
	try {
		return JSON.parse(b || '{}');
	} catch {
		return {};
	}
}

const LEVELS = new Set(['info', 'warn', 'celebrate']);
const STYLES = new Set(['banner', 'popup']);

export async function handleAdmin(req: IncomingMessage, res: ServerResponse, url: URL, live: AdminLive): Promise<boolean> {
	const send = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};
	const db = getDb();

	// Public: what to show on this player's screen right now
	if (url.pathname === '/api/announcements' && req.method === 'GET') {
		if (!db) return send(200, { items: [], maintenance: null });
		const user = await currentUser(req);
		const { rows } = await db.query<{ id: number; text: string; style: string; level: string; link: string | null }>(
			`select id, text, style, level, link from announcements
			  where not ended and (expires_at is null or expires_at > now())
			    and (target_user is null or target_user = $1)
			  order by id desc limit 5`,
			[user?.id ?? -1]
		);
		return send(200, {
			items: rows.map((r) => ({ ...r, id: Number(r.id) })),
			maintenance: user?.isAdmin ? null : settings.maintenance
		});
	}

	if (!url.pathname.startsWith('/api/admin')) return false;
	if (!db) return send(503, { error: 'No database' });
	const me = await currentUser(req);
	if (!me?.isAdmin) return send(403, { error: 'Admins only' });
	const log = (action: string, detail: unknown) =>
		db.query(`insert into admin_log (admin_id, action, detail) values ($1, $2, $3)`, [me.id, action, JSON.stringify(detail ?? null)]).catch(() => {});
	const path = url.pathname.slice('/api/admin'.length);

	// ---- overview ----
	if (path === '/overview' && req.method === 'GET') {
		const q = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
		const tables = live.tables();
		return send(200, {
			online: live.online(),
			waiting: live.waiting(),
			liveTables: tables.filter((t) => t.status === 'playing').length,
			users: await q(`select count(*) as n from users`),
			signups24h: await q(`select count(*) as n from users where created_at > now() - interval '1 day'`),
			activeToday: await q(`select count(*) as n from users where last_seen > now() - interval '1 day'`),
			banned: await q(`select count(*) as n from users where banned`),
			hands24h: await q(`select count(*) as n from rating_events where created_at > now() - interval '1 day'`),
			onlineHands24h: await q(`select count(*) as n from rating_events where source <> 'bots' and created_at > now() - interval '1 day'`),
			dragonToday: live.dragonToday(),
			settings
		});
	}

	// ---- messages on screens ----
	if (path === '/announce' && req.method === 'POST') {
		const b = await readBody(req);
		const text = String(b.text ?? '').trim().slice(0, 500);
		if (!text) return send(400, { error: 'Write a message first' });
		const style = STYLES.has(String(b.style)) ? String(b.style) : 'banner';
		const level = LEVELS.has(String(b.level)) ? String(b.level) : 'info';
		const minutes = Math.max(0, Math.min(60 * 24 * 30, Number(b.minutes) || 0));
		const link = typeof b.link === 'string' && /^(https?:\/\/|\/)/.test(b.link) ? b.link.slice(0, 300) : null;
		let target: number | null = null;
		if (b.user) {
			const { rows } = await db.query<{ id: number }>(
				`select id from users where id::text = $1 or lower(name) = lower($1) or lower(email) = lower($1) or lower(username) = lower($1) limit 1`,
				[String(b.user).trim()]
			);
			if (!rows[0]) return send(404, { error: 'No player found with that name, email or id' });
			target = Number(rows[0].id);
		}
		const { rows } = await db.query<{ id: number }>(
			`insert into announcements (text, style, level, link, target_user, created_by, expires_at)
			 values ($1, $2, $3, $4, $5, $6, ${minutes ? `now() + ($7 || ' minutes')::interval` : 'null'}) returning id`,
			minutes ? [text, style, level, link, target, me.id, String(minutes)] : [text, style, level, link, target, me.id]
		);
		await log('announce', { id: Number(rows[0].id), text, style, level, target, minutes });
		return send(200, { ok: true, id: Number(rows[0].id) });
	}
	if (path === '/announcements' && req.method === 'GET') {
		const { rows } = await db.query(
			`select a.id, a.text, a.style, a.level, a.link, a.created_at, a.expires_at, a.ended, u.name as target
			   from announcements a left join users u on u.id = a.target_user order by a.id desc limit 50`
		);
		return send(200, { items: rows });
	}
	const endM = path.match(/^\/announcements\/(\d+)\/end$/);
	if (endM && req.method === 'POST') {
		await db.query(`update announcements set ended = true where id = $1`, [Number(endM[1])]);
		await log('end-announcement', { id: Number(endM[1]) });
		return send(200, { ok: true });
	}

	// ---- players ----
	if (path === '/users' && req.method === 'GET') {
		const term = (url.searchParams.get('q') ?? '').trim();
		const { rows } = await db.query(
			`select id, name, email, username, picture, created_at, last_seen, wins, losses, draws, is_admin, banned
			   from users
			  where $1 = '' or id::text = $1 or name ilike '%' || $1 || '%' or email ilike '%' || $1 || '%' or username ilike '%' || $1 || '%'
			  order by last_seen desc limit 50`,
			[term]
		);
		return send(200, { users: rows.map((r) => ({ ...r, id: Number((r as { id: number }).id) })) });
	}
	const userM = path.match(/^\/users\/(\d+)$/);
	if (userM && req.method === 'POST') {
		const id = Number(userM[1]);
		const b = await readBody(req);
		const action = String(b.action);
		if (id === me.id && (action === 'ban' || action === 'removeAdmin')) return send(400, { error: 'You can’t do that to yourself' });
		switch (action) {
			case 'ban':
				await db.query(`update users set banned = true where id = $1`, [id]);
				await db.query(`delete from sessions where user_id = $1`, [id]);
				break;
			case 'unban':
				await db.query(`update users set banned = false where id = $1`, [id]);
				break;
			case 'resetStats':
				await db.query(`update users set wins = 0, losses = 0, draws = 0, rating = null where id = $1`, [id]);
				await db.query(`delete from rating_events where user_id = $1`, [id]);
				break;
			case 'makeAdmin':
				await db.query(`update users set is_admin = true where id = $1`, [id]);
				break;
			case 'removeAdmin':
				await db.query(`update users set is_admin = false where id = $1`, [id]);
				break;
			case 'rename': {
				const name = String(b.value ?? '').trim().slice(0, 24);
				if (!name) return send(400, { error: 'Give a new name' });
				await db.query(`update users set name = $2 where id = $1`, [id, name]);
				break;
			}
			case 'signOut':
				await db.query(`delete from sessions where user_id = $1`, [id]);
				break;
			default:
				return send(400, { error: 'Unknown action' });
		}
		await log(`user:${action}`, { id, value: b.value ?? null });
		return send(200, { ok: true });
	}

	// ---- tables ----
	if (path === '/tables' && req.method === 'GET') {
		return send(200, { tables: live.tables().sort((a, b) => b.updated - a.updated) });
	}
	const closeM = path.match(/^\/tables\/([A-Z0-9]{6})\/close$/);
	if (closeM && req.method === 'POST') {
		const b = await readBody(req);
		const ok = await live.closeTable(closeM[1], String(b.message ?? 'This table was closed by an admin.').slice(0, 200));
		await log('close-table', { code: closeM[1] });
		return send(ok ? 200 : 404, ok ? { ok: true } : { error: 'Table not found' });
	}

	// ---- charts: the last 14 days ----
	if (path === '/charts' && req.method === 'GET') {
		const series = async (sql: string) => {
			const { rows } = await db.query<{ day: string | Date; n: string }>(sql);
			const map = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.n)]));
			return days.map((d) => map.get(d) ?? 0);
		};
		const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
		const since = `now() - interval '14 days'`;
		const byVariant = await db.query<{ variant: string | null; source: string; n: string }>(
			`select variant, source, count(*) as n from rating_events where created_at > now() - interval '7 days' group by variant, source`
		);
		const topWeek = await db.query<{ name: string; hands: string; wins: string }>(
			`select u.name, count(*) as hands, count(*) filter (where e.outcome = 'win') as wins
			   from rating_events e join users u on u.id = e.user_id
			  where e.created_at > now() - interval '7 days'
			  group by u.name order by hands desc limit 10`
		);
		return send(200, {
			days,
			signups: await series(`select date_trunc('day', created_at) as day, count(*) as n from users where created_at > ${since} group by 1`),
			hands: await series(`select date_trunc('day', created_at) as day, count(*) as n from rating_events where created_at > ${since} group by 1`),
			onlineHands: await series(`select date_trunc('day', created_at) as day, count(*) as n from rating_events where source <> 'bots' and created_at > ${since} group by 1`),
			activePlayers: await series(`select date_trunc('day', created_at) as day, count(distinct user_id) as n from rating_events where created_at > ${since} group by 1`),
			dragon: await series(`select day, sum(n) as n from dragon_usage where day > current_date - 14 group by day`),
			byVariant: byVariant.rows.map((r) => ({ variant: r.variant ?? 'unknown', online: r.source !== 'bots', n: Number(r.n) })),
			topWeek: topWeek.rows.map((r) => ({ name: r.name, hands: Number(r.hands), wins: Number(r.wins) }))
		});
	}

	// ---- one player in detail ----
	const detailM = path.match(/^\/users\/(\d+)$/);
	if (detailM && req.method === 'GET') {
		const id = Number(detailM[1]);
		const u = await db.query(
			`select id, name, email, username, picture, skill, created_at, last_seen, wins, losses, draws, is_admin, banned from users where id = $1`,
			[id]
		);
		if (!u.rows[0]) return send(404, { error: 'No such player' });
		const q = async <T,>(sql: string) => (await db.query<T & Record<string, unknown>>(sql, [id])).rows;
		const byVariant = await q<{ variant: string | null; hands: string; wins: string }>(
			`select variant, count(*) as hands, count(*) filter (where outcome = 'win') as wins from rating_events where user_id = $1 group by variant`
		);
		const recent = await q(`select outcome, source, variant, created_at from rating_events where user_id = $1 order by id desc limit 20`);
		const dragon = await q<{ kind: string; total: string; week: string }>(
			`select kind, sum(n) as total, sum(n) filter (where day > current_date - 7) as week from dragon_usage where user_id = $1 group by kind`
		);
		const count = async (sql: string) => Number((await q<{ n: string }>(sql))[0]?.n ?? 0);
		return send(200, {
			user: { ...u.rows[0], id },
			byVariant: byVariant.map((r) => ({ variant: r.variant ?? 'unknown', hands: Number(r.hands), wins: Number(r.wins) })),
			recent,
			dragon: dragon.map((r) => ({ kind: r.kind, total: Number(r.total), week: Number(r.week ?? 0) })),
			reports: await count(`select count(*) as n from diagnostics where user_id = $1`),
			friends: await count(`select count(*) as n from friendships where status = 'accepted' and (user_a = $1 or user_b = $1)`),
			sessions: await count(`select count(*) as n from sessions where user_id = $1 and expires_at > now()`)
		});
	}

	// ---- export everyone as a spreadsheet ----
	if (path === '/users.csv' && req.method === 'GET') {
		const { rows } = await db.query<Record<string, unknown>>(
			`select id, name, email, username, skill, created_at, last_seen, wins, losses, draws, is_admin, banned from users order by id`
		);
		const cols = ['id', 'name', 'email', 'username', 'skill', 'created_at', 'last_seen', 'wins', 'losses', 'draws', 'is_admin', 'banned'];
		const cell = (v: unknown) => {
			const t = v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v);
			// keep spreadsheet apps from running anything that looks like a formula
			const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
			return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
		};
		const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
		await log('export-users', { rows: rows.length });
		res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="pung-table-players.csv"', 'cache-control': 'no-store' });
		res.end(csv);
		return true;
	}

	// ---- bots (filled seats) ----
	if (path === '/bots' && req.method === 'GET') {
		const { rows } = await db.query(`select name, hands, wins, created_at from bot_stats order by hands desc`);
		return send(200, { bots: rows });
	}
	if (path === '/bots/reset' && req.method === 'POST') {
		const b = await readBody(req);
		if (typeof b.name === 'string' && b.name) await db.query(`delete from bot_stats where name = $1`, [b.name]);
		else await db.query(`delete from bot_stats`);
		await log('reset-bots', { name: b.name ?? 'all' });
		return send(200, { ok: true });
	}

	const takeM = path.match(/^\/tables\/([A-Z0-9]{6})\/take$/);
	if (takeM && req.method === 'POST') {
		const b = await readBody(req);
		const err = await live.takeSeat(takeM[1], Number(b.seat), me);
		await log('take-seat', { code: takeM[1], seat: b.seat, ok: !err });
		return send(err ? 400 : 200, err ? { error: err } : { ok: true });
	}
	const winM = path.match(/^\/tables\/([A-Z0-9]{6})\/win$/);
	if (winM && req.method === 'POST') {
		const b = await readBody(req);
		const points = Math.max(1, Math.min(100_000, Number(b.points) || 1000));
		const err = await live.forceWin(winM[1], Number(b.seat), points, me);
		await log('force-win', { code: winM[1], seat: b.seat, points, ok: !err });
		return send(err ? 400 : 200, err ? { error: err } : { ok: true });
	}

	// ---- settings ----
	if (path === '/settings' && req.method === 'POST') {
		const b = await readBody(req);
		if ('maintenance' in b) {
			const m = typeof b.maintenance === 'string' && b.maintenance.trim() ? b.maintenance.trim().slice(0, 300) : null;
			settings.maintenance = m;
			await db.query(`insert into site_settings (key, value) values ('maintenance', $1) on conflict (key) do update set value = $1`, [JSON.stringify(m ?? '')]);
		}
		if ('dragon' in b) {
			settings.dragon = b.dragon !== false;
			await db.query(`insert into site_settings (key, value) values ('dragon', $1) on conflict (key) do update set value = $1`, [JSON.stringify(settings.dragon)]);
		}
		for (const [key, [lo, hi]] of Object.entries(NUMERIC)) {
			if (!(key in b)) continue;
			const v = Number(b[key]);
			if (!Number.isFinite(v)) return send(400, { error: `Bad value for ${key}` });
			const val = Math.max(lo, Math.min(hi, v));
			(settings as Record<string, unknown>)[key] = val;
			await db.query(`insert into site_settings (key, value) values ($1, $2) on conflict (key) do update set value = $2`, [key, JSON.stringify(val)]);
		}
		applyLive();
		await log('settings', b);
		return send(200, { ok: true, settings });
	}

	if (path === '/log' && req.method === 'GET') {
		const { rows } = await db.query(
			`select l.id, l.action, l.detail, l.created_at, u.name as admin from admin_log l left join users u on u.id = l.admin_id order by l.id desc limit 100`
		);
		return send(200, { log: rows });
	}

	return send(404, { error: 'Unknown admin route' });
}

export type { User };
