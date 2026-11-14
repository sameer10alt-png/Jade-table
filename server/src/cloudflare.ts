// Cloudflare host: a Worker + one Durable Object per table.
// All game logic lives in core/table.ts; this file is only plumbing.
import { DurableObject } from 'cloudflare:workers';
import { isTableCode, makeTableCode, type ServerMsg, type TableSettings } from '../../app/src/lib/online/protocol';
import { cleanSettings, TableCore, validPid, type Conn, type Host, type Room } from './core/table';

export interface Env {
	TABLES: DurableObjectNamespace<TableRoom>;
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'content-type'
};
const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });

export default {
	async fetch(req, env): Promise<Response> {
		const url = new URL(req.url);
		if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

		if (url.pathname === '/api/tables' && req.method === 'POST') {
			const body = (await req.json().catch(() => null)) as { settings?: Partial<TableSettings>; playerId?: string } | null;
			const settings = cleanSettings(body?.settings);
			if (!settings || !validPid(body?.playerId)) return json({ error: 'Bad request' }, 400);
			for (let attempt = 0; attempt < 5; attempt++) {
				const code = makeTableCode();
				if (await env.TABLES.get(env.TABLES.idFromName(code)).init(code, settings, body!.playerId!)) return json({ code });
			}
			return json({ error: 'Could not create a table, try again' }, 503);
		}

		let m = url.pathname.match(/^\/api\/tables\/([A-Z0-9]{6})$/);
		if (m && req.method === 'GET') {
			if (!isTableCode(m[1])) return json({ error: 'No such table' }, 404);
			const info = await env.TABLES.get(env.TABLES.idFromName(m[1])).summary();
			return info ? json(info) : json({ error: 'No such table' }, 404);
		}

		m = url.pathname.match(/^\/ws\/table\/([A-Z0-9]{6})$/);
		if (m) {
			if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
			if (!isTableCode(m[1])) return json({ error: 'No such table' }, 404);
			return env.TABLES.get(env.TABLES.idFromName(m[1])).fetch(req);
		}

		if (url.pathname === '/') return json({ ok: true, service: 'jade-table-server' });
		return json({ error: 'Not found' }, 404);
	}
} satisfies ExportedHandler<Env>;

export class TableRoom extends DurableObject<Env> implements Host {
	core!: TableCore;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Objects can be evicted between messages (that is what keeps idle tables free),
		// so the table always lives in storage and is reloaded here.
		ctx.blockConcurrencyWhile(async () => {
			this.core = new TableCore((await ctx.storage.get<Room>('room')) ?? null, this);
		});
	}

	// ---- Host ----

	connections(pid?: string): Conn[] {
		const sockets = pid ? this.ctx.getWebSockets(pid) : this.ctx.getWebSockets();
		return sockets
			.filter((ws) => ws.readyState === WebSocket.OPEN)
			.map((ws) => ({
				pid: (ws.deserializeAttachment() as { pid: string }).pid,
				send: (m: ServerMsg) => {
					try {
						ws.send(JSON.stringify(m));
					} catch {
						/* closed */
					}
				}
			}));
	}

	async save(room: Room) {
		await this.ctx.storage.put('room', room);
	}

	async setAlarm(at: number | null) {
		if (at) await this.ctx.storage.setAlarm(at);
		else await this.ctx.storage.deleteAlarm();
	}

	// ---- RPC + WebSocket lifecycle ----

	init(code: string, settings: TableSettings, hostId: string) {
		return this.core.init(code, settings, hostId);
	}

	summary() {
		return this.core.summary();
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const pid = url.searchParams.get('pid');
		const [client, server] = Object.values(new WebSocketPair());
		const res = this.core.join(pid, url.searchParams.get('name'));
		if (!res.ok) {
			server.accept();
			server.send(JSON.stringify({ type: 'error', message: res.message } satisfies ServerMsg));
			server.close(res.code, res.message);
			return new Response(null, { status: 101, webSocket: client });
		}
		// Hibernation API: the object may sleep while sockets stay open; tagging the socket
		// with the player id lets us find "is this player connected?" after waking up.
		this.ctx.acceptWebSocket(server, [pid!]);
		server.serializeAttachment({ pid });
		await this.core.connected();
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const { pid } = ws.deserializeAttachment() as { pid: string };
		const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
		await this.core.message(pid, text, (m) => ws.send(JSON.stringify(m)));
	}

	async webSocketClose(ws: WebSocket, code: number) {
		const { pid } = ws.deserializeAttachment() as { pid: string };
		try {
			ws.close(code === 1005 ? 1000 : code, 'bye');
		} catch {
			/* already closed */
		}
		await this.core.disconnected(pid);
	}

	async webSocketError(ws: WebSocket) {
		const { pid } = ws.deserializeAttachment() as { pid: string };
		await this.core.disconnected(pid);
	}

	async alarm() {
		await this.core.alarm();
	}
}
