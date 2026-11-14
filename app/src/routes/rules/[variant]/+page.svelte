<script lang="ts">
	import { APP_NAME } from '#lib/brand.ts';
	import Tile from '#lib/components/Tile.svelte';
	import { VARIANTS } from '#lib/engine/game.ts';
	import { kindName } from '#lib/engine/tiles.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const v = $derived(VARIANTS[data.variant]);

	const groups = $derived([
		{ name: 'Characters', kinds: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'c' + n) },
		{ name: 'Circles', kinds: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'p' + n) },
		{ name: 'Bamboo', kinds: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'b' + n) },
		{ name: 'Winds', kinds: ['we', 'ws', 'ww', 'wn'] },
		{ name: 'Dragons', kinds: ['dr', 'dg', 'dw'] },
		...(v.wall.flowers ? [{ name: 'Flowers and seasons', kinds: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] }] : []),
		...(v.wall.jokers ? [{ name: 'Jokers', kinds: ['jk'] }] : [])
	]);
</script>

<svelte:head><title>{v.name} rules · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<nav class="tabs">
		{#each Object.values(VARIANTS) as x (x.id)}
			<a href="/rules/{x.id}" class:on={x.id === v.id}>{x.name}</a>
		{/each}
	</nav>

	<p class="kicker">Rule book</p>
	<h1>{v.name}</h1>
	<p class="lede">{v.tagline}</p>

	<section>
		<h2>How it plays</h2>
		<ol>
			{#each v.rulesSummary as line}
				<li>{line}</li>
			{/each}
		</ol>
	</section>

	<section>
		<h2>Scoring</h2>
		<table>
			<tbody>
				{#each v.scoringTable as row}
					<tr><td>{row.name}</td><td class="val">{row.value}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2>The tiles</h2>
		{#each groups as g (g.name)}
			<h3>{g.name}</h3>
			<div class="row">
				{#each g.kinds as k, i (k)}
					<figure>
						<Tile tile={{ id: i, k }} size="lg" />
						<figcaption>{kindName(k)}</figcaption>
					</figure>
				{/each}
			</div>
		{/each}
	</section>

	<a class="btn primary" href="/play/{v.id}">Play {v.name}</a>
</main>

<style>
	.tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin: 24px 0;
	}
	.tabs a {
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid var(--line);
		text-decoration: none;
		font-weight: 600;
	}
	.tabs a.on {
		background: var(--felt);
		color: var(--felt-ink);
		border-color: var(--felt);
	}
	h1 {
		margin: 6px 0;
		font-size: clamp(2rem, 5vw, 3rem);
	}
	.lede {
		color: var(--ink-2);
		margin-top: 0;
	}
	section {
		margin: 36px 0;
	}
	ol {
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 760px;
	}
	table {
		width: 100%;
		max-width: 760px;
		border-collapse: collapse;
		background: var(--card);
		border-radius: 12px;
		overflow: hidden;
	}
	td {
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
	}
	.val {
		text-align: right;
		font-weight: 700;
		white-space: nowrap;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 72px;
	}
	figcaption {
		font-size: 0.72rem;
		color: var(--ink-2);
		text-align: center;
	}
</style>
