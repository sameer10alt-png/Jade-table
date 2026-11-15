// Accounts: "Sign in with Google", users and sessions in Postgres.
//
// Design choices:
// - Server-side OAuth (authorization code flow). The browser never sees Google tokens; the
//   server exchanges the one-time code directly with Google over TLS and reads the user from
//   the ID token it gets back.
// - Our own session: a random token in an HttpOnly cookie. Only a SHA-256 hash of it is stored,
//   so a leaked database can't be used to log in as anyone.
// - Accounts are optional. Without DATABASE_URL / Google credentials the site works for guests.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface User {
	id: number;
	name: string;
	email: string | null;
	picture: string | null;
	skill: string | null;
}

/** The smallest database interface we need: both `pg` and PGlite satisfy it. */
interface Db {
	query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

const SESSION_COOKIE = 'jt_session';
const STATE_COOKIE = 'jt_oauth';
const SESSION_DAYS = 60;

let db: Db | null = null;
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
/** test-only stand-in for Google, never enabled unless explicitly asked for */
const FAKE_LOGIN = process.env.ACCOUNTS_FAKE_LOGIN === '1';

export const accountsEnabled = () => !!db; // signup (email/phone) or Google
/** the database, if there is one (also used to store tables) */
export const getDb = () => db;

export async function initAccounts() {
	if (process.env.DATABASE_URL) {
		const pg = await import('pg');
		const pool = new pg.default.Pool({
			connectionString: process.env.DATABASE_URL,
			max: 5,
			// Railway's internal network doesn't use TLS; public proxies do.
			ssl: /sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined
		});
		db = pool as unknown as Db;
	} else if (FAKE_LOGIN) {
		// local testing: an in-process Postgres (PGlite), in memory or in PGLITE_DIR
		const { PGlite } = await import('@electric-sql/pglite');
		db = new PGlite(process.env.PGLITE_DIR) as unknown as Db;
	} else {
		console.log('  accounts: off (set DATABASE_URL and GOOGLE_CLIENT_ID/SECRET to enable)');
		return;
	}
	await migrate();
	console.log(`  accounts: on (${GOOGLE_ID ? 'Google sign-in' : 'test login only'})`);
}

async function migrate() {
	await db!.query(`
		create table if not exists users (
			id bigserial primary key,
			google_sub text unique,
			email text,
			name text not null,
			picture text,
			created_at timestamptz not null default now(),
			last_seen timestamptz not null default now()
		)`);
	await db!.query(`
		create table if not exists sessions (
			token_hash text primary key,
			user_id bigint not null references users(id) on delete cascade,
			created_at timestamptz not null default now(),
			expires_at timestamptz not null
		)`);
	await db!.query(`create index if not exists sessions_user on sessions(user_id)`);
	// tables live here too, so they survive deploys and can be listed per account
	await db!.query(`
		create table if not exists rooms (
			code text primary key,
			data jsonb not null,
			updated_at timestamptz not null default now()
		)`);
	await db!.query(`create index if not exists rooms_updated on rooms(updated_at)`);
	// friends: a public friend code per account, requests/friendships, and table invites
	await db!.query(`alter table users add column if not exists friend_code text unique`);
	// a longer, separate secret for "add me" links: tapping one makes you friends at once
	await db!.query(`alter table users add column if not exists friend_link text unique`);
		// lightweight signup (no Google): username + contact (email or phone), both unique = one per person
		await db!.query(`alter table users add column if not exists username text unique`);
		await db!.query(`alter table users add column if not exists contact text unique`);
		await db!.query(`alter table users add column if not exists skill text`); // beginner | intermediate | advanced
	await db!.query(`
		create table if not exists friendships (
			user_a bigint not null references users(id) on delete cascade,
			user_b bigint not null references users(id) on delete cascade,
			status text not null check (status in ('pending', 'accepted')),
			requested_by bigint not null,
			created_at timestamptz not null default now(),
			primary key (user_a, user_b),
			check (user_a < user_b)
		)`);
	await db!.query(`
		create table if not exists invites (
			id bigserial primary key,
			from_user bigint not null references users(id) on delete cascade,
			to_user bigint not null references users(id) on delete cascade,
			code text not null,
			created_at timestamptz not null default now(),
			unique (from_user, to_user, code)
		)`);
	await db!.query(`
		create table if not exists notifications (
			id bigserial primary key,
			user_id bigint not null references users(id) on delete cascade,
			kind text not null,
			data jsonb not null,
			created_at timestamptz not null default now(),
			read_at timestamptz
		)`);
	await db!.query(`create index if not exists notifications_user on notifications (user_id, created_at desc)`);
	await db!.query(`
		create table if not exists table_members (
			user_id bigint not null references users(id) on delete cascade,
			code text not null,
			joined_at timestamptz not null default now(),
			primary key (user_id, code)
		)`);
}

// ---- helpers ----

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');

function cookies(req: IncomingMessage): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of (req.headers.cookie ?? '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
	}
	return out;
}

/** The site's public address: PUBLIC_URL, or worked out from the request (behind Railway's proxy). */
export function publicUrl(req: IncomingMessage): string {
	if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
	const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? 'http';
	const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
	return `${proto}://${host}`;
}

function setCookie(res: ServerResponse, req: IncomingMessage, name: string, value: string, maxAgeSec: number) {
	const secure = publicUrl(req).startsWith('https://') ? '; Secure' : '';
	const prev = res.getHeader('set-cookie');
	const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
	list.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
	res.setHeader('set-cookie', list);
}

/** Only allow redirects back into our own site. */
function safeNext(next: string | null | undefined): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function redirect(res: ServerResponse, to: string) {
	res.writeHead(302, { location: to });
	res.end();
}

// ---- users & sessions ----

async function upsertGoogleUser(sub: string, email: string | null, name: string, picture: string | null): Promise<User> {
	// someone who signed up with this email first: attach Google to that player (one player per person)
	if (email) {
		const linked = await db!.query<User>(
			`update users set google_sub = $1, picture = coalesce(picture, $3), last_seen = now()
			 where lower(contact) = lower($2) and google_sub is null
			   and not exists (select 1 from users where google_sub = $1)
			 returning id, name, email, picture`,
			[sub, email, picture]
		);
		if (linked.rows[0]) return { ...linked.rows[0], id: Number(linked.rows[0].id) };
	}
	const { rows } = await db!.query<User>(
		`insert into users (google_sub, email, name, picture) values ($1, $2, $3, $4)
		 on conflict (google_sub) do update set email = excluded.email, picture = excluded.picture, last_seen = now()
		 returning id, name, email, picture`,
		[sub, email, name, picture]
	);
	return { ...rows[0], id: Number(rows[0].id) };
}

async function startSession(req: IncomingMessage, res: ServerResponse, userId: number) {
	const t = token();
	await db!.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)`, [
		sha256(t),
		userId,
		String(SESSION_DAYS)
	]);
	setCookie(res, req, SESSION_COOKIE, t, SESSION_DAYS * 86400);
}

/** The signed-in user for this request (HTTP or WebSocket upgrade), or null for a guest. */
export async function currentUser(req: IncomingMessage): Promise<User | null> {
	if (!db) return null;
	const t = cookies(req)[SESSION_COOKIE];
	if (!t) return null;
	const { rows } = await db.query<User>(
		`select u.id, u.name, u.email, u.picture, u.skill from sessions s join users u on u.id = s.user_id
		 where s.token_hash = $1 and s.expires_at > now()`,
		[sha256(t)]
	);
	return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

/** The id a signed-in user plays under at tables (guests use their browser's random id). */
export const accountPid = (u: User) => `account-${u.id}`;

/** self-rated skill -> engine bot level, so quick-match opponents are a fair match */
export const SKILL_TO_LEVEL: Record<string, 'beginner' | 'intermediate' | 'expert'> = {
	beginner: 'beginner',
	intermediate: 'intermediate',
	advanced: 'expert'
};
const VALID_SKILLS = new Set(['beginner', 'intermediate', 'advanced']);
const cleanSkill = (v: unknown) => (typeof v === 'string' && VALID_SKILLS.has(v) ? v : 'intermediate');

/** Accept an email or a phone number; return a normalized form (or null) and which kind it is. */
function normalizeContact(raw: string): { contact: string | null; kind: 'email' | 'phone' } {
	const s = raw.trim();
	if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { contact: s.toLowerCase(), kind: 'email' };
	const compact = s.replace(/[^\d+]/g, '');
	const digits = compact.replace(/\D/g, '');
	if (digits.length >= 7 && digits.length <= 15) return { contact: compact.startsWith('+') ? compact : digits, kind: 'phone' };
	return { contact: null, kind: 'email' };
}

// ---- HTTP routes: returns true when it handled the request ----

export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	const json = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};

	if (url.pathname === '/api/me') {
		const user = await currentUser(req);
		return json(200, { enabled: accountsEnabled(), google: !!GOOGLE_ID, user: user && { name: user.name, picture: user.picture, email: user.email, skill: user.skill } });
	}

	if (url.pathname === '/api/logout' && req.method === 'POST') {
		const t = cookies(req)[SESSION_COOKIE];
		if (t && db) await db.query(`delete from sessions where token_hash = $1`, [sha256(t)]);
		setCookie(res, req, SESSION_COOKIE, '', 0);
		return json(200, { ok: true });
	}

	if (url.pathname === '/api/me/name' && req.method === 'POST') {
		const user = await currentUser(req);
		if (!user) return json(401, { error: 'Not signed in' });
		let body = '';
		for await (const c of req) body += c;
		const name = String((JSON.parse(body || '{}') as { name?: string }).name ?? '')
			.replace(/[^\p{L}\p{N} ._-]/gu, '')
			.trim()
			.slice(0, 16);
		if (!name) return json(400, { error: 'Pick a name' });
		await db!.query(`update users set name = $1 where id = $2`, [name, user.id]);
		return json(200, { name });
	}

	// Step 1: send the browser to Google with a one-time "state" that only this browser knows.
	if (url.pathname === '/auth/google') {
		if (!accountsEnabled() || !GOOGLE_ID) return json(503, { error: 'Sign-in is not set up yet' });
		const state = token();
		setCookie(res, req, STATE_COOKIE, `${state}|${safeNext(url.searchParams.get('next'))}`, 600);
		const q = new URLSearchParams({
			client_id: GOOGLE_ID,
			redirect_uri: `${publicUrl(req)}/auth/google/callback`,
			response_type: 'code',
			scope: 'openid email profile',
			state,
			prompt: 'select_account'
		});
		redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${q}`);
		return true;
	}

	// Step 2: Google sends the browser back with a code. Check the state, swap the code for the
	// user's identity (server to Google directly), then start our own session.
	if (url.pathname === '/auth/google/callback') {
		const [state, next] = (cookies(req)[STATE_COOKIE] ?? '').split('|');
		const got = url.searchParams.get('state') ?? '';
		setCookie(res, req, STATE_COOKIE, '', 0);
		const sameState = !!state && state.length === got.length && timingSafeEqual(Buffer.from(state), Buffer.from(got));
		const code = url.searchParams.get('code');
		if (!sameState || !code) {
			redirect(res, '/?signin=failed');
			return true;
		}
		try {
			const r = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					code,
					client_id: GOOGLE_ID,
					client_secret: GOOGLE_SECRET,
					redirect_uri: `${publicUrl(req)}/auth/google/callback`,
					grant_type: 'authorization_code'
				})
			});
			const tok = (await r.json()) as { id_token?: string; error?: string };
			if (!r.ok || !tok.id_token) throw new Error(tok.error ?? `token exchange failed (${r.status})`);
			// The ID token came straight from Google's token endpoint over TLS, so its claims can be
			// read without re-verifying the signature (OpenID Connect Core, section 3.1.3.7).
			const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()) as {
				sub: string;
				aud: string;
				iss: string;
				email?: string;
				email_verified?: boolean;
				name?: string;
				given_name?: string;
				picture?: string;
			};
			if (claims.aud !== GOOGLE_ID || !/accounts\.google\.com$/.test(claims.iss)) throw new Error('token not for us');
			const name = (claims.given_name || claims.name || 'Player').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16) || 'Player';
			const user = await upsertGoogleUser(claims.sub, claims.email_verified ? (claims.email ?? null) : null, name, claims.picture ?? null);
			await startSession(req, res, user.id);
			redirect(res, safeNext(next));
		} catch (e) {
			console.error('Google sign-in failed:', (e as Error).message);
			redirect(res, '/?signin=failed');
		}
		return true;
	}

	// Lightweight signup/sign-in: email or phone + username, one per person. No password.
	if (url.pathname === '/api/register' && req.method === 'POST') {
		if (!db) return json(503, { error: 'Accounts are not set up yet.' });
		let body = '';
		for await (const c of req) body += c;
		let data: { contact?: string; username?: string; skill?: string };
		try {
			data = JSON.parse(body || '{}');
		} catch {
			return json(400, { error: 'Bad request.' });
		}
		const username = String(data.username ?? '')
			.replace(/[^\p{L}\p{N} ._-]/gu, '')
			.trim()
			.slice(0, 16);
		if (username.length < 2) return json(400, { error: 'Pick a username (at least 2 characters).' });
		const { contact, kind } = normalizeContact(String(data.contact ?? ''));
		if (!contact) return json(400, { error: 'Enter a valid email or phone number.' });
		const skill = cleanSkill(data.skill);

		// Returning player: this contact is already registered.
		const existing = await db.query<{ id: string; username: string | null }>(`select id, username from users where contact = $1`, [contact]);
		if (existing.rows.length) {
			const row = existing.rows[0];
			if ((row.username ?? '').toLowerCase() === username.toLowerCase()) {
				await db.query(`update users set skill = $1 where id = $2`, [skill, Number(row.id)]);
				await startSession(req, res, Number(row.id));
				return json(200, { name: username, returning: true });
			}
			return json(409, { error: `That ${kind} is already registered. Sign in with the username you chose before.` });
		}
		// New player: make sure the username is free.
		const taken = await db.query(`select 1 from users where lower(username) = lower($1)`, [username]);
		if (taken.rows.length) return json(409, { error: 'That username is taken \u2014 try another.' });
		try {
			const { rows } = await db.query<{ id: string }>(`insert into users (name, username, contact, skill) values ($1, $2, $3, $4) returning id`, [
				username,
				username,
				contact,
				skill
			]);
			await startSession(req, res, Number(rows[0].id));
			return json(200, { name: username, returning: false });
		} catch (e) {
			if ((e as { code?: string }).code === '23505') return json(409, { error: 'That username or contact is already taken.' });
			console.error('register failed:', (e as Error).message);
			return json(500, { error: 'Could not create your player. Try again.' });
		}
	}

	// Test-only: sign in as a named test user without Google. Never enabled in production.
	if (url.pathname === '/auth/test-login' && FAKE_LOGIN && db) {
		const name = (url.searchParams.get('name') ?? 'Tester').slice(0, 16);
		const user = await upsertGoogleUser(`test:${name}`, null, name, null);
		await startSession(req, res, user.id);
		redirect(res, safeNext(url.searchParams.get('next')));
		return true;
	}

	return false;
}
