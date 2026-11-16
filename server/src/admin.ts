// God mode: an admin panel for accounts with users.is_admin = true (set it in Railway's Postgres).
// - messages on players' screens (banner or pop-up, everyone or one player, with an expiry)
// - live overview: who's online, queues, tables, sign-ups, hands, Dragon use
// - players: search, ban / unban, reset record, make / remove admin, rename
// - tables: see every live table and who's at it, close one
// - settings: maintenance message, Dragon on / off
// Every admin action is written to admin_log.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentUser, getDb, type User } from './accounts';

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
	waiting(): Record<string, number>;
	online(): number;
	dragonToday(): number;
}

// ---- site settings (cached; read on every request by other modules) ----
const settings = { maintenance: null as string | null, dragon: true };
export const siteSettings = () => settings;

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
	const { rows } = await db.query<{ key: string; value: unknown }>(`select key, value from site_settings`);
	for (const r of rows) {
		if (r.key === 'maintenance') settings.maintenance = typeof r.value === 'string' && r.value ? r.value : null;
		if (r.key === 'dragon') settings.dragon = r.value !== false;
	}
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
