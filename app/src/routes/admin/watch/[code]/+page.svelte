<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Tile from '#lib/components/Tile.svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import { serverUrl } from '#lib/online/client.ts';
	import { sortTiles } from '#lib/engine/tiles.ts';
	import type { GameState } from '#lib/engine/types.ts';
	import type { RoomInfo } from '#lib/online/protocol.ts';
	import { APP_NAME } from '#lib/brand.ts';

	// God mode: watch a live table with every hand showing, take over a bot, or end the hand.
	const code = page.params.code!;
	let game = $state<GameState | null>(null);
	let room = $state<RoomInfo | null>(null);
	let status = $state('Connecting…');
	let err = $state('');
	let note = $state('');
	let points = $state(1000);
	let ws: WebSocket | null = null;

	function connect() {
		const url = `${serverUrl().replace(/^http/, 'ws')}/ws/table/${code}?watch=1`;
		ws = new WebSocket(url);
		ws.onopen = () => (status = 'Watching live');
		ws.onmessage = (e) => {
			const m = JSON.parse(e.data);
			if (m.type === 'state') {
				game = m.game;
				room = m.room;
			} else if (m.type === 'error') status = m.message;
		};
		ws.onclose = (e) => {
			status = e.reason || 'Disconnected';
		};
	}
	onMount(async () => {
		await loadAccount();
		if (account.user?.isAdmin) connect();
	});
	onDestroy(() => ws?.close());

	async function post(path: string, body: unknown) {
		err = '';
		const r = await fetch(`/api/admin/tables/${code}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const d = await r.json().catch(() => ({}));
		if (!r.ok) err = d.error ?? 'Failed';
		return r.ok;
	}
	async function take(seat: number) {
		if (!confirm(`Take over ${game?.players[seat].name}'s seat? You'll play the rest of the game from there.`)) return;
		if (await post('take', { seat })) goto(`/online/${code}`);
	}
	async function win(seat: number) {
		if (!confirm(`End this hand with ${game?.players[seat].name} winning ${points}?`)) return;
		if (await post('win', { seat, points })) {
			note = 'Hand ended.';
			setTimeout(() => (note = ''), 3000);
		}
	}
	const WIND = ['East', 'South', 'West', 'North'];
	const people = $derived(room ? room.seats.filter((s) => s && !s.isBot).length : 0);
</script>

<svelte:head><title>Watch {code} · {APP_NAME}</title></svelte:head>

<main class="wrap watch">
	{#if !account.user?.isAdmin}
		<h1>Not here</h1>
		<p>This page is for admins.</p>
	{:else}
		<p class="kicker">God mode · table {code}</p>
		<h1>Watching {code}</h1>
		<p class="muted">
			{status}
			{#if game} · {game.opts.variant} · hand {game.handNo} · {game.phase}{game.phase === 'turn' ? ` · ${game.players[game.turn].name} to play` : ''} · {game.wall.length} tiles left{/if}
		</p>
		{#if err}<p class="err">{err}</p>{/if}
		{#if note}<p class="ok">{note}</p>{/if}

		{#if game}
			<div class="controls">
				<label>Instant win points <input type="number" min="1" bind:value={points} /></label>
				<span class="muted">
					{people > 0
						? 'Instant win is off: real people are playing here. It only works when everyone else is a bot.'
						: 'Instant win is a test power. Hands it touches don’t count toward anyone’s record or the leaderboard.'}
				</span>
			</div>
			<div class="seats">
				{#each game.players as p, i (i)}
					{@const isPerson = !!room?.seats[i] && !room.seats[i]!.isBot}
					<section class="seat" class:turn={game.phase === 'turn' && game.turn === i}>
						<header>
							<b>{p.name}</b>
							<span class="tag">{isPerson ? 'person' : `bot · ${p.bot ?? ''}`}</span>
							<span class="muted">{WIND[(i - game.dealer + 4) % 4]}{i === game.dealer ? ' · dealer' : ''} · {p.score}</span>
						</header>
						<div class="tiles">
							{#each sortTiles(p.hand) as t (t.id)}<Tile tile={t} size="sm" />{/each}
							{#if game.drawn && game.turn === i}<span class="gap"></span><Tile tile={game.drawn} size="sm" glow />{/if}
						</div>
						{#if p.melds.length}
							<div class="tiles melds">
								{#each p.melds as m, j (j)}<span class="meld">{#each m.tiles as t (t.id)}<Tile tile={t} size="xs" />{/each}</span>{/each}
							</div>
						{/if}
						<div class="tiles discards">
							{#each p.discards as d, j (j)}<Tile tile={d.tile} size="xs" dim={d.taken} />{/each}
						</div>
						<div class="acts">
							{#if !isPerson && game.phase !== 'gameover'}<button class="btn sm" onclick={() => take(i)}>Take this seat</button>{/if}
							{#if people === 0 && game.phase !== 'ended' && game.phase !== 'gameover'}<button class="btn sm primary" onclick={() => win(i)}>Instant win</button>{/if}
						</div>
					</section>
				{/each}
			</div>
			{#if game.result}
				<p class="muted">Last hand: {game.result.type === 'win' ? game.result.wins.map((w) => `${game!.players[w.seat].name} — ${w.summary}`).join(', ') : 'drawn'}</p>
			{/if}
		{/if}
		<p><a href="/admin">← Back to admin</a></p>
	{/if}
</main>

<style>
	.watch {
		padding-top: 24px;
		padding-bottom: 60px;
	}
	.muted {
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin: 12px 0;
	}
	.controls input {
		width: 100px;
		margin-left: 6px;
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		font: inherit;
	}
	.seats {
		display: grid;
		gap: 12px;
	}
	.seat {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
	}
	.seat.turn {
		border-color: var(--accent, #b5862b);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #b5862b) 35%, transparent);
	}
	header {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.tag {
		font-size: 0.7rem;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--line);
	}
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin-top: 8px;
		align-items: flex-end;
	}
	.gap {
		width: 10px;
	}
	.meld {
		display: inline-flex;
		gap: 1px;
		margin-right: 8px;
	}
	.discards {
		opacity: 0.85;
	}
	.acts {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}
	.btn.sm {
		padding: 4px 10px;
		font-size: 0.8rem;
	}
	.err {
		color: #b5452b;
	}
	.ok {
		color: #2f6f4e;
	}
</style>
