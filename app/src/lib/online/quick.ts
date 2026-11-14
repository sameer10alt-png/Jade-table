// Quick match: talk to /api/quick (see server/src/quick.ts). Guests send their browser id;
// signed in, the server uses the account from the cookie instead.
import type { VariantId } from '#lib/engine/types.ts';

export type QuickStatus =
	| { state: 'waiting'; variant: VariantId; waiting: number; waitedMs: number; startsInMs: number; joined: string[] }
	| { state: 'matched'; code: string }
	| { state: 'none' };

async function post<T>(path: string, body: unknown, keepalive = false): Promise<T> {
	const r = await fetch(path, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		keepalive
	});
	const d = (await r.json().catch(() => ({}))) as T & { error?: string };
	if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
	return d;
}

export const quickJoin = (variant: VariantId, playerId: string, name: string) => post<QuickStatus>('/api/quick/join', { variant, playerId, name });
export const quickStatus = (playerId: string) => post<QuickStatus>('/api/quick/status', { playerId });
export const quickNow = (playerId: string) => post<QuickStatus>('/api/quick/now', { playerId });
/** keepalive: still delivered when called while the page is closing */
export const quickLeave = (playerId: string) => post('/api/quick/leave', { playerId }, true).catch(() => {});
export const quickCounts = () =>
	fetch('/api/quick/counts')
		.then((r) => r.json())
		.then((d: { waiting: Record<string, number> }) => d.waiting)
		.catch(() => ({}) as Record<string, number>);
