<script lang="ts">
	import type { Meld } from '#lib/engine/types.ts';
	import type { Tile as T } from '#lib/engine/tiles.ts';
	import Tile from './Tile.svelte';

	let { melds, flowers = [], size = 'sm' }: { melds: Meld[]; flowers?: T[]; size?: 'xs' | 'sm' | 'md' } = $props();
</script>

{#if melds.length || flowers.length}
	<div class="melds">
		{#each melds as m, mi (mi)}
			<span class="meld" title={m.concealed ? 'Concealed gong' : m.type}>
				{#each m.tiles as t, i (t.id)}
					{#if m.concealed && m.type === 'kong' && (i === 0 || i === 3)}
						<Tile tile={null} {size} />
					{:else}
						<Tile tile={t} {size} glow={t.id === m.claimed} />
					{/if}
				{/each}
			</span>
		{/each}
		{#if flowers.length}
			<span class="meld flowers">
				{#each flowers as t (t.id)}
					<Tile tile={t} size="xs" />
				{/each}
			</span>
		{/if}
	</div>
{/if}

<style>
	.melds {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: flex-end;
	}
	.meld {
		display: inline-flex;
		gap: 1px;
	}
	.flowers {
		gap: 2px;
		opacity: 0.95;
	}
</style>
