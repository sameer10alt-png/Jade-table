// Who is signed in, shared by every page. Accounts are optional: guests play with a name and
// a random id kept in this browser; signing in (Google) adds tables and friends on any device.

export interface AccountUser {
	name: string;
	picture: string | null;
	email: string | null;
	skill?: string | null; // beginner | intermediate | advanced
}

export const account = $state<{
	loaded: boolean;
	/** the server has accounts switched on */
	enabled: boolean;
	google: boolean;
	user: AccountUser | null;
}>({ loaded: false, enabled: false, google: false, user: null });

let loading: Promise<void> | null = null;

export function loadAccount(force = false): Promise<void> {
	if (loading && !force) return loading;
	loading = fetch('/api/me', { credentials: 'same-origin' })
		.then((r) => (r.ok ? r.json() : { enabled: false, google: false, user: null }))
		.then((d: { enabled: boolean; google: boolean; user: AccountUser | null }) => {
			account.enabled = !!d.enabled;
			account.google = !!d.google;
			account.user = d.user ?? null;
		})
		.catch(() => {
			account.enabled = false;
			account.user = null;
		})
		.finally(() => {
			account.loaded = true;
		});
	return loading;
}

/** Go to Google; come back to `next` (default: the current page). */
export function signIn(next = location.pathname + location.search) {
	location.href = `/auth/google?next=${encodeURIComponent(next)}`;
}

export async function signOut() {
	await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
	await loadAccount(true);
}

/** Lightweight signup/sign-in: an email or phone + a username + self-rated skill. Throws with a message on failure. */
export async function register(contact: string, username: string, skill: string): Promise<void> {
	const r = await fetch('/api/register', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ contact, username, skill })
	});
	const d = (await r.json()) as { name?: string; error?: string };
	if (!r.ok || !d.name) throw new Error(d.error ?? 'Could not sign you in.');
	await loadAccount(true);
}

export async function rename(name: string): Promise<string> {
	const r = await fetch('/api/me/name', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name })
	});
	const d = (await r.json()) as { name?: string; error?: string };
	if (!r.ok || !d.name) throw new Error(d.error ?? 'Could not change your name');
	if (account.user) account.user.name = d.name;
	return d.name;
}

export interface MyTable {
	code: string;
	variant: string;
	variantName: string;
	status: 'lobby' | 'playing' | 'finished';
	round: number;
	handNo: number;
	yourTurn: boolean;
	players: { name: string; bot: boolean; score: number; you: boolean }[];
	updatedAt: string;
}

/** Tables your account is seated at, newest first. */
export async function myTables(): Promise<MyTable[]> {
	const r = await fetch('/api/my/tables', { credentials: 'same-origin' });
	if (!r.ok) throw new Error('could not load tables');
	return ((await r.json()) as { tables: MyTable[] }).tables;
}

/** Remove a table from your list (the table itself carries on). */
export async function forgetTable(code: string) {
	await fetch(`/api/my/tables/${code}`, { method: 'DELETE', credentials: 'same-origin' });
}
