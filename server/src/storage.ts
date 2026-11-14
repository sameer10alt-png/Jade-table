// Where tables are kept between moves, deploys and restarts.
//   Postgres (when DATABASE_URL is set): survives deploys, and lets us list "my tables".
//   Files in DATA_DIR, or memory only: for running locally without a database.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pendingSeats, VARIANTS } from '../../app/src/lib/engine/game';
import { getDb } from './accounts';
import type { Room } from './core/table';

export interface TableStore {
	load(code: string): Promise<Room | null>;
	save(room: Room): Promise<void>;
	exists(code: string): Promise<boolean>;
	/** delete tables nobody has touched for this long */
	cleanup(idleMs: number): Promise<void>;
}

function dbStore(): TableStore {
	const db = getDb()!;
	return {
		async load(code) {
			const { rows } = await db.query<{ data: Room | string }>(`select data from rooms where code = $1`, [code]);
			if (!rows[0]) return null;
			return typeof rows[0].data === 'string' ? (JSON.parse(rows[0].data) as Room) : rows[0].data;
		},
		async save(room) {
			await db.query(
				`insert into rooms (code, data, updated_at) values ($1, $2::jsonb, now())
				 on conflict (code) do update set data = excluded.data, updated_at = now()`,
				[room.code, JSON.stringify(room)]
			);
		},
		async exists(code) {
			const { rows } = await db.query(`select 1 from rooms where code = $1`, [code]);
			return rows.length > 0;
		},
		async cleanup(idleMs) {
			await db.query(`delete from rooms where updated_at < now() - ($1 || ' milliseconds')::interval`, [String(idleMs)]);
			await db.query(`delete from table_members m where not exists (select 1 from rooms r where r.code = m.code)`);
		}
	};
}

function fileStore(dir: string | null): TableStore {
	const memory = new Map<string, string>();
	if (dir) mkdirSync(dir, { recursive: true });
	const file = (code: string) => join(dir!, `${code}.json`);
	return {
		async load(code) {
			if (dir && existsSync(file(code))) return JSON.parse(readFileSync(file(code), 'utf8')) as Room;
			const m = memory.get(code);
			return m ? (JSON.parse(m) as Room) : null;
		},
		async save(room) {
			const text = JSON.stringify(room);
			if (!dir) return void memory.set(room.code, text);
			// write-then-rename so a crash never leaves a half-written file
			writeFileSync(file(room.code) + '.tmp', text);
			renameSync(file(room.code) + '.tmp', file(room.code));
		},
		async exists(code) {
			return memory.has(code) || (!!dir && existsSync(file(code)));
		},
		async cleanup(idleMs) {
			const now = Date.now();
			for (const [code, text] of memory) {
				const touched = (JSON.parse(text) as Room).touched ?? 0;
				if (now - touched > idleMs) memory.delete(code);
			}
			if (!dir) return;
			for (const f of readdirSync(dir)) {
				if (f.endsWith('.json') && now - statSync(join(dir, f)).mtimeMs > idleMs) unlinkSync(join(dir, f));
			}
		}
	};
}

export function makeStore(dataDir: string | null): TableStore {
	return getDb() ? dbStore() : fileStore(dataDir);
}

// ---- "My tables" (signed-in players) ----

export async function rememberMember(userId: number, code: string) {
	const db = getDb();
	if (!db) return;
	await db.query(`insert into table_members (user_id, code) values ($1, $2) on conflict (user_id, code) do update set joined_at = now()`, [
		userId,
		code
	]);
}

export async function forgetMember(userId: number, code: string) {
	await getDb()?.query(`delete from table_members where user_id = $1 and code = $2`, [userId, code]);
}

export interface MyTable {
	code: string;
	variant: string;
	variantName: string;
	status: 'lobby' | 'playing' | 'finished';
	round: number;
	handNo: number;
	/** it is your move right now */
	yourTurn: boolean;
	players: { name: string; bot: boolean; score: number; you: boolean }[];
	updatedAt: string;
}

/** The tables this account is seated at, newest first. Only a summary: never hands or the wall. */
export async function myTables(userId: number, pid: string): Promise<MyTable[]> {
	const db = getDb();
	if (!db) return [];
	const { rows } = await db.query<{ code: string; data: Room | string; updated_at: string | Date }>(
		`select r.code, r.data, r.updated_at from table_members m join rooms r on r.code = m.code
		 where m.user_id = $1 order by r.updated_at desc limit 30`,
		[userId]
	);
	return rows.map((row) => {
		const room = (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as Room;
		const g = room.game;
		const mySeat = room.seats.findIndex((s) => s?.playerId === pid);
		const status: MyTable['status'] = room.status === 'lobby' ? 'lobby' : g?.phase === 'gameover' ? 'finished' : 'playing';
		const players = room.seats.map((s, i) => ({
			name: s?.name ?? g?.players[i]?.name ?? 'Empty seat',
			bot: !s,
			score: g?.players[i]?.score ?? 0,
			you: i === mySeat
		}));
		return {
			code: room.code,
			variant: room.settings.variant,
			variantName: VARIANTS[room.settings.variant]?.name ?? room.settings.variant,
			status,
			round: g?.round ?? 0,
			handNo: g?.handNo ?? 0,
			yourTurn: !!g && mySeat >= 0 && status === 'playing' && pendingSeats(g).includes(mySeat),
			players,
			updatedAt: new Date(row.updated_at).toISOString()
		};
	});
}
