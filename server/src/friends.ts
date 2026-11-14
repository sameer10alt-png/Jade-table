// Friends: find each other by a public friend code (never by email), an "add me" link, or at a
// table; every friendship needs both people's yes (a request and an accept), who's online, and invites to a table that's waiting to start.
// Every action is checked against the signed-in user from the session cookie.
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { makeTableCode } from '../../app/src/lib/online/protocol';
import { VARIANTS } from '../../app/src/lib/engine/game';
import { accountPid, currentUser, getDb, type User } from './accounts';
import type { Room } from './core/table';
import { addNote, unreadNotes } from './notifications';

/** online = active on the site within this window */
const ONLINE_MS = 2 * 60_000;
/** invites stop showing after this long */
const INVITE_HOURS = 24;

export interface FriendView {
	code: string;
	name: string;
	picture: string | null;
	online: boolean;
	atTable: boolean;
}

type Ctx = { atTable: (pid: string) => boolean };

const pair = (a: number, b: number) => (a < b ? [a, b] : [b, a]);

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
	let s = '';
	for await (const c of req) {
		s += c;
		if (s.length > 4000) throw new Error('too large');
	}
	return (JSON.parse(s || '{}') as Record<string, unknown>) ?? {};
}

/** Every account gets a friend code the first time it's needed. */
async function friendCode(userId: number): Promise<string> {
	const db = getDb()!;
	const { rows } = await db.query<{ friend_code: string | null }>(`select friend_code from users where id = $1`, [userId]);
	if (rows[0]?.friend_code) return rows[0].friend_code;
	for (let i = 0; i < 10; i++) {
		const code = makeTableCode();
		try {
			const r = await db.query<{ friend_code: string }>(
				`update users set friend_code = $1 where id = $2 and friend_code is null returning friend_code`,
				[code, userId]
			);
			if (r.rows[0]) return r.rows[0].friend_code;
			return friendCode(userId); // someone else set it meanwhile
		} catch {
			/* code taken by another account: try another */
		}
	}
	throw new Error('could not create a friend code');
}

/** The "add me" link token: long and random, so it can't be guessed from the friend code. */
async function friendLink(userId: number, fresh = false): Promise<string> {
	const db = getDb()!;
	if (!fresh) {
		const { rows } = await db.query<{ friend_link: string | null }>(`select friend_link from users where id = $1`, [userId]);
		if (rows[0]?.friend_link) return rows[0].friend_link;
	}
	const token = randomBytes(9).toString('base64url'); // 12 characters
	await db.query(`update users set friend_link = $1 where id = $2`, [token, userId]);
	return token;
}

async function userByLink(token: unknown) {
	if (typeof token !== 'string' || !/^[\w-]{12}$/.test(token)) return null;
	const { rows } = await getDb()!.query<{ id: number; name: string; picture: string | null }>(
		`select id, name, picture from users where friend_link = $1`,
		[token]
	);
	return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

async function userByCode(code: unknown) {
	if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code.toUpperCase())) return null;
	const { rows } = await getDb()!.query<{ id: number; name: string; picture: string | null; last_seen: string | Date }>(
		`select id, name, picture, last_seen from users where friend_code = $1`,
		[code.toUpperCase()]
	);
	return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

async function relation(me: number, other: number) {
	const [a, b] = pair(me, other);
	const { rows } = await getDb()!.query<{ status: string; requested_by: number }>(
		`select status, requested_by from friendships where user_a = $1 and user_b = $2`,
		[a, b]
	);
	return rows[0] ? { status: rows[0].status, requestedBy: Number(rows[0].requested_by) } : null;
}

/** Ask to be friends, or accept if they already asked you. */
async function addFriend(me: User, other: number): Promise<'requested' | 'friends'> {
	const db = getDb()!;
	const rel = await relation(me.id, other);
	const [a, b] = pair(me.id, other);
	if (!rel) {
		await db.query(`insert into friendships (user_a, user_b, status, requested_by) values ($1, $2, 'pending', $3)`, [a, b, me.id]);
		await addNote(other, 'friend_request', { name: me.name, picture: me.picture, fromId: me.id, code: await friendCode(me.id) });
		return 'requested';
	}
	if (rel.status === 'pending' && rel.requestedBy !== me.id) {
		await db.query(`update friendships set status = 'accepted' where user_a = $1 and user_b = $2`, [a, b]);
		await addNote(other, 'friend_accepted', { name: me.name, picture: me.picture });
		return 'friends';
	}
	return rel.status === 'accepted' ? 'friends' : 'requested';
}

async function loadRoom(code: unknown): Promise<Room | null> {
	if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code.toUpperCase())) return null;
	const { rows } = await getDb()!.query<{ data: Room | string }>(`select data from rooms where code = $1`, [code.toUpperCase()]);
	return rows[0] ? ((typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) as Room) : null;
}

/** the account behind a seat, if it's someone signed in (not a guest, bot or empty) */
const seatUser = (room: Room, seat: number) => {
	const m = room.seats[seat]?.playerId.match(/^account-(\d+)$/);
	return m ? Number(m[1]) : null;
};

const isOnline = (lastSeen: string | Date) => Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;

async function overview(me: User, ctx: Ctx) {
	const db = getDb()!;
	const myCode = await friendCode(me.id);
	type Row = { id: number; name: string; picture: string | null; friend_code: string | null; last_seen: string | Date; status: string; requested_by: number };
	const { rows } = await db.query<Row>(
		`select u.id, u.name, u.picture, u.friend_code, u.last_seen, f.status, f.requested_by
		 from friendships f join users u on u.id = case when f.user_a = $1 then f.user_b else f.user_a end
		 where f.user_a = $1 or f.user_b = $1
		 order by u.last_seen desc`,
		[me.id]
	);
	// make sure everyone listed has a code we can refer to them by
	for (const r of rows) if (!r.friend_code) r.friend_code = await friendCode(Number(r.id));
	const view = (r: Row): FriendView => ({
		code: r.friend_code!,
		name: r.name,
		picture: r.picture,
		online: isOnline(r.last_seen),
		atTable: ctx.atTable(`account-${r.id}`)
	});
	const friends = rows.filter((r) => r.status === 'accepted').map(view);
	const incoming = rows.filter((r) => r.status === 'pending' && Number(r.requested_by) !== me.id).map(view);
	const outgoing = rows.filter((r) => r.status === 'pending' && Number(r.requested_by) === me.id).map(view);

	// people you've shared a table with, who aren't friends yet
	const { rows: sugg } = await db.query<{ id: number; name: string; picture: string | null; friend_code: string | null; last_seen: string | Date }>(
		`select distinct u.id, u.name, u.picture, u.friend_code, u.last_seen
		 from table_members mine join table_members theirs on theirs.code = mine.code and theirs.user_id <> mine.user_id
		 join users u on u.id = theirs.user_id
		 where mine.user_id = $1
		   and not exists (select 1 from friendships f where f.user_a = least($1, u.id) and f.user_b = greatest($1, u.id))
		 limit 8`,
		[me.id]
	);
	const suggestions: FriendView[] = [];
	for (const r of sugg) {
		suggestions.push({
			code: r.friend_code ?? (await friendCode(Number(r.id))),
			name: r.name,
			picture: r.picture,
			online: isOnline(r.last_seen),
			atTable: ctx.atTable(`account-${r.id}`)
		});
	}

	return { myCode, myLink: await friendLink(me.id), friends, incoming, outgoing, suggestions, invites: await invitesFor(me.id) };
}

async function invitesFor(userId: number) {
	const { rows } = await getDb()!.query<{ id: number; code: string; created_at: string | Date; from_name: string; from_picture: string | null; data: Room | string }>(
		`select i.id, i.code, i.created_at, u.name as from_name, u.picture as from_picture, r.data
		 from invites i join users u on u.id = i.from_user join rooms r on r.code = i.code
		 where i.to_user = $1 and i.created_at > now() - ($2 || ' hours')::interval
		 order by i.created_at desc`,
		[userId, String(INVITE_HOURS)]
	);
	return rows
		.map((r) => {
			const room = (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Room;
			const seated = room.seats.some((s) => s?.playerId === `account-${userId}`);
			return {
				id: Number(r.id),
				code: r.code,
				from: { name: r.from_name, picture: r.from_picture },
				variantName: VARIANTS[room.settings.variant]?.name ?? room.settings.variant,
				open: room.status === 'lobby' && room.seats.some((s) => s === null),
				seated,
				createdAt: new Date(r.created_at).toISOString()
			};
		})
		.filter((i) => i.open && !i.seated); // only tables you can still join
}

async function touch(userId: number) {
	await getDb()!.query(`update users set last_seen = now() where id = $1`, [userId]);
}

export async function handleFriends(req: IncomingMessage, res: ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
	if (!url.pathname.startsWith('/api/friends') && url.pathname !== '/api/notify') return false;
	const json = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};
	if (!getDb()) return json(503, { error: 'Friends need accounts, which are not set up' });

	// public: who sent this "add me" link? (so a new visitor sees "Shama invited you")
	const who = url.pathname.match(/^\/api\/friends\/who\/([\w-]{12})$/);
	if (who) {
		const owner = await userByLink(who[1]);
		return owner ? json(200, { name: owner.name, picture: owner.picture }) : json(404, { error: 'This link is no longer valid' });
	}

	const me = await currentUser(req);
	if (!me) return json(401, { error: 'Sign in to use friends' });
	const db = getDb()!;

	// small, frequent poll: marks you online, returns badge counts plus the newest requests and
	// invites, so the site can pop up "Sameer invited you" on any screen
	if (url.pathname === '/api/notify') {
		await touch(me.id);
		const notes = await unreadNotes(me.id);
		return json(200, { unread: notes.unread, invites: (await invitesFor(me.id)).length, latest: notes.latest });
	}

	if (url.pathname === '/api/friends' && req.method === 'GET') {
		await touch(me.id);
		return json(200, await overview(me, ctx));
	}

	// at a table: how you relate to each seat, so the table can show "add friend" or "friend".
	// Only seat numbers go out, never other players' codes or account ids.
	const tableRel = url.pathname.match(/^\/api\/friends\/table\/([A-Za-z0-9]{6})$/);
	if (tableRel && req.method === 'GET') {
		const room = await loadRoom(tableRel[1]);
		if (!room || !room.seats.some((s) => s?.playerId === accountPid(me))) return json(403, { error: "You're not seated at that table" });
		const seats: (null | 'friend' | 'sent' | 'incoming' | 'none')[] = [];
		for (let i = 0; i < room.seats.length; i++) {
			const other = seatUser(room, i);
			if (other === null || other === me.id) {
				seats.push(null);
				continue;
			}
			const rel = await relation(me.id, other);
			seats.push(!rel ? 'none' : rel.status === 'accepted' ? 'friend' : rel.requestedBy === me.id ? 'sent' : 'incoming');
		}
		return json(200, { seats });
	}

	if (req.method !== 'POST') return json(405, { error: 'Use POST' });
	const b = await body(req).catch(() => null);
	if (!b) return json(400, { error: 'Bad request' });

	// send a request, or accept one they already sent you
	if (url.pathname === '/api/friends/request') {
		const other = await userByCode(b.code);
		if (!other) return json(404, { error: 'No player with that friend code' });
		if (other.id === me.id) return json(400, { error: "That's your own code" });
		return json(200, { status: await addFriend(me, other.id), name: other.name });
	}

	// pressed Accept on someone's "add me" link: sending the link was their yes, this is yours
	if (url.pathname === '/api/friends/link') {
		const other = await userByLink(b.token);
		if (!other) return json(404, { error: 'This link is no longer valid' });
		if (other.id === me.id) return json(400, { error: "That's your own link" });
		const [a, c] = pair(me.id, other.id);
		await db.query(
			`insert into friendships (user_a, user_b, status, requested_by) values ($1, $2, 'accepted', $3)
			 on conflict (user_a, user_b) do update set status = 'accepted'`,
			[a, c, other.id]
		);
		await addNote(other.id, 'friend_accepted', { name: me.name, picture: me.picture });
		return json(200, { status: 'friends', name: other.name });
	}

	// retire your old "add me" link (e.g. it was forwarded further than you wanted)
	if (url.pathname === '/api/friends/new-link') {
		return json(200, { myLink: await friendLink(me.id, true) });
	}

	if (url.pathname === '/api/friends/respond') {
		const other = await userByCode(b.code);
		if (!other) return json(404, { error: 'No such player' });
		const rel = await relation(me.id, other.id);
		const [a, c] = pair(me.id, other.id);
		if (!rel || rel.status !== 'pending' || rel.requestedBy === me.id) return json(400, { error: 'No request to answer' });
		if (b.accept === true) {
			await db.query(`update friendships set status = 'accepted' where user_a = $1 and user_b = $2`, [a, c]);
			await addNote(other.id, 'friend_accepted', { name: me.name, picture: me.picture });
		}
		else await db.query(`delete from friendships where user_a = $1 and user_b = $2`, [a, c]);
		return json(200, { ok: true });
	}

	// unfriend, cancel a request you sent, or decline
	if (url.pathname === '/api/friends/remove') {
		const other = await userByCode(b.code);
		if (!other) return json(404, { error: 'No such player' });
		const [a, c] = pair(me.id, other.id);
		await db.query(`delete from friendships where user_a = $1 and user_b = $2`, [a, c]);
		return json(200, { ok: true });
	}

	// invite a friend to a table you're seated at, while it's waiting to start
	if (url.pathname === '/api/friends/invite') {
		const other = await userByCode(b.code);
		const table = typeof b.table === 'string' ? b.table.toUpperCase() : '';
		if (!other) return json(404, { error: 'No such player' });
		const rel = await relation(me.id, other.id);
		if (rel?.status !== 'accepted') return json(403, { error: 'You can only invite friends' });
		const { rows } = await db.query<{ data: Room | string }>(`select data from rooms where code = $1`, [table]);
		if (!rows[0]) return json(404, { error: 'No such table' });
		const room = (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) as Room;
		if (!room.seats.some((s) => s?.playerId === accountPid(me))) return json(403, { error: "You're not seated at that table" });
		if (room.status !== 'lobby') return json(400, { error: 'That table has already started' });
		if (!room.seats.some((s) => s === null)) return json(400, { error: 'That table is full' });
		const ins = await db.query<{ id: number }>(
			`insert into invites (from_user, to_user, code) values ($1, $2, $3)
			 on conflict (from_user, to_user, code) do update set created_at = now() returning id`,
			[me.id, other.id, table]
		);
		await addNote(other.id, 'invite', {
			name: me.name,
			picture: me.picture,
			table,
			variantName: VARIANTS[room.settings.variant]?.name ?? room.settings.variant,
			inviteId: Number(ins.rows[0]?.id)
		});
		return json(200, { ok: true, name: other.name });
	}

	// "add friend" on a player at your table, by seat number
	if (url.pathname === '/api/friends/add-seat') {
		const room = await loadRoom(b.table);
		if (!room || !room.seats.some((s) => s?.playerId === accountPid(me))) return json(403, { error: "You're not seated at that table" });
		const other = typeof b.seat === 'number' ? seatUser(room, b.seat) : null;
		if (other === null) return json(400, { error: 'Only signed-in players can be added as friends' });
		if (other === me.id) return json(400, { error: "That's you" });
		return json(200, { status: await addFriend(me, other) });
	}

	if (url.pathname === '/api/friends/dismiss') {
		await db.query(`delete from invites where id = $1 and to_user = $2`, [Number(b.id), me.id]);
		return json(200, { ok: true });
	}

	return json(404, { error: 'Not found' });
}
