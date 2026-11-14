// Friends: talking to /api/friends, plus a small shared "badge" state that the header polls.

export interface Friend {
	code: string;
	name: string;
	picture: string | null;
	online: boolean;
	atTable: boolean;
}

export interface Invite {
	id: number;
	code: string;
	from: { name: string; picture: string | null };
	variantName: string;
	createdAt: string;
}

export interface FriendsOverview {
	myCode: string;
	myLink: string;
	friends: Friend[];
	incoming: Friend[];
	outgoing: Friend[];
	suggestions: Friend[];
	invites: Invite[];
}

/** one entry in the bell (see server/src/notifications.ts) */
export interface Note {
	id: number;
	kind: 'friend_request' | 'friend_accepted' | 'invite' | 'joined';
	name: string;
	picture: string | null;
	/** friend code, for Accept */
	code?: string;
	table?: string;
	variantName?: string;
	createdAt: string;
	read: boolean;
	/** still something you can act on */
	active: boolean;
}

/** unread count, open invites and the newest unread notes; refreshed every 20 seconds while signed in */
export const notify = $state<{ unread: number; invites: number; latest: Note[] }>({ unread: 0, invites: 0, latest: [] });

async function call<T>(path: string, body?: unknown): Promise<T> {
	const r = await fetch(path, {
		method: body === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		headers: body === undefined ? {} : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = (await r.json().catch(() => ({}))) as T & { error?: string };
	if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
	return data;
}

export const friendsOverview = () => call<FriendsOverview>('/api/friends');
export const requestFriend = (code: string) => call<{ status: 'requested' | 'friends'; name: string }>('/api/friends/request', { code });
export const respondFriend = (code: string, accept: boolean) => call('/api/friends/respond', { code, accept });
export const removeFriend = (code: string) => call('/api/friends/remove', { code });
export const inviteFriend = (code: string, table: string) => call<{ ok: true; name: string }>('/api/friends/invite', { code, table });
export const dismissInvite = (id: number) => call('/api/friends/dismiss', { id });
export const useFriendLink = (token: string) => call<{ status: 'friends'; name: string }>('/api/friends/link', { token });
export const newFriendLink = () => call<{ myLink: string }>('/api/friends/new-link', {});
export const whoSentLink = (token: string) => call<{ name: string; picture: string | null }>(`/api/friends/who/${token}`);

/** how you relate to a seat at your table; null = you, a guest, a bot or empty */
export type SeatFriend = 'friend' | 'sent' | 'incoming' | 'none' | null;
export const tableFriends = (table: string) => call<{ seats: SeatFriend[] }>(`/api/friends/table/${table}`).then((r) => r.seats);
export const addSeatFriend = (table: string, seat: number) => call<{ status: 'requested' | 'friends' }>('/api/friends/add-seat', { table, seat });

export const notifications = () => call<{ notes: Note[] }>('/api/notifications').then((r) => r.notes);
export const markNotesRead = () => call('/api/notifications/read', {});

export const friendLinkUrl = (token: string) => `${location.origin}/friends/add/${token}`;

let timer: ReturnType<typeof setInterval> | undefined;

/** Check now (also called after you accept something, so the badge updates at once). */
export async function refreshNotify() {
	try {
		const n = await call<typeof notify>('/api/notify');
		notify.unread = n.unread;
		notify.invites = n.invites;
		notify.latest = n.latest ?? [];
	} catch {
		/* signed out or offline: keep the last counts */
	}
}

const onVisible = () => document.visibilityState === 'visible' && refreshNotify();

/** Start polling (also marks you "online" for friends). */
export function startNotify() {
	if (timer) return;
	refreshNotify();
	timer = setInterval(refreshNotify, 20_000);
	// coming back to the tab: check straight away instead of waiting for the next tick
	document.addEventListener('visibilitychange', onVisible);
}

export function stopNotify() {
	clearInterval(timer);
	timer = undefined;
	document.removeEventListener('visibilitychange', onVisible);
	notify.unread = 0;
	notify.invites = 0;
	notify.latest = [];
}

/** the words after the name, and what the button does (shared by the bell and the pop-ups) */
export function describeNote(n: Note): { rest: string; action: 'accept' | 'join' | 'open' | null } {
	switch (n.kind) {
		case 'friend_request':
			return { rest: n.active ? 'wants to be friends' : 'sent you a friend request', action: n.active ? 'accept' : null };
		case 'friend_accepted':
			return { rest: "accepted: you're friends now", action: null };
		case 'invite':
			return { rest: `invited you to play ${n.variantName ?? ''}`.trim(), action: n.active ? 'join' : null };
		case 'joined':
			return { rest: `sat down at your table ${n.table ?? ''}`.trim(), action: n.active ? 'open' : null };
	}
}

/** Go to a table. From a game, ask first: you leave your seat (a bot covers it). */
export function goToTable(code: string, fromTable: boolean, who: string) {
	if (fromTable && !confirm(`Leave this table to join ${who}? Your seat is kept (a bot plays it) and you can come back later.`)) return false;
	// a full page load, so the table page starts fresh for the new code
	location.href = `/online/${code}`;
	return true;
}

export function timeAgo(iso: string) {
	const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	return `${Math.floor(s / 86400)} d ago`;
}
