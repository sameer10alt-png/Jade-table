<script lang="ts">
	import type { Player } from '#lib/engine/types.ts';
	import { WIND_SHORT, type Tile as T } from '#lib/engine/tiles.ts';
	import Pond from './Pond.svelte';
	import Tile from './Tile.svelte';

	let {
		players,
		winds,
		order,
		lastId,
		emblem,
		status,
		myTurn,
		dora = [],
		mode = $bindable('order'),
		fit = $bindable(false)
	}: {
		players: Player[];
		/** seat wind for each seat */
		winds: number[];
		/** seats in display order for the "by player" view */
		order: number[];
		lastId: number | null;
		emblem: string;
		status: string;
		myTurn: boolean;
		dora?: T[];
		mode?: 'order' | 'player';
		fit?: boolean;
	} = $props();

	// Keep the newest discard in view as the pile fills (scroll mode only). (Sameer)
	let bodyEl = $state<HTMLDivElement>();
	$effect(() => {
		all.length; // track
		if (bodyEl && !fit) bodyEl.scrollTop = bodyEl.scrollHeight;
	});

	// every discard on the table, in the order it was played
	const all = $derived(
		players
			.flatMap((p, seat) => p.discards.map((d, i) => ({ ...d, seat, key: d.n ?? i * 4 + seat })))
			.sort((a, b) => a.key - b.key)
	);
</script>

<section class="discards" class:fit>
	<header>
		<span class="title">◆ Discards · {all.length} {all.length === 1 ? 'tile' : 'tiles'}</span>
		{#if dora.length}
			<span class="dora">Dora {#each dora as d (d.id)}<Tile tile={d} size="xs" />{/each}</span>
		{/if}
	</header>

	<div class="body" bind:this={bodyEl}>
		<div class="emblem" aria-hidden="true">
			<span class="char">{emblem}</span>
			<span class="status" class:mine={myTurn}>{status}</span>
		</div>

		{#if mode === 'order'}
			<div class="flow">
				{#each all as d (d.tile.id)}
					<span class="d" class:riichi={d.riichi}>
						<Tile tile={d.tile} size={fit ? 'sm' : 'lg'} dim={d.taken} glow={d.tile.id === lastId} />
						<small>{WIND_SHORT[winds[d.seat]]}</small>
					</span>
				{/each}
			</div>
		{:else}
			<div class="ponds">
				{#each order as seat (seat)}
					<Pond discards={players[seat].discards} label="{WIND_SHORT[winds[seat]]} · {players[seat].name}" {lastId} />
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.discards {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		border-radius: 14px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.14);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 8px 10px;
	}
	.title {
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.dora {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--felt-ink-2);
	}
	.body {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 10px 10px;
	}
	.fit .body {
		overflow: hidden;
	}
	.emblem {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		pointer-events: none;
	}
	.char {
		display: grid;
		place-items: center;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		border: 6px solid rgba(255, 255, 255, 0.05);
		font-family: 'Noto Serif SC', serif;
		font-size: 4.2rem;
		color: rgba(255, 255, 255, 0.07);
	}
	.status {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--felt-ink-2);
		opacity: 0.8;
	}
	.status.mine {
		color: var(--accent);
		opacity: 1;
	}
	.flow {
		/* discard size: phone default, the table page raises it on wide screens */
		--tile-lg: var(--dt, var(--tile-md));
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 3px;
		align-content: flex-start;
	}
	.d {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
	}
	.d small {
		font-size: 0.55rem;
		font-weight: 800;
		color: var(--felt-ink-2);
		line-height: 1;
		margin-top: -2px;
	}
	.d.riichi :global(.tile) {
		box-shadow: 0 0 0 2px var(--t-red);
	}
	.ponds {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
