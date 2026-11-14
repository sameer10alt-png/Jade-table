// The bell: a saved history of what happened to you (friend requests, accepts, invites, someone
// sitting down at your table). The same events drive the pop-ups, and later phone notifications.
// Kept 30 days, newest 50 shown. Data never includes other people's account ids or emails.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { VARIANTS } from '../../app/src/lib/engine/game';
import { currentUser, getDb } from './accounts';
import type { Room } from './core/table';

export type NoteKind = 'friend_request' | 'friend_accepted' | 'invite' | 'joined';

/** what is stored per kind; `fromId` stays on the server (used to check if a request is still open) */
export interface NoteData {
	name: string;
	picture: string | null;
	fromId?: number;
	/** friend code, so Accept can answer the request */
	code?: string;
	table?: string;
	variantName?: string;
	inviteId?: number;
}

export interface NoteView {
	id: number;
	kind: NoteKind;
	name: string;
	picture: string | null;
	code?: string;
	table?: string;
	variantName?: string;
	createdAt: string;
	read: boolean;
	/** can you still act on it (request still pending, invite table still open)? */
	active: boolean;
}

const KEEP_DAYS = 30;

export async function addNote(userId: number, kind: NoteKind, data: NoteData) {
	const db = getDb();
	if (!db) return;
	await db
		.query(`insert into notifications (user_id, kind, data) values ($1, $2, $3)`, [userId, kind, JSON.stringify(data)])
		.catch((e) => console.error('notification failed', e));
}

type Row = { id: number; kind: NoteKind; data: NoteData | string; created_at: string | Date; read_at: string | Date | null };

async function views(userId: number, rows: Row[]): Promise<NoteView[]> {
	const db = getDb()!;
	const out: NoteView[] = [];
	for (const r of rows) {
		const d = (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as NoteData;
		let active = false;
		if (r.kind === 'friend_request' && d.fromId) {
			const a = Math.min(userId, d.fromId), b = Math.max(userId, d.fromId);
			const q = await db.query(`select 1 from friendships where user_a = $1 and user_b = $2 and status = 'pending' and requested_by = $3`, [a, b, d.fromId]);
			active = q.rows.length > 0;
		} else if ((r.kind === 'invite' || r.kind === 'joined') && d.table) {
			const q = await db.query<{ data: Room | string }>(`select data from rooms where code = $1`, [d.table]);
			const room = q.rows[0] && ((typeof q.rows[0].data === 'string' ? JSON.parse(q.rows[0].data) : q.rows[0].data) as Room);
			const seated = !!room?.seats.some((s) => s?.playerId === `account-${userId}`);
			// an invite is open while the table waits with a free seat; "joined" while it exists and you're in it
			active = !!room && (r.kind === 'invite' ? room.status === 'lobby' && !seated && room.seats.some((s) => s === null) : seated);
		}
		out.push({
			id: Number(r.id),
			kind: r.kind,
			name: d.name,
			picture: d.picture,
			code: d.code,
			table: d.table,
			variantName: d.variantName,
			createdAt: new Date(r.created_at).toISOString(),
			read: !!r.read_at,
			active
		});
	}
	return out;
}

/** for the 20-second poll: unread count and the newest unread few (for pop-ups) */
export async function unreadNotes(userId: number) {
	const db = getDb()!;
	const { rows: c } = await db.query<{ n: string | number }>(`select count(*) as n from notifications where user_id = $1 and read_at is null`, [userId]);
	const { rows } = await db.query<Row>(
		`select id, kind, data, created_at, read_at from notifications
		 where user_id = $1 and read_at is null and created_at > now() - interval '1 day'
		 order by created_at desc limit 5`,
		[userId]
	);
	return { unread: Number(c[0]?.n ?? 0), latest: await views(userId, rows) };
}

/** "Sameer sat down at your table": tell the other signed-in players already seated */
export async function noteJoined(room: Room, joinerId: number, name: string, picture: string | null) {
	if (room.status !== 'lobby') return;
	for (const s of room.seats) {
		const m = s?.playerId.match(/^account-(\d+)$/);
		if (m && Number(m[1]) !== joinerId)
			await addNote(Number(m[1]), 'joined', { name, picture, table: room.code, variantName: VARIANTS[room.settings.variant]?.name });
	}
}

export async function handleNotifications(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	if (!url.pathname.startsWith('/api/notifications')) return false;
	const json = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};
	const db = getDb();
	if (!db) return json(503, { error: 'Notifications need accounts, which are not set up' });
	const me = await currentUser(req);
	if (!me) return json(401, { error: 'Sign in to see notifications' });

	if (url.pathname === '/api/notifications' && req.method === 'GET') {
		await db.query(`delete from notifications where user_id = $1 and created_at < now() - ($2 || ' days')::interval`, [me.id, String(KEEP_DAYS)]);
		const { rows } = await db.query<Row>(
			`select id, kind, data, created_at, read_at from notifications where user_id = $1 order by created_at desc limit 50`,
			[me.id]
		);
		return json(200, { notes: await views(me.id, rows) });
	}
	// opening the bell marks everything read
	if (url.pathname === '/api/notifications/read' && req.method === 'POST') {
		await db.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [me.id]);
		return json(200, { ok: true });
	}
	return json(404, { error: 'Not found' });
}
