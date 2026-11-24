<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { botPicture } from '#lib/online/profile.ts';

	// God mode. Only accounts with users.is_admin = true get past the server's checks.
	type Tab = 'overview' | 'message' | 'players' | 'tables' | 'bots' | 'settings' | 'log';
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
		settings: { maintenance: string | null; dragon: boolean; turnSeconds: number; claimSeconds: number; dragonLimit: number; fillPace: number };
	};
	type Charts = {
		days: string[];
		signups: number[];
		hands: number[];
		onlineHands: number[];
		activePlayers: number[];
		dragon: number[];
		byVariant: { variant: string; online: boolean; n: number }[];
		topWeek: { name: string; hands: number; wins: number }[];
	};
	let charts = $state<Charts | null>(null);
	const loadCharts = async () => (charts = await api<Charts>('/charts'));
	const NAMES: Record<string, string> = { international: 'International', riichi: 'Riichi', taiwanese: 'Taiwanese', bombay: 'Bombay', american: 'American', unknown: 'Older hands' };
	const variantRows = $derived.by(() => {
		if (!charts) return [];
		const m = new Map<string, { solo: number; online: number }>();
		for (const r of charts.byVariant) {
			const x = m.get(r.variant) ?? { solo: 0, online: 0 };
			if (r.online) x.online += r.n;
			else x.solo += r.n;
			m.set(r.variant, x);
		}
		return [...m.entries()].map(([v, x]) => ({ name: NAMES[v] ?? v, ...x, total: x.solo + x.online })).sort((a, b) => b.total - a.total);
	});
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
	// one player's full picture
	type Detail = {
		user: U & { skill: string | null };
		byVariant: { variant: string; hands: number; wins: number }[];
		recent: { outcome: string; source: string; variant: string | null; created_at: string }[];
		dragon: { kind: string; total: number; week: number }[];
		reports: number;
		friends: number;
		sessions: number;
	};
	let detail = $state<Detail | null>(null);
	async function openUser(u: U) {
		detail = await api<Detail>(`/users/${u.id}`);
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

	// ---- bots ----
	type Bot = { name: string; hands: number; wins: number; created_at: string };
	let bots = $state<Bot[]>([]);
	const loadBots = async () => (bots = (await api<{ bots: Bot[] }>('/bots'))?.bots ?? []);
	async function resetBot(name?: string) {
		if (!confirm(name ? `Reset ${name}'s record to zero?` : 'Reset every bot record to zero?')) return;
		if (await api('/bots/reset', name ? { name } : {})) {
			flash('Reset');
			loadBots();
		}
	}

	// ---- game settings form ----
	let turnSeconds = $state(30);
	let claimSeconds = $state(15);
	let dragonLimit = $state(5);
	let fillPace = $state(1);
	function syncForm() {
		if (!ov) return;
		turnSeconds = ov.settings.turnSeconds;
		claimSeconds = ov.settings.claimSeconds;
		dragonLimit = ov.settings.dragonLimit;
		fillPace = ov.settings.fillPace;
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
		syncForm();
		refresh = setInterval(() => {
			if (tab === 'overview') loadOverview();
			if (tab === 'tables') loadTables();
		}, 10_000);
	});
	onDestroy(() => clearInterval(refresh));
	$effect(() => {
		if (!account.user?.isAdmin) return;
		if (tab === 'overview') {
			loadOverview();
			loadCharts();
		}
		if (tab === 'settings') loadOverview().then(syncForm);
		if (tab === 'bots') loadBots();
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
		['bots', 'Bots'],
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
			{#if charts}
				<div class="charts">
					{#each [['Hands played', charts.hands], ['Online hands', charts.onlineHands], ['Players who played', charts.activePlayers], ['New sign-ups', charts.signups], ['Dragon uses', charts.dragon]] as [title, data] (title)}
						{@const vals = data as number[]}
						{@const max = Math.max(1, ...vals)}
						<section class="chart">
							<h3>{title} <small>last 14 days · {vals.reduce((a, b) => a + b, 0)} total</small></h3>
							<div class="bars">
								{#each vals as v, i (i)}
									<div class="bar" title="{charts.days[i]}: {v}">
										<span style:height="{(v / max) * 100}%"></span>
										{#if i % 2 === 1}<em>{charts.days[i].slice(8)}</em>{/if}
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
				<div class="two">
					<section class="card">
						<h2>Games played this week</h2>
						<table>
							<thead><tr><th>Game</th><th>Solo</th><th>Online</th><th>Total</th></tr></thead>
							<tbody>
								{#each variantRows as r (r.name)}<tr><td>{r.name}</td><td>{r.solo}</td><td>{r.online}</td><td><b>{r.total}</b></td></tr>{/each}
								{#if !variantRows.length}<tr><td colspan="4" class="muted">No hands yet this week.</td></tr>{/if}
							</tbody>
						</table>
						<p class="muted">Signed-in players only. Game type is recorded from today on.</p>
					</section>
					<section class="card">
						<h2>Most active this week</h2>
						<table>
							<thead><tr><th>Player</th><th>Hands</th><th>Wins</th></tr></thead>
							<tbody>
								{#each charts.topWeek as r (r.name)}<tr><td>{r.name}</td><td>{r.hands}</td><td>{r.wins}</td></tr>{/each}
								{#if !charts.topWeek.length}<tr><td colspan="3" class="muted">Nobody yet.</td></tr>{/if}
							</tbody>
						</table>
					</section>
				</div>
			{/if}
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
				<a class="btn" href="/api/admin/users.csv" download>Export all (CSV)</a>
			</form>
			<table>
				<thead><tr><th></th><th>Player</th><th>Record</th><th>Joined</th><th>Last seen</th><th>Actions</th></tr></thead>
				<tbody>
					{#each users as u (u.id)}
						<tr class:dim={u.banned}>
							<td><Avatar name={u.name} picture={u.picture} size={28} /></td>
							<td>
								<button class="linky" onclick={() => openUser(u)}><b>{u.name}</b></button>
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

		{#if detail}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="drawer-back" onclick={() => (detail = null)}>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
				<aside class="drawer" onclick={(e) => e.stopPropagation()}>
					<button class="btn sm close" onclick={() => (detail = null)}>Close</button>
					<div class="who">
						<Avatar name={detail.user.name} picture={detail.user.picture} size={56} />
						<div>
							<h2>{detail.user.name}</h2>
							<small>#{detail.user.id} · {detail.user.email ?? detail.user.username ?? ''} · {detail.user.skill ?? 'no skill set'}</small>
						</div>
					</div>
					<div class="stats small">
						<div><b>{detail.user.wins}</b><span>wins</span></div>
						<div><b>{detail.user.wins + detail.user.losses + detail.user.draws}</b><span>hands</span></div>
						<div><b>{detail.friends}</b><span>friends</span></div>
						<div><b>{detail.reports}</b><span>skill reports</span></div>
						<div><b>{detail.sessions}</b><span>signed-in devices</span></div>
						<div><b>{detail.dragon.reduce((a, d) => a + d.week, 0)}</b><span>Dragon uses this week</span></div>
					</div>
					<p class="muted">Joined {when(detail.user.created_at)} · last seen {when(detail.user.last_seen)}</p>
					<h3>By game</h3>
					<table>
						<tbody>
							{#each detail.byVariant as r (r.variant)}<tr><td>{NAMES[r.variant] ?? r.variant}</td><td>{r.hands} hands</td><td>{r.wins} wins</td></tr>{/each}
						</tbody>
					</table>
					<h3>Last 20 hands</h3>
					<table>
						<tbody>
							{#each detail.recent as h, i (i)}<tr><td>{when(h.created_at)}</td><td>{NAMES[h.variant ?? 'unknown'] ?? h.variant}</td><td>{h.source === 'bots' ? 'solo' : 'online'}</td><td>{h.outcome}</td></tr>{/each}
							{#if !detail.recent.length}<tr><td class="muted">No hands yet.</td></tr>{/if}
						</tbody>
					</table>
					<div class="acts">
						<button class="btn sm" onclick={() => (messageUser(detail!.user), (detail = null))}>Message</button>
					</div>
				</aside>
			</div>
		{/if}

		{#if tab === 'bots'}
			<div class="row">
				<p class="muted grow">Real records of the filled seats, from online hands they've played. Shown on their profile cards.</p>
				<button class="btn sm red" onclick={() => resetBot()}>Reset all</button>
			</div>
			<table>
				<thead><tr><th></th><th>Bot</th><th>Hands</th><th>Wins</th><th>Win rate</th><th>First game</th><th></th></tr></thead>
				<tbody>
					{#each bots as b (b.name)}
						<tr>
							<td><Avatar name={b.name} picture={botPicture(b.name)} size={26} /></td>
							<td><b>{b.name}</b></td>
							<td>{b.hands}</td>
							<td>{b.wins}</td>
							<td>{b.hands ? Math.round((b.wins / b.hands) * 100) : 0}%</td>
							<td>{when(b.created_at)}</td>
							<td><button class="btn sm" onclick={() => resetBot(b.name)}>Reset</button></td>
						</tr>
					{/each}
					{#if !bots.length}<tr><td colspan="7" class="muted">No bot has played an online hand yet.</td></tr>{/if}
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
							<td class="acts">
								{#if t.status === 'playing'}<a class="btn sm primary" href="/admin/watch/{t.code}">Watch / take over</a>{/if}
								<button class="btn sm red" onclick={() => closeTable(t)}>Close</button>
							</td>
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
				<h2>Game controls</h2>
				<p class="muted">Changes apply right away, no deploy needed.</p>
				<div class="row">
					<label>Turn clock (seconds)<input type="number" min="10" max="120" bind:value={turnSeconds} /></label>
					<label>Claim window (seconds)<input type="number" min="5" max="60" bind:value={claimSeconds} /></label>
					<label>Dragon uses per player per day<input type="number" min="0" max="1000" bind:value={dragonLimit} /></label>
					<label>Quick match: seats fill
						<select bind:value={fillPace}>
							<option value={0.5}>Very fast</option><option value={1}>Fast (normal)</option><option value={2}>Slower</option><option value={4}>Slow (wait for people)</option>
						</select>
					</label>
				</div>
				<button class="btn primary" onclick={() => saveSettings({ turnSeconds, claimSeconds, dragonLimit, fillPace })}>Save game controls</button>
				<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
					<b>Jade coins + shop:</b>
					<button class="btn" onclick={() => saveSettings({ jade: true })}>Turn on</button>
					<button class="btn" onclick={() => saveSettings({ jade: false })}>Turn off</button>
				</div>
				<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap;align-items:center">
					<b>Lucky Hour (double Jade):</b>
					<button class="btn" onclick={() => saveSettings({ luckyMinutes: 30 })}>Start 30 min</button>
					<button class="btn" onclick={() => saveSettings({ luckyMinutes: 60 })}>Start 1 hour</button>
					<button class="btn" onclick={() => saveSettings({ luckyMinutes: 0 })}>Stop</button>
					<small>Scheduled ones run daily at 00:00 and 18:00 UTC.</small>
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
	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
		margin: 16px 0;
	}
	.chart {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
	}
	.chart h3 {
		margin: 0 0 8px;
		font-size: 0.95rem;
	}
	.chart small {
		color: var(--ink-2);
		font-weight: 400;
	}
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 90px;
		padding-bottom: 14px;
	}
	.bar {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		position: relative;
	}
	.bar span {
		display: block;
		min-height: 2px;
		background: var(--accent, #b5862b);
		border-radius: 3px 3px 0 0;
	}
	.bar em {
		position: absolute;
		bottom: -14px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
		font-style: normal;
		color: var(--ink-2);
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 12px;
	}
	.linky {
		all: unset;
		cursor: pointer;
		text-decoration: underline dotted;
	}
	.drawer-back {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		justify-content: flex-end;
	}
	.drawer {
		width: min(520px, 100%);
		height: 100%;
		overflow: auto;
		background: var(--bg, #f3f1ec);
		padding: 20px;
		box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2);
		position: relative;
	}
	.drawer .close {
		position: absolute;
		top: 14px;
		right: 14px;
	}
	.who {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.who h2 {
		margin: 0;
	}
	.stats.small b {
		font-size: 1.3rem;
	}
	.stats.small {
		grid-template-columns: repeat(3, 1fr);
		margin: 14px 0 6px;
	}
</style>
