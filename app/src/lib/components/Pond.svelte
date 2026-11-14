<script lang="ts">
	import type { DiscardEntry } from '#lib/engine/types.ts';
	import Tile from './Tile.svelte';

	let { discards, label, lastId = null }: { discards: DiscardEntry[]; label: string; lastId?: number | null } = $props();
</script>

<div class="pond" aria-label="{label}'s discards">
	<span class="who">{label}</span>
	{#each discards as d (d.tile.id)}
		<span class="d" class:riichi={d.riichi}>
			<Tile tile={d.tile} size="xs" dim={d.taken} glow={d.tile.id === lastId} />
		</span>
	{/each}
</div>

<style>
	.pond {
		display: flex;
		flex-wrap: wrap;
		gap: 1px;
		align-content: flex-start;
		min-height: calc(var(--tile-xs) * 1.4);
	}
	.who {
		flex-basis: 100%;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--felt-ink-2);
		opacity: 0.7;
	}
	.riichi {
		transform: rotate(-90deg);
		margin: 0 3px;
	}
</style>
