// Node.js host (Railway, any VPS, or your own computer).
// One process serves everything from one address:
//   /api/...        create / look up tables
//   /ws/table/CODE  live connection to a table
//   everything else the website (the built SvelteKit app), if STATIC_DIR is set
// All game logic lives in core/table.ts; this file is only plumbing.
//
// Environment:
//   PORT        port to listen on (Railway sets this)
//   STATIC_DIR  folder with the built website (default: app/build if it exists)
//   DATA_DIR    folder to save tables in, so they survive a restart (e.g. a Railway volume)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { isTableCode, makeTableCode, type ServerMsg, type TableSettings } from '../../app/src/lib/online/protocol';
import { accountPid, currentUser, getDb, handleAuth, initAccounts, SKILL_TO_LEVEL } from './accounts';
import { handleAsk } from './assistant';
import { handleProgress, migrateProgress, rateOnlineHand } from './progress';
import { forgetMember, makeStore, myTables, rememberMember, type TableStore } from './storage';
import { handleFriends } from './friends';
import { handleNotifications, noteJoined } from './notifications';
import { QuickQueue } from './quick';
import { cleanName, cleanSettings, TableCore, validPid, type Conn, type Host, type Room } from './core/table';

const PORT = Number(process.env.PORT || 8080);
// default: the built website next to us (app/build when started from the project root)
const STATIC_DIR = process.env.STATIC_DIR
	? resolve(process.env.STATIC_DIR)
	: existsSync(resolve('app/build/index.html'))
		? resolve('app/build')
		: null;
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : null;

// ---------------------------------------------------------------------------------------------
// One table in memory: its logic, its sockets, its timer.

class NodeTable implements Host {
	core: TableCore;
	sockets = new Set<{ pid: string; ws: WebSocket }>();
	timer: ReturnType<typeof setTimeout> | undefined;
	/** events for one table run one at a time, like a Durable Object */
	private queue: Promise<unknown> = Promise.resolve();

	constructor(room: Room | null) {
		this.core = new TableCore(room, this);
	}

	run<T>(fn: () => Promise<T> | T): Promise<T> {
		const next = this.queue.then(fn, fn);
		this.queue = next.catch((e) => console.error('table error', e));
		return next;
	}

	connections(pid?: string): Conn[] {
		return [...this.sockets]
			.filter((s) => (!pid || s.pid === pid) && s.ws.readyState === s.ws.OPEN)
			.map((s) => ({ pid: s.pid, send: (m: ServerMsg) => s.ws.send(JSON.stringify(m)) }));
	}

	async save(room: Room) {
		await store.save(room);
	}

	async handEnded(room: Room) {
		await rateOnlineHand(room);
	}

	async setAlarm(at: number | null) {
		clearTimeout(this.timer);
		this.timer = undefined;
		if (at === null) return;
		this.timer = setTimeout(() => this.run(() => this.core.alarm()), Math.max(0, at - Date.now()));
	}
}

const tables = new Map<string, NodeTable>();

/** Account ids come only from a real sign-in; a guest may not claim one. */
const guestOnly = (pid: string | null | undefined) => (pid && !pid.startsWith('account-') ? pid : null);

// Tables are saved after every change (Postgres on Railway; files or memory locally).
let store: TableStore;

/** Find a table in memory, or load it from storage (after a restart or deploy). */
async function getTable(code: string): Promise<NodeTable | null> {
	let t = tables.get(code);
	if (t) return t;
	const room = await store.load(code);
	if (!room) return null;
	t = tables.get(code) ?? new NodeTable(room); // another request may have loaded it meanwhile
	tables.set(code, t);
	return t;
}

async function codeTaken(code: string) {
	return tables.has(code) || (await store.exists(code));
}

async function newCode() {
	let code = makeTableCode();
	for (let i = 0; i < 10 && (await codeTaken(code)); i++) code = makeTableCode();
	if (await codeTaken(code)) throw new Error('Could not create a table, try again');
	return code;
}

// Quick match: the matched players are seated at a new table that starts by itself once they
// arrive, or after QUICK_ARRIVE (whoever isn't there by then is covered by a bot).
const QUICK_ARRIVE = 15_000;
const quick = new QuickQueue(async (variant, players, fill) => {
	const code = await newCode();
	const t = new NodeTable(null);
	tables.set(code, t);
	// bots at the player's skill level, named like people, and not tagged "Bot" at the table
	const settings = cleanSettings({ variant, botLevel: fill.level })!;
	await t.run(() => t.core.initQuick(code, settings, players, fill.names));
	setTimeout(() => t.run(() => t.core.quickStart(true)), QUICK_ARRIVE).unref();
	return code;
});

// Forget abandoned tables: nobody connected and nothing happened for a while.
const IDLE_IN_MEMORY = 30 * 60_000; // drop from memory (still saved)
const IDLE_DELETE = 3 * 24 * 60 * 60_000; // delete for good (the privacy policy says "a few days")
setInterval(() => {
	const now = Date.now();
	for (const [code, t] of tables) {
		const idle = now - (t.core.room?.touched ?? t.core.room?.created ?? 0);
		if (t.sockets.size === 0 && idle > IDLE_IN_MEMORY) {
			clearTimeout(t.timer);
			tables.delete(code);
		}
	}
	store.cleanup(IDLE_DELETE).catch((e) => console.error('cleanup failed', e));
}, 5 * 60_000).unref();

// ---------------------------------------------------------------------------------------------
// HTTP: API + website

function sendJson(res: ServerResponse, status: number, data: unknown) {
	res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
	res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	let body = '';
	for await (const chunk of req) {
		body += chunk;
		if (body.length > 10_000) throw new Error('too large');
	}
	return JSON.parse(body || 'null');
}

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json'
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
	if (!STATIC_DIR) return sendJson(res, 200, { ok: true, service: 'jade-table-server' });
	const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
	let file = normalize(join(STATIC_DIR, path));
	if (!file.startsWith(STATIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
	if (!existsSync(file) || statSync(file).isDirectory()) {
		const html = file + '.html';
		// unknown page: hand it to the app's router (single-page fallback)
		file = existsSync(html) ? html : join(STATIC_DIR, 'index.html');
	}
	const immutable = path.includes('/_app/immutable/');
	res.writeHead(200, {
		'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
		'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
	});
	createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', 'http://x');
		if (req.method === 'OPTIONS') {
			res.writeHead(204, {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET, POST, OPTIONS',
				'access-control-allow-headers': 'content-type'
			});
			return res.end();
		}
		if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, tables: tables.size });
		if (url.pathname.startsWith('/api/progress') && (await handleProgress(req, res, url))) return;
		if ((url.pathname === '/api/ask' || url.pathname === '/api/ask/status') && (await handleAsk(req, res, url))) return;
		if (
			(url.pathname.startsWith('/auth/') ||
				url.pathname.startsWith('/api/me') ||
				url.pathname === '/api/logout' ||
				url.pathname === '/api/register') &&
			(await handleAuth(req, res, url))
		)
			return;

		if (url.pathname === '/api/tables' && req.method === 'POST') {
			const body = (await readBody(req).catch(() => null)) as { settings?: Partial<TableSettings>; playerId?: string } | null;
			const settings = cleanSettings(body?.settings);
			// signed in: the table's host is your account; guest: the browser's id
			const user = await currentUser(req);
			const hostPid = user ? accountPid(user) : guestOnly(body?.playerId);
			if (!settings || !validPid(hostPid)) return sendJson(res, 400, { error: 'Bad request' });
			let code = makeTableCode();
			for (let i = 0; i < 10 && (await codeTaken(code)); i++) code = makeTableCode();
			if (await codeTaken(code)) return sendJson(res, 503, { error: 'Could not create a table, try again' });
			const t = new NodeTable(null);
			tables.set(code, t);
			await t.run(() => t.core.init(code, settings, hostPid!));
			return sendJson(res, 200, { code });
		}

		// Quick match: join the line, check in, start now, leave; plus how many wait per game
		if (url.pathname === '/api/quick/counts' && req.method === 'GET') return sendJson(res, 200, { waiting: quick.counts() });
		const qm = url.pathname.match(/^\/api\/quick\/(join|status|now|leave)$/);
		if (qm && req.method === 'POST') {
			const body = ((await readBody(req).catch(() => null)) ?? {}) as { variant?: string; playerId?: string; name?: string };
			const user = await currentUser(req);
			const pid = user ? accountPid(user) : guestOnly(body.playerId);
			if (!validPid(pid)) return sendJson(res, 400, { error: 'Bad request' });
			if (qm[1] === 'join') {
				if (!cleanSettings({ variant: body.variant as never })) return sendJson(res, 400, { error: 'Unknown game' });
				const level = user?.skill ? SKILL_TO_LEVEL[user.skill] ?? 'intermediate' : 'intermediate';
				return sendJson(res, 200, await quick.join(pid, user ? user.name : cleanName(body.name ?? null), body.variant as never, level));
			}
			if (qm[1] === 'leave') {
				quick.leave(pid);
				return sendJson(res, 200, { ok: true });
			}
			return sendJson(res, 200, qm[1] === 'now' ? await quick.now(pid) : await quick.status(pid));
		}

		const m = url.pathname.match(/^\/api\/tables\/([A-Z0-9]{6})$/);
		if (m && req.method === 'GET') {
			const t = isTableCode(m[1]) ? await getTable(m[1]) : null;
			const info = t?.core.summary();
			return info ? sendJson(res, 200, info) : sendJson(res, 404, { error: 'No such table' });
		}
		// The bell: notification history
		if (await handleNotifications(req, res, url)) return;
		// Friends: codes, requests, presence, invites
		if (await handleFriends(req, res, url, { atTable: (pid) => [...tables.values()].some((t) => t.connections(pid).length > 0) }))
			return;
		// My tables: the tables your account is seated at (summaries only, never hands)
		if (url.pathname === '/api/my/tables' && req.method === 'GET') {
			const user = await currentUser(req);
			if (!user) return sendJson(res, 401, { error: 'Not signed in' });
			return sendJson(res, 200, { tables: await myTables(user.id, accountPid(user)) });
		}
		const forget = url.pathname.match(/^\/api\/my\/tables\/([A-Z0-9]{6})$/);
		if (forget && req.method === 'DELETE') {
			const user = await currentUser(req);
			if (!user) return sendJson(res, 401, { error: 'Not signed in' });
			await forgetMember(user.id, forget[1]);
			return sendJson(res, 200, { ok: true });
		}
		if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });

		return serveStatic(req, res);
	} catch (e) {
		console.error(e);
		if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
	}
});

// ---------------------------------------------------------------------------------------------
// WebSocket: /ws/table/CODE?pid=...&name=...

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (req, socket, head) => {
	const url = new URL(req.url ?? '/', 'http://x');
	const m = url.pathname.match(/^\/ws\/table\/([A-Z0-9]{6})$/);
	if (!m) return socket.destroy();
	wss.handleUpgrade(req, socket, head, async (ws) => {
		const t = isTableCode(m[1]) ? await getTable(m[1]).catch(() => null) : null;
		const refuse = (message: string, code: number) => {
			ws.send(JSON.stringify({ type: 'error', message } satisfies ServerMsg));
			ws.close(code, message);
		};
		if (!t) return refuse('No such table', 4004);
		const guestPid = url.searchParams.get('pid');
		t.run(async () => {
			// Signed in: the account decides who you are (a browser can't claim someone else's id).
			const user = await currentUser(req).catch(() => null);
			const pid = user ? accountPid(user) : guestOnly(guestPid);
			const name = user ? user.name : url.searchParams.get('name');
			// a guest seat you held before signing in moves to your account (guest ids only)
			const prev = user ? guestOnly(guestPid) : null;
			const wasSeated = !!t.core.room?.seats.some((s) => s && (s.playerId === pid || (prev && s.playerId === prev)));
			const res = t.core.join(pid, name, user ? guestOnly(guestPid) : null);
			if (!res.ok) return refuse(res.message, res.code);
			if (user) await rememberMember(user.id, m[1]).catch((e) => console.error('remember table failed', e));
			// someone new sat down: tell the signed-in players already waiting there
			if (user && !wasSeated && t.core.room) await noteJoined(t.core.room, user.id, user.name, user.picture).catch(() => {});
			const entry = { pid: pid!, ws };
			t.sockets.add(entry);
			ws.on('message', (data) => t.run(() => t.core.message(entry.pid, data.toString(), (msg) => ws.send(JSON.stringify(msg)))));
			ws.on('close', () => {
				t.sockets.delete(entry);
				t.run(() => t.core.disconnected(entry.pid));
			});
			ws.on('error', () => ws.close());
			await t.core.connected();
		});
	});
});

await initAccounts();
await migrateProgress();
store = makeStore(DATA_DIR);

server.listen(PORT, () => {
	console.log(`Jade Table server on http://localhost:${PORT}`);
	console.log(`  website: ${STATIC_DIR ?? '(not served; set STATIC_DIR)'}`);
	console.log(`  saving tables to: ${getDb() ? 'the database' : (DATA_DIR ?? 'memory only (set DATABASE_URL or DATA_DIR to survive restarts)')}`);
});
