<script lang="ts">
	import Avatar from './Avatar.svelte';

	// Top 3 players by wins (every counted game), this week or all time.
	type Row = { name: string; picture: string | null; wins: number; hands: number };
	let period = $state<'week' | 'all'>('week');
	let rows = $state<Row[] | null>(null);
	let failed = $state(false);

	function load(p: 'week' | 'all', quiet = false) {
		if (!quiet) {
			rows = null;
			failed = false;
		}
		fetch(`/api/leaderboard?period=${p}`, { cache: 'no-store' })
			.then((r) => r.json())
			.then((d: { players: Row[] }) => {
				if (p === period) rows = d.players ?? [];
			})
			.catch(() => {
				if (!quiet) failed = true;
			});
	}
	$effect(() => load(period));
	// stay fresh: re-check every 30s and whenever the tab comes back into view
	$effect(() => {
		const tick = () => document.visibilityState === 'visible' && load(period, true);
		const t = setInterval(tick, 30_000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(t);
			document.removeEventListener('visibilitychange', tick);
		};
	});
	const MEDAL = ['🥇', '🥈', '🥉'];
</script>

<section class="board" aria-labelledby="board-title">
	<header>
		<h2 id="board-title">Top 3 players</h2>
		<div class="tabs" role="tablist">
			<button role="tab" aria-selected={period === 'week'} class:on={period === 'week'} onclick={() => (period = 'week')}>This week</button>
			<button role="tab" aria-selected={period === 'all'} class:on={period === 'all'} onclick={() => (period = 'all')}>All time</button>
		</div>
	</header>
	<p class="sub">Most wins, online and against bots.</p>
	{#if failed}
		<p class="empty">Couldn't load the leaderboard. Try again in a moment.</p>
	{:else if rows === null}
		<p class="empty">Loading…</p>
	{:else if rows.length === 0}
		<p class="empty">No wins yet {period === 'week' ? 'this week' : ''}. <a href="/quick">Play a game</a> and take the top spot.</p>
	{:else}
		<ol>
			{#each rows as r, i (r.name + i)}
				<li class:top={i < 3}>
					<span class="pos">{MEDAL[i] ?? i + 1}</span>
					<Avatar name={r.name} picture={r.picture} size={30} />
					<span class="name">{r.name}</span>
					<span class="wins"><b>{r.wins}</b> {r.wins === 1 ? 'win' : 'wins'}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.board {
		margin: 28px 0;
		padding: 20px 22px;
		border-radius: 16px;
		background: var(--card, #fff);
		border: 1px solid var(--line, #e3ded5);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.sub {
		margin: 4px 0 12px;
		color: var(--ink-2, #666);
		font-size: 0.9rem;
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 999px;
		background: var(--bg-2, #efebe4);
	}
	.tabs button {
		border: 0;
		background: none;
		padding: 6px 14px;
		border-radius: 999px;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		color: var(--ink-2, #666);
	}
	.tabs button.on {
		background: var(--card, #fff);
		color: var(--ink, #222);
		font-weight: 700;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 4px;
		border-top: 1px solid var(--line, #eee);
	}
	li:first-child {
		border-top: 0;
	}
	.pos {
		width: 28px;
		text-align: center;
		font-weight: 700;
		color: var(--ink-2, #666);
	}
	li.top .pos {
		font-size: 1.2rem;
	}
	.name {
		flex: 1;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wins {
		color: var(--ink-2, #666);
		font-size: 0.9rem;
	}
	.wins b {
		color: var(--ink, #222);
		font-size: 1rem;
	}
	.empty {
		color: var(--ink-2, #666);
	}
</style>
