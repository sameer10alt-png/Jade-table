<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import GameTable from '#lib/components/GameTable.svelte';
	import { VARIANTS } from '#lib/engine/game.ts';
	import type { GameState } from '#lib/engine/types.ts';
	import { identity, rememberTable, saveIdentity, TableConnection, type ConnState, type Identity } from '#lib/online/client.ts';
	import type { RoomInfo, ServerMsg } from '#lib/online/protocol.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import FriendRow from '#lib/components/FriendRow.svelte';
	import { addSeatFriend, friendsOverview, inviteFriend, tableFriends, type Friend, type SeatFriend } from '#lib/online/friends.svelte.ts';
	import GameReview, { type GameReviewData } from '#lib/components/GameReview.svelte';
	import { buildReviewData, gameLog, type HandResult, type LoggedMove } from '#lib/review-log.ts';
	import { outcomesOf } from '#lib/ranks.ts';
	import { tag, track } from '#lib/analytics.ts';
	import { tableProfiles } from '#lib/online/quick.ts';
	import type { Profile } from '#lib/online/profile.ts';

	const code = page.params.code!.toUpperCase();
	let autostart = page.url.searchParams.get('start') === '1';
	let me = $state<Identity>({ id: '', name: '' });
	let needName = $state(false);
	let conn: TableConnection | null = null;
	let connState = $state<ConnState>('connecting');
	let refused = $state('');
	let room = $state<RoomInfo | null>(null);
	let game = $state.raw<GameState | null>(null);
	let seat = $state<number | null>(null);
	let error = $state('');
	let copied = $state(false);
	let now = $state(Date.now());
	const clock = setInterval(() => (now = Date.now()), 1000);

	// ---- "Review my play": the server grades your discards; the Dragon explains them ----
	let showReview = $state(false);
	let reviewData = $state<GameReviewData | null>(null);
	let reviewMoves: LoggedMove[] = [];
	let myResults: HandResult[] = [];
	$effect(() => {
		const g = game;
		if (!g?.result || seat === null || (g.phase !== 'ended' && g.phase !== 'gameover')) return;
		if (!myResults.some((r) => r.handNo === g.handNo)) track('hand_finished');
		if (!myResults.some((r) => r.handNo === g.handNo))
			myResults.push({ handNo: g.handNo, outcome: outcomesOf(g.result, g.players.length)[seat], delta: g.result.deltas[seat] ?? 0 });
	});
	async function openReview() {
		try {
			const r = await fetch(`/api/tables/${code}/review?player=${encodeURIComponent(me.id)}`);
			reviewMoves = ((await r.json()) as { moves?: LoggedMove[] }).moves ?? [];
		} catch {
			reviewMoves = [];
		}
		reviewData = buildReviewData(reviewMoves);
		showReview = true;
	}

	onMount(async () => {
		me = identity();
		await loadAccount();
		if (account.enabled && !account.user) return goto('/online'); // online requires a player
		// signed in: the server uses your account name; guests pick a name first
		if (account.user) me.name = account.user.name;
		if (!me.name) needName = true;
		else connect();
	});
	onDestroy(() => {
		conn?.close();
		clearInterval(clock);
	});

	function connect() {
		conn?.close();
		conn = new TableConnection(code, me, onMessage, (s, reason) => {
			connState = s;
			if (s === 'closed') {
				refused = reason || 'The table refused the connection.';
				rememberTable(null);
			}
		});
	}

	let tagged = false;
	function onMessage(m: ServerMsg) {
		if (m.type === 'state') {
			room = m.room;
			game = m.game;
			if (m.game && !tagged) {
				tagged = true;
				tag('mode', m.room.quick ? 'quick' : 'online');
				tag('game', m.game.opts.variant);
				track('online_game_start');
			}
			seat = m.seat;
			if (m.seat !== null) rememberTable(code);
			if (autostart && m.room.status === 'lobby' && m.room.youAreHost) {
				autostart = false;
				conn?.send({ type: 'start' });
				history.replaceState(history.state, '', location.pathname);
			}
			error = '';
		} else if (m.type === 'error') {
			error = m.message;
		}
	}

	function saveName() {
		me.name = me.name.trim().slice(0, 16);
		if (!me.name) return;
		saveIdentity(me);
		needName = false;
		connect();
	}

	const shareUrl = $derived(typeof location === 'undefined' ? '' : `${location.origin}/online/${code}`);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard blocked: the link is visible to copy by hand */
		}
	}

	const host = $derived(room?.seats.find((s) => s?.isHost)?.name ?? 'the host');
	const people = $derived(room?.seats.filter((s) => s && !s.isBot) ?? []);
	const readyCount = $derived(people.filter((s) => s!.ready).length);
	const iAmReady = $derived(!!room?.seats.find((s) => s?.isYou)?.ready);
	// friends you can invite (signed in only); loaded once when the lobby first shows
	let friends = $state<Friend[] | null>(null);
	let invited = $state<Record<string, string>>({});
	const freeSeat = $derived(!!room && room.status === 'lobby' && room.seats.some((s) => !s));
	$effect(() => {
		if (account.user && room?.status === 'lobby' && friends === null) {
			friends = [];
			friendsOverview()
				.then((d) => (friends = [...d.friends].sort((a, b) => Number(b.online || b.atTable) - Number(a.online || a.atTable))))
				.catch(() => (friends = []));
		}
	});
	async function invite(f: Friend) {
		invited[f.code] = 'Sending…';
		try {
			await inviteFriend(f.code, code);
			invited[f.code] = 'Invited';
		} catch (e) {
			invited[f.code] = (e as Error).message;
		}
	}
	// your friendship with each seat (signed in only): refetched when someone sits down or
	// leaves, and once a minute so an accept on the other side shows up
	let seatFriends = $state<SeatFriend[]>([]);
	const seatKey = $derived(room ? room.seats.map((s) => (s && !s.isBot ? s.name : '')).join('|') : '');
	function loadSeatFriends() {
		if (account.user && seat !== null) tableFriends(code).then((f) => (seatFriends = f)).catch(() => {});
	}
	$effect(() => {
		void seatKey;
		void seat;
		if (!account.user) return;
		loadSeatFriends();
		const t = setInterval(loadSeatFriends, 60_000);
		return () => clearInterval(t);
	});
	// everyone's picture and record, refetched when someone sits down or the game starts
	let seatProfiles = $state<(Profile | null)[]>([]);
	const profileKey = $derived(room ? `${room.status}|${room.seats.map((s) => s?.name ?? '').join('|')}` : '');
	$effect(() => {
		if (!profileKey) return;
		tableProfiles(code).then((p) => (seatProfiles = p));
	});
	async function addAtTable(i: number) {
		try {
			const r = await addSeatFriend(code, i);
			seatFriends[i] = r.status === 'friends' ? 'friend' : 'sent';
		} catch (e) {
			error = (e as Error).message;
		}
	}
	const secondsLeft = $derived(room?.deadline ? Math.max(0, Math.ceil((room.deadline - now) / 1000)) : null);
</script>

<svelte:head><title>Table {code} · {APP_NAME}</title></svelte:head>

{#if game && room?.status === 'playing' && seat !== null}
	<GameTable
		{game}
		{seat}
		friends={seatFriends}
		profiles={seatProfiles}
		onAddFriend={addAtTable}
		{error}
		online
		hideBots
		tag={secondsLeft !== null && secondsLeft <= 30 ? `${code} · ${secondsLeft}s` : code}
		onAction={(a) => conn?.send({ type: 'action', action: a, seq: game?.seq })}
		onNext={() => conn?.send({ type: 'ready' })}
		nextLabel={iAmReady ? `Waiting for others (${readyCount}/${people.length})` : 'Next hand'}
		nextDisabled={iAmReady}
		onLeave={() => goto('/')}
		onPlayAgain={room.youAreHost ? () => conn?.send({ type: 'restart' }) : undefined}
	/>
	{#if game.phase === 'ended' || game.phase === 'gameover'}
		<button class="review-fab" onclick={openReview}>Review my play</button>
	{/if}
	{#if showReview && reviewData}
		<GameReview
			data={reviewData}
			log={() => gameLog(VARIANTS[game!.opts.variant]?.name ?? game!.opts.variant, reviewMoves, myResults)}
			onClose={() => (showReview = false)}
		/>
	{/if}
	{#if connState === 'reconnecting'}
		<div class="toast">Connection lost. Reconnecting…</div>
	{/if}
{:else}
	<main class="wrap">
		<a class="back" href="/online">← Online</a>

		{#if needName}
			<section class="card narrow">
				<h1>Join table {code}</h1>
				<label>
					<span>Your name</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={me.name} maxlength="16" placeholder="e.g. Shama" autofocus onkeydown={(e) => e.key === 'Enter' && saveName()} />
				</label>
				<button class="btn primary big" onclick={saveName}>Sit down</button>
			</section>
		{:else if refused}
			<section class="card narrow">
				<h1>Can't join {code}</h1>
				<p>{refused}</p>
				<a class="btn primary" href="/online">Back</a>
			</section>
		{:else if !room}
			<p class="muted">{connState === 'reconnecting' ? 'Reconnecting to the game server…' : 'Connecting…'}</p>
			<p class="muted small">If this takes long, the game server may not be running.</p>
		{:else}
			<p class="kicker">{VARIANTS[room.settings.variant].name} · {room.settings.rounds === 1 ? 'East round' : `${room.settings.rounds} rounds`} · {room.settings.botLevel} bots</p>
			<h1>Table <span class="code">{code}</span></h1>

			<div class="share">
				<span class="link">{shareUrl}</span>
				<button class="btn" onclick={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
			</div>

			<section class="card">
				<h2>Seats</h2>
				<ol class="seats">
					{#each room.seats as s, i (i)}
						<li class:you={s?.isYou}>
							<span class="num">{i + 1}</span>
							{#if s}
								<span class="who">{s.name}{s.isYou ? ' (you)' : ''}</span>
								{#if s.isHost}<span class="pill">Host</span>{/if}
								{#if seatFriends[i] === 'friend'}
									<span class="fr ok">Friend ✓</span>
								{:else if seatFriends[i] === 'sent'}
									<span class="fr">Requested</span>
								{:else if seatFriends[i]}
									<button class="fr add" onclick={() => addAtTable(i)}>{seatFriends[i] === 'incoming' ? 'Accept friend' : 'Add friend'}</button>
								{/if}
								<span class="dot" class:on={s.connected} title={s.connected ? 'Connected' : 'Away'}></span>
							{:else}
								<span class="empty">Empty · a bot will take this seat</span>
							{/if}
						</li>
					{/each}
				</ol>
				{#if room.quick}
					<p class="muted">Quick match: the game starts as soon as everyone has arrived (at most 15 seconds).</p>
				{:else if room.youAreHost}
					<button class="btn primary big" onclick={() => conn?.send({ type: 'start' })}>
						Start game {people.length < 4 ? `(${4 - people.length} bot${4 - people.length === 1 ? '' : 's'})` : ''}
					</button>
					<p class="muted small">Share the code or link. Start whenever you're ready; bots fill the empty seats.</p>
				{:else}
					<p class="muted">Waiting for {host} to start the game…</p>
				{/if}
				{#if error}<p class="err">{error}</p>{/if}
			</section>

			{#if account.user && freeSeat && friends && !room.quick}
				<section class="card friends">
					<h2>Invite friends</h2>
					{#if friends.length}
						<ul class="flist">
							{#each friends as f (f.code)}
								<FriendRow friend={f}>
									{#if invited[f.code]}
										<span class="muted small">{invited[f.code]}</span>
									{:else}
										<button class="btn small" onclick={() => invite(f)}>Invite</button>
									{/if}
								</FriendRow>
							{/each}
						</ul>
						<p class="muted small">They'll see the invitation on {APP_NAME} for the next 24 hours.</p>
					{:else}
						<p class="muted small">No friends yet. <a href="/friends">Add some</a> with your code or link.</p>
					{/if}
				</section>
			{/if}
		{/if}
	</main>
{/if}

<style>
	.review-fab {
		position: fixed;
		left: 50%;
		bottom: 18px;
		transform: translateX(-50%);
		z-index: 55;
		font: 600 0.95rem var(--font);
		color: var(--accent-ink);
		background: var(--accent);
		border: none;
		border-radius: 999px;
		padding: 11px 20px;
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}
	.back {
		display: inline-block;
		margin: 24px 0 12px;
		color: var(--ink-2);
		text-decoration: none;
	}
	h1 {
		margin: 6px 0 16px;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
	}
	.code {
		font-family: var(--font);
		font-weight: 800;
		letter-spacing: 0.15em;
		color: var(--t-red);
	}
	.share {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.link {
		padding: 10px 14px;
		border-radius: 10px;
		background: var(--bg-2);
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 620px;
	}
	.friends {
		margin-top: 16px;
	}
	.fr {
		flex: none;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--ink-2);
	}
	.fr.ok {
		color: var(--good);
	}
	.fr.add {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		font: 700 0.75rem var(--font);
		cursor: pointer;
	}
	.flist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.btn.small {
		padding: 6px 12px;
		font-size: 0.85rem;
	}
	.card.narrow {
		max-width: 420px;
	}
	.card h1,
	.card h2 {
		margin: 0;
	}
	.seats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.seats li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--bg-2);
	}
	.seats li.you {
		outline: 2px solid var(--accent);
	}
	.num {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--felt);
		color: var(--felt-ink);
		font-weight: 800;
		font-size: 0.8rem;
	}
	.who {
		font-weight: 700;
		flex: 1;
	}
	.empty {
		color: var(--ink-2);
		flex: 1;
	}
	.pill {
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--line);
	}
	.dot.on {
		background: var(--good);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	input {
		font: 500 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	.big {
		padding: 14px;
		font-size: 1.05rem;
	}
	.muted {
		color: var(--ink-2);
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.err {
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
		margin: 0;
	}
	.toast {
		position: fixed;
		left: 50%;
		top: 70px;
		transform: translateX(-50%);
		padding: 10px 16px;
		border-radius: 999px;
		background: var(--danger);
		color: white;
		font-weight: 700;
		z-index: 50;
	}
</style>
