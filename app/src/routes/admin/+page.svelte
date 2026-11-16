<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import { APP_NAME } from '#lib/brand.ts';

	// God mode. Only accounts with users.is_admin = true get past the server's checks.
	type Tab = 'overview' | 'message' | 'players' | 'tables' | 'settings' | 'log';
	let tab = $state<Tab>('overview');
	let err = $state('');
	let note = $state('');

	async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T | null> {
		err = '';
		try {
			const r = await fetch(`/api/admin${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const d = await r.json().catch(() => ({}));
			if (!r.ok) {
				err = d.error ?? `Failed (${r.status})`;
				return null;
			}
			return d as T;
		} catch {
			err = 'Network error';
			return null;
		}
	}
	const flash = (t: string) => {
		note = t;
		setTimeout(() => (note = ''), 3000);
	};
	const when = (t: string | null) => (t ? new Date(t).toLocaleString() : '—');

	// ---- overview ----
	type Overview = {
		online: number;
		waiting: Record<string, number>;
		liveTables: number;
		users: number;
		signups24h: number;
		activeToday: number;
		banned: number;
		hands24h: number;
		onlineHands24h: number;
		dragonToday: number;
		settings: { maintenance: string | null; dragon: boolean };
	};
	let ov = $state<Overview | null>(null);
	const loadOverview = async () => (ov = await api<Overview>('/overview'));

	// ---- messages ----
	let text = $state('');
	let style = $state<'banner' | 'popup'>('banner');
	let level = $state<'info' | 'warn' | 'celebrate'>('info');
	let minutes = $state(60);
	let toUser = $state('');
	let link = $state('');
	type Ann = { id: number; text: string; style: string; level: string; target: string | null; created_at: string; expires_at: string | null; ended: boolean };
	let anns = $state<Ann[]>([]);
	const loadAnns = async () => (anns = (await api<{ items: Ann[] }>('/announcements'))?.items ?? []);
	async function sendMsg() {
		const r = await api('/announce', { text, style, level, minutes, user: toUser.trim() || null, link: link.trim() || null });
		if (r) {
			flash(toUser.trim() ? `Sent to ${toUser.trim()}` : 'Sent to everyone');
			text = '';
			loadAnns();
		}
	}
	async function endAnn(id: number) {
		if (await api(`/announcements/${id}/end`, {})) loadAnns();
	}
	const live = (a: Ann) => !a.ended && (!a.expires_at || new Date(a.expires_at) > new Date());

	// ---- players ----
	type U = {
		id: number;
		name: string;
		email: string | null;
		username: string | null;
		picture: string | null;
		created_at: string;
		last_seen: string;
		wins: number;
		losses: number;
		draws: number;
		is_admin: boolean;
		banned: boolean;
	};
	let q = $state('');
	let users = $state<U[]>([]);
	const loadUsers = async () => (users = (await api<{ users: U[] }>(`/users?q=${encodeURIComponent(q)}`))?.users ?? []);
	async function userAction(u: U, action: string, confirmText?: string, value?: string) {
		if (confirmText && !confirm(confirmText)) return;
		if (await api(`/users/${u.id}`, { action, value })) {
			flash(`${u.name}: done`);
			loadUsers();
		}
	}
	function rename(u: U) {
		const v = prompt(`New name for ${u.name}`, u.name);
		if (v && v.trim()) userAction(u, 'rename', undefined, v.trim());
	}
	function messageUser(u: U) {
		toUser = String(u.id);
		tab = 'message';
	}

	// ---- tables ----
	type T = { code: string; variant: string; status: string; hand: number | null; quick: boolean; seats: { name: string; person: boolean; online: boolean }[]; updated: number };
	let tables = $state<T[]>([]);
	const loadTables = async () => (tables = (await api<{ tables: T[] }>('/tables'))?.tables ?? []);
	async function closeTable(t: T) {
		if (!confirm(`Close table ${t.code}? Everyone at it is sent away.`)) return;
		if (await api(`/tables/${t.code}/close`, {})) {
			flash(`Closed ${t.code}`);
			loadTables();
		}
	}

	// ---- settings ----
	let maint = $state('');
	async function saveSettings(s: Record<string, unknown>) {
		const r = await api<{ settings: Overview['settings'] }>('/settings', s);
		if (r) {
			flash('Saved');
			loadOverview();
		}
	}

	// ---- log ----
	type L = { id: number; action: string; detail: unknown; created_at: string; admin: string | null };
	let log = $state<L[]>([]);
	const loadLog = async () => (log = (await api<{ log: L[] }>('/log'))?.log ?? []);

	let ready = $state(false);
	let refresh: ReturnType<typeof setInterval> | undefined;
	onMount(async () => {
		await loadAccount();
		ready = true;
		if (!account.user?.isAdmin) return;
		await loadOverview();
		maint = ov?.settings.maintenance ?? '';
		refresh = setInterval(() => {
			if (tab === 'overview') loadOverview();
			if (tab === 'tables') loadTables();
		}, 10_000);
	});
	onDestroy(() => clearInterval(refresh));
	$effect(() => {
		if (!account.user?.isAdmin) return;
		if (tab === 'overview') loadOverview();
		if (tab === 'message') loadAnns();
		if (tab === 'players') loadUsers();
		if (tab === 'tables') loadTables();
		if (tab === 'log') loadLog();
	});
	const TABS: [Tab, string][] = [
		['overview', 'Overview'],
		['message', 'Message players'],
		['players', 'Players'],
		['tables', 'Live tables'],
		['settings', 'Settings'],
		['log', 'Log']
	];
</script>

<svelte:head><title>Admin · {APP_NAME}</title></svelte:head>

<main class="wrap admin">
	{#if !ready}
		<p>Loading…</p>
	{:else if !account.user?.isAdmin}
		<h1>Not here</h1>
		<p>This page is for admins.</p>
	{:else}
		<p class="kicker">God mode</p>
		<h1>Admin</h1>
		<div class="tabs">
			{#each TABS as [id, label] (id)}
				<button class:on={tab === id} onclick={() => (tab = id)}>{label}</button>
			{/each}
		</div>
		{#if err}<p class="err">{err}</p>{/if}
		{#if note}<p class="ok">{note}</p>{/if}

		{#if tab === 'overview' && ov}
			<div class="stats">
				<div><b>{ov.online}</b><span>online now</span></div>
				<div><b>{ov.liveTables}</b><span>games running</span></div>
				<div><b>{Object.values(ov.waiting).reduce((a, b) => a + b, 0)}</b><span>in quick match</span></div>
				<div><b>{ov.users}</b><span>players</span></div>
				<div><b>{ov.signups24h}</b><span>new in 24h</span></div>
				<div><b>{ov.activeToday}</b><span>active in 24h</span></div>
				<div><b>{ov.hands24h}</b><span>hands in 24h</span></div>
				<div><b>{ov.onlineHands24h}</b><span>online hands in 24h</span></div>
				<div><b>{ov.dragonToday}</b><span>Dragon uses today</span></div>
				<div><b>{ov.banned}</b><span>banned</span></div>
			</div>
			<p class="muted">
				Maintenance: <b>{ov.settings.maintenance ? 'ON' : 'off'}</b> · Dragon: <b>{ov.settings.dragon ? 'on' : 'OFF'}</b> · refreshes every 10 s
			</p>
		{/if}

		{#if tab === 'message'}
			<section class="card">
				<h2>Put a message on screens</h2>
				<textarea bind:value={text} rows="3" maxlength="500" placeholder="e.g. New: International mahjong is live! 🎉"></textarea>
				<div class="row">
					<label>Show as
						<select bind:value={style}><option value="banner">Banner at the top</option><option value="popup">Pop-up in the middle</option></select>
					</label>
					<label>Colour
						<select bind:value={level}><option value="info">Blue · news</option><option value="warn">Orange · warning</option><option value="celebrate">Green · celebrate</option></select>
					</label>
					<label>Lasts
						<select bind:value={minutes}>
							<option value={10}>10 min</option><option value={60}>1 hour</option><option value={360}>6 hours</option>
							<option value={1440}>1 day</option><option value={10080}>1 week</option><option value={0}>Until I end it</option>
						</select>
					</label>
				</div>
				<div class="row">
					<label class="grow">To one player (name, email or id), or blank for everyone
						<input bind:value={toUser} placeholder="everyone" />
					</label>
					<label class="grow">Button link (optional)
						<input bind:value={link} placeholder="/quick/international or https://…" />
					</label>
				</div>
				<button class="btn primary" disabled={!text.trim()} onclick={sendMsg}>Send{toUser.trim() ? ` to ${toUser.trim()}` : ' to everyone'}</button>
				<p class="muted">Shows within 20 seconds on every open page, including during games. Each person sees it once and can dismiss it.</p>
			</section>
			<h2>Recent messages</h2>
			<table>
				<thead><tr><th>Message</th><th>To</th><th>Type</th><th>Sent</th><th></th></tr></thead>
				<tbody>
					{#each anns as a (a.id)}
						<tr class:dim={!live(a)}>
							<td>{a.text}</td>
							<td>{a.target ?? 'Everyone'}</td>
							<td>{a.style} · {a.level}</td>
							<td>{when(a.created_at)}</td>
							<td>{#if live(a)}<button class="btn sm" onclick={() => endAnn(a.id)}>End</button>{:else}ended{/if}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if tab === 'players'}
			<form class="row" onsubmit={(e) => (e.preventDefault(), loadUsers())}>
				<input class="grow" bind:value={q} placeholder="Search name, email, username or id" />
				<button class="btn">Search</button>
			</form>
			<table>
				<thead><tr><th></th><th>Player</th><th>Record</th><th>Joined</th><th>Last seen</th><th>Actions</th></tr></thead>
				<tbody>
					{#each users as u (u.id)}
						<tr class:dim={u.banned}>
							<td><Avatar name={u.name} picture={u.picture} size={28} /></td>
							<td>
								<b>{u.name}</b>
								{#if u.is_admin}<span class="tag">admin</span>{/if}
								{#if u.banned}<span class="tag red">banned</span>{/if}
								<br /><small>#{u.id} · {u.email ?? u.username ?? ''}</small>
							</td>
							<td>{u.wins}W {u.losses}L {u.draws}D</td>
							<td>{when(u.created_at)}</td>
							<td>{when(u.last_seen)}</td>
							<td class="acts">
								<button class="btn sm" onclick={() => messageUser(u)}>Message</button>
								<button class="btn sm" onclick={() => rename(u)}>Rename</button>
								<button class="btn sm" onclick={() => userAction(u, 'signOut', `Sign ${u.name} out everywhere?`)}>Sign out</button>
								<button class="btn sm" onclick={() => userAction(u, 'resetStats', `Reset ${u.name}'s wins and record to zero?`)}>Reset record</button>
								{#if u.banned}
									<button class="btn sm" onclick={() => userAction(u, 'unban')}>Unban</button>
								{:else}
									<button class="btn sm red" onclick={() => userAction(u, 'ban', `Ban ${u.name}? They're signed out and can't sign back in.`)}>Ban</button>
								{/if}
								{#if u.is_admin}
									<button class="btn sm" onclick={() => userAction(u, 'removeAdmin', `Remove admin from ${u.name}?`)}>Remove admin</button>
								{:else}
									<button class="btn sm" onclick={() => userAction(u, 'makeAdmin', `Make ${u.name} an admin? They get everything on this page.`)}>Make admin</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if tab === 'tables'}
			{#if !tables.length}<p class="muted">No tables in memory right now.</p>{/if}
			<table>
				<thead><tr><th>Table</th><th>Game</th><th>Status</th><th>Seats</th><th></th></tr></thead>
				<tbody>
					{#each tables as t (t.code)}
						<tr>
							<td><b>{t.code}</b>{#if t.quick}<span class="tag">quick</span>{/if}</td>
							<td>{t.variant}</td>
							<td>{t.status}{t.hand ? ` · hand ${t.hand}` : ''}</td>
							<td>
								{#each t.seats as s, i (i)}
									<span class="seat" class:bot={!s.person} class:off={s.person && !s.online}>{s.name}{s.person ? '' : ' 🤖'}</span>
								{/each}
							</td>
							<td><button class="btn sm red" onclick={() => closeTable(t)}>Close</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="muted">🤖 = filled seat (only you see this). Grey = person not connected. Refreshes every 10 s.</p>
		{/if}

		{#if tab === 'settings' && ov}
			<section class="card">
				<h2>Maintenance mode</h2>
				<p class="muted">Everyone except admins sees this message instead of the site.</p>
				<textarea bind:value={maint} rows="2" placeholder="e.g. Updating the tables, back in 10 minutes."></textarea>
				<div class="row">
					<button class="btn primary" disabled={!maint.trim()} onclick={() => saveSettings({ maintenance: maint })}>
						{ov.settings.maintenance ? 'Update message' : 'Turn maintenance on'}
					</button>
					{#if ov.settings.maintenance}
						<button class="btn" onclick={() => ((maint = ''), saveSettings({ maintenance: null }))}>Turn off</button>
					{/if}
				</div>
			</section>
			<section class="card">
				<h2>The Dragon</h2>
				<p class="muted">Turn the AI coach off (questions and game reviews) to stop costs or while fixing something.</p>
				<button class="btn" onclick={() => saveSettings({ dragon: !ov!.settings.dragon })}>
					{ov.settings.dragon ? 'Turn the Dragon off' : 'Turn the Dragon on'}
				</button>
			</section>
		{/if}

		{#if tab === 'log'}
			<table>
				<thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead>
				<tbody>
					{#each log as l (l.id)}
						<tr><td>{when(l.created_at)}</td><td>{l.admin ?? '—'}</td><td>{l.action}</td><td><code>{JSON.stringify(l.detail)}</code></td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</main>

<style>
	.admin {
		padding-top: 24px;
		padding-bottom: 60px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 18px;
	}
	.tabs button {
		border: 1px solid var(--line);
		background: var(--card);
		padding: 8px 14px;
		border-radius: 999px;
		font: inherit;
		cursor: pointer;
	}
	.tabs button.on {
		background: var(--ink);
		color: var(--bg, #fff);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
	}
	.stats div {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 14px;
		display: flex;
		flex-direction: column;
	}
	.stats b {
		font-size: 1.8rem;
	}
	.stats span,
	.muted {
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 16px;
		margin-bottom: 18px;
	}
	.card h2 {
		margin-top: 0;
	}
	textarea,
	input,
	select {
		font: inherit;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg, #fff);
		color: var(--ink);
		width: 100%;
		box-sizing: border-box;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 10px 0;
		align-items: end;
	}
	.row label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.85rem;
	}
	.grow {
		flex: 1;
		min-width: 200px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th,
	td {
		text-align: left;
		padding: 8px 6px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	tr.dim {
		opacity: 0.5;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.btn.sm {
		padding: 4px 10px;
		font-size: 0.8rem;
	}
	.btn.red {
		color: #b5452b;
	}
	.tag {
		margin-left: 6px;
		font-size: 0.7rem;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--line);
	}
	.tag.red {
		background: #f5d5cd;
		color: #8a2a17;
	}
	.seat {
		display: inline-block;
		margin: 0 6px 2px 0;
	}
	.seat.bot {
		color: var(--ink-2);
	}
	.seat.off {
		opacity: 0.5;
	}
	.err {
		color: #b5452b;
	}
	.ok {
		color: #2f6f4e;
	}
	code {
		font-size: 0.75rem;
		word-break: break-all;
	}
</style>
