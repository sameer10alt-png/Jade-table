// Jade rewards: earned per finished hand (double in Lucky Hours), a daily bonus with a streak,
// a first-win-of-the-day bonus, and a shop for tile backs, table felts and Dragon tokens.
// Every balance change happens here, on the server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_EQUIPPED, EARN, ITEMS, dailyBonus, handJade, itemById, luckyState } from '../../app/src/lib/shop';
import { currentUser, getDb } from './accounts';
import { siteSettings } from './admin';

export async function migrateRewards() {
	const db = getDb();
	if (!db) return;
	await db.query(`alter table users add column if not exists jade integer not null default 0`);
	await db.query(`alter table users add column if not exists dragon_tokens integer not null default 0`);
	await db.query(`alter table users add column if not exists equipped jsonb not null default '{}'::jsonb`);
	await db.query(`alter table users add column if not exists daily_day date`);
	await db.query(`alter table users add column if not exists daily_streak integer not null default 0`);
	await db.query(`alter table users add column if not exists first_win_day date`);
	await db.query(`
		create table if not exists user_items (
			user_id bigint not null references users(id) on delete cascade,
			item_id text not null,
			created_at timestamptz not null default now(),
			primary key (user_id, item_id)
		)`);
}

export const lucky = () => luckyState(Date.now(), siteSettings().luckyUntil);

/** Jade for one finished, counted hand (called once per hand per account). */
export async function awardHand(userId: number, outcome: string, withPeople: boolean): Promise<number> {
	const db = getDb();
	if (!db) return 0;
	let n = handJade(outcome, withPeople, lucky().active);
	if (outcome === 'win') {
		const first = await db.query(
			`update users set first_win_day = current_date where id = $1 and (first_win_day is null or first_win_day < current_date) returning id`,
			[userId]
		);
		if (first.rows.length) n += EARN.firstWin;
	}
	await db.query(`update users set jade = jade + $2 where id = $1`, [userId, n]);
	return n;
}

/** spend a Dragon token (when the free daily uses are gone); true if one was used */
export async function useDragonToken(userId: number): Promise<boolean> {
	const db = getDb();
	if (!db) return false;
	const { rows } = await db.query(`update users set dragon_tokens = dragon_tokens - 1 where id = $1 and dragon_tokens > 0 returning id`, [userId]);
	return rows.length > 0;
}

async function stateOf(userId: number) {
	const db = getDb()!;
	const [{ rows: u }, { rows: items }] = await Promise.all([
		db.query<{ jade: number; dragon_tokens: number; equipped: Record<string, string>; claimed: boolean; streak: number; won_today: boolean; continues: boolean }>(
			`select jade, dragon_tokens, equipped, daily_streak as streak,
			        coalesce(daily_day = current_date, false) as claimed,
			        coalesce(daily_day = current_date - 1, false) as continues,
			        coalesce(first_win_day = current_date, false) as won_today
			   from users where id = $1`,
			[userId]
		),
		db.query<{ item_id: string }>(`select item_id from user_items where user_id = $1`, [userId])
	]);
	const r = u[0];
	const nextStreak = r?.claimed ? r.streak : r?.continues ? (r.streak ?? 0) + 1 : 1;
	return {
		jade: r?.jade ?? 0,
		tokens: r?.dragon_tokens ?? 0,
		equipped: { ...DEFAULT_EQUIPPED, ...(r?.equipped ?? {}) },
		owned: [...ITEMS.filter((i) => i.price === 0).map((i) => i.id), ...items.map((i) => i.item_id)],
		daily: { claimed: !!r?.claimed, streak: r?.streak ?? 0, amount: dailyBonus(nextStreak) },
		firstWinDone: !!r?.won_today
	};
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
	let s = '';
	for await (const c of req) {
		s += c;
		if (s.length > 2000) throw new Error('too large');
	}
	return (JSON.parse(s || '{}') as Record<string, unknown>) ?? {};
}

export async function handleRewards(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	if (!url.pathname.startsWith('/api/rewards')) return false;
	const send = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};
	const db = getDb();
	const luck = lucky();
	if (!db) return send(200, { enabled: false, lucky: luck });
	const user = await currentUser(req);
	if (url.pathname === '/api/rewards' && req.method === 'GET') {
		return send(200, user ? { enabled: true, signedIn: true, lucky: luck, ...(await stateOf(user.id)) } : { enabled: true, signedIn: false, lucky: luck });
	}
	if (!user) return send(401, { error: 'Sign in to collect Jade.' });
	if (req.method !== 'POST') return send(404, { error: 'Not found' });
	const b = await body(req).catch(() => ({}) as Record<string, unknown>);

	if (url.pathname === '/api/rewards/daily') {
		const s = await stateOf(user.id);
		if (s.daily.claimed) return send(409, { error: 'Already collected today. Come back tomorrow!' });
		const amount = s.daily.amount;
		const { rows } = await db.query(
			`update users set jade = jade + $2,
			        daily_streak = case when daily_day = current_date - 1 then daily_streak + 1 else 1 end,
			        daily_day = current_date
			  where id = $1 and (daily_day is null or daily_day < current_date) returning id`,
			[user.id, amount]
		);
		if (!rows.length) return send(409, { error: 'Already collected today.' });
		return send(200, { earned: amount, ...(await stateOf(user.id)), lucky: luck });
	}

	const item = itemById(String(b.item ?? ''));
	if (!item) return send(400, { error: 'Unknown item' });

	if (url.pathname === '/api/rewards/buy') {
		if (item.price <= 0) return send(400, { error: 'That one is free.' });
		if (item.kind !== 'token') {
			const owned = await db.query(`select 1 from user_items where user_id = $1 and item_id = $2`, [user.id, item.id]);
			if (owned.rows.length) return send(409, { error: 'You already own this.' });
		}
		const paid = await db.query(`update users set jade = jade - $2 where id = $1 and jade >= $2 returning jade`, [user.id, item.price]);
		if (!paid.rows.length) return send(402, { error: 'Not enough Jade yet. Keep playing!' });
		if (item.kind === 'token') await db.query(`update users set dragon_tokens = dragon_tokens + $2 where id = $1`, [user.id, item.qty ?? 1]);
		else {
			await db.query(`insert into user_items (user_id, item_id) values ($1, $2) on conflict do nothing`, [user.id, item.id]);
			await db.query(`update users set equipped = equipped || jsonb_build_object($2::text, $3::text) where id = $1`, [user.id, item.kind, item.id]);
		}
		return send(200, { ok: true, ...(await stateOf(user.id)), lucky: luck });
	}

	if (url.pathname === '/api/rewards/equip') {
		if (item.kind === 'token') return send(400, { error: 'Tokens are used automatically.' });
		if (item.price > 0) {
			const owned = await db.query(`select 1 from user_items where user_id = $1 and item_id = $2`, [user.id, item.id]);
			if (!owned.rows.length) return send(403, { error: 'Buy it first.' });
		}
		await db.query(`update users set equipped = equipped || jsonb_build_object($2::text, $3::text) where id = $1`, [user.id, item.kind, item.id]);
		return send(200, { ok: true, ...(await stateOf(user.id)), lucky: luck });
	}
	return send(404, { error: 'Not found' });
}
