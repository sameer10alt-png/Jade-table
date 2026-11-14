// Browser side of online play: who you are, where the server is, and a connection that
// reconnects by itself.
import type { ClientMsg, ServerMsg, TableSettings } from './protocol';

/**
 * Game server address. Set VITE_GAME_SERVER when it lives elsewhere; by default it is this
 * same site (the dev server forwards /api and /ws to it), so devices only need one address.
 */
export function serverUrl(): string {
	return (import.meta.env.VITE_GAME_SERVER as string | undefined) || location.origin;
}

export interface Identity {
	id: string;
	name: string;
}

const ID_KEY = 'jt.identity.v1';

/**
 * Until we have accounts, a random id kept in this browser identifies you. It is only ever
 * sent to the server (other players never see it), so it works like a simple secret.
 */
export function identity(): Identity {
	try {
		const saved = JSON.parse(localStorage.getItem(ID_KEY) ?? 'null') as Identity | null;
		if (saved?.id) return saved;
	} catch {
		/* fall through */
	}
	const fresh = { id: randomId(), name: '' };
	saveIdentity(fresh);
	return fresh;
}

/**
 * crypto.randomUUID() only exists on secure pages (https or localhost), so a phone opening
 * http://192.168.x.x would crash. getRandomValues works everywhere.
 */
function randomId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function saveIdentity(i: Identity) {
	try {
		localStorage.setItem(ID_KEY, JSON.stringify(i));
	} catch {
		/* private mode: id lasts for this tab only */
	}
}

const LAST_TABLE = 'jt.lastTable.v1';

/** Remember the online table you're seated at, so the home page can offer "Rejoin". */
export function rememberTable(code: string | null) {
	try {
		if (code) localStorage.setItem(LAST_TABLE, code);
		else localStorage.removeItem(LAST_TABLE);
	} catch {
		/* ignore */
	}
}

export function lastTable(): string | null {
	try {
		return localStorage.getItem(LAST_TABLE);
	} catch {
		return null;
	}
}

export async function createTable(settings: TableSettings, playerId: string): Promise<string> {
	const res = await fetch(`${serverUrl()}/api/tables`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ settings, playerId })
	});
	const data = (await res.json()) as { code?: string; error?: string };
	if (!res.ok || !data.code) throw new Error(data.error ?? 'Could not create a table');
	return data.code;
}

export async function tableExists(code: string): Promise<boolean> {
	const res = await fetch(`${serverUrl()}/api/tables/${code}`);
	return res.ok;
}

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** A WebSocket to one table that reconnects with backoff and pings to stay alive. */
export class TableConnection {
	private ws: WebSocket | null = null;
	private tries = 0;
	private pinger: ReturnType<typeof setInterval> | undefined;
	private retry: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;

	constructor(
		private code: string,
		private me: Identity,
		private onMessage: (m: ServerMsg) => void,
		private onState: (s: ConnState, reason?: string) => void
	) {
		this.open();
	}

	private open() {
		const base = serverUrl().replace(/^http/, 'ws');
		const url = `${base}/ws/table/${this.code}?pid=${encodeURIComponent(this.me.id)}&name=${encodeURIComponent(this.me.name || 'Guest')}`;
		this.onState(this.tries ? 'reconnecting' : 'connecting');
		const ws = new WebSocket(url);
		this.ws = ws;
		ws.onopen = () => {
			this.tries = 0;
			this.onState('open');
			clearInterval(this.pinger);
			this.pinger = setInterval(() => this.send({ type: 'ping' }), 20_000);
		};
		ws.onmessage = (e) => {
			try {
				this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
			} catch {
				/* ignore malformed */
			}
		};
		ws.onclose = (e) => {
			clearInterval(this.pinger);
			if (this.stopped) return;
			// 4000-4099: the server refused us (full table, no such table…) — retrying won't help
			if (e.code >= 4000 && e.code < 4100) {
				this.onState('closed', e.reason);
				return;
			}
			this.tries++;
			this.onState('reconnecting');
			this.retry = setTimeout(() => this.open(), Math.min(10_000, 500 * 2 ** this.tries));
		};
	}

	send(m: ClientMsg) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
	}

	close() {
		this.stopped = true;
		clearInterval(this.pinger);
		clearTimeout(this.retry);
		this.ws?.close(1000, 'left');
	}
}
