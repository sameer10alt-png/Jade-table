<script lang="ts">
	import { kindName, type Tile } from '#lib/engine/tiles.ts';
	import TileFace from './TileFace.svelte';

	let {
		tile = null,
		size = 'md',
		selected = false,
		dim = false,
		glow = false,
		hint = false,
		sideways = false,
		disabled = false,
		fresh = false,
		onclick
	}: {
		tile?: Tile | null;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		selected?: boolean;
		dim?: boolean;
		glow?: boolean;
		hint?: boolean;
		sideways?: boolean;
		disabled?: boolean;
		/** the tile just drawn this turn */
		fresh?: boolean;
		onclick?: () => void;
	} = $props();

	const label = $derived(tile ? kindName(tile.k) + (tile.red ? ' (red)' : '') : 'Hidden tile');
</script>

{#if onclick}
	<button
		type="button"
		class="tile {size}"
		class:selected
		class:dim
		class:glow
		class:hint
		class:sideways
		class:fresh
		class:back={!tile}
		{disabled}
		aria-label={label}
		title={label}
		{onclick}
	>
		{#if tile}<TileFace k={tile.k} red={tile.red} />{/if}
	</button>
{:else}
	<span class="tile {size}" class:dim class:glow class:sideways class:back={!tile} role="img" aria-label={label} title={label}>
		{#if tile}<TileFace k={tile.k} red={tile.red} />{/if}
	</span>
{/if}

<style>
	.tile {
		--w: var(--tile-md);
		display: inline-block;
		flex: none;
		width: var(--w);
		height: calc(var(--w) * 1.333);
		padding: calc(var(--w) * 0.025);
		box-sizing: border-box;
		border: none;
		border-radius: calc(var(--w) * 0.14);
		background: linear-gradient(180deg, var(--t-face) 0%, var(--t-face-2) 100%);
		box-shadow:
			inset 0 -1px 0 rgba(0, 0, 0, 0.06),
			0 calc(var(--w) * 0.07) 0 var(--t-edge),
			0 calc(var(--w) * 0.07 + 1px) 2px rgba(0, 0, 0, 0.35);
		margin-bottom: calc(var(--w) * 0.07);
		position: relative;
		transition:
			transform 120ms ease,
			box-shadow 120ms ease,
			opacity 120ms;
		font: inherit;
		color: inherit;
		cursor: default;
		vertical-align: bottom;
	}
	.xs {
		--w: var(--tile-xs);
	}
	.sm {
		--w: var(--tile-sm);
	}
	.lg {
		--w: var(--tile-lg);
	}
	button.tile {
		cursor: pointer;
	}
	button.tile:hover:not(:disabled) {
		transform: translateY(-3px);
	}
	button.tile:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	.selected {
		transform: translateY(-10px) !important;
		box-shadow:
			0 0 0 2px var(--accent),
			0 calc(var(--w) * 0.07) 0 var(--t-edge),
			0 8px 14px rgba(0, 0, 0, 0.35);
	}
	.hint::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -9px;
		width: 6px;
		height: 6px;
		margin-left: -3px;
		border-radius: 50%;
		background: var(--accent);
	}
	.glow {
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 14px var(--accent),
			0 calc(var(--w) * 0.07) 0 var(--t-edge);
	}
	/* The tile just drawn this turn: lifted, ringed, and labelled so it's unmistakable. (Sameer) */
	.fresh {
		transform: translateY(-12px);
		box-shadow:
			0 0 0 3px var(--accent),
			0 0 18px var(--accent),
			0 10px 16px rgba(0, 0, 0, 0.45);
		z-index: 4;
	}
	.fresh::before {
		content: 'NEW';
		position: absolute;
		top: -17px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--accent);
		color: var(--accent-ink);
		white-space: nowrap;
	}
	button.tile.fresh:hover:not(:disabled) {
		transform: translateY(-15px);
	}
	.dim {
		opacity: 0.45;
	}
	button.tile:disabled {
		cursor: not-allowed;
	}
	.sideways {
		transform: rotate(-90deg);
		margin: 0 calc(var(--w) * 0.17);
	}
	.back {
		background: linear-gradient(160deg, var(--t-back) 0%, var(--t-back-2) 100%);
		box-shadow:
			inset 0 0 0 calc(var(--w) * 0.06) rgba(255, 255, 255, 0.12),
			0 calc(var(--w) * 0.07) 0 var(--t-edge),
			0 calc(var(--w) * 0.07 + 1px) 2px rgba(0, 0, 0, 0.35);
	}
</style>
