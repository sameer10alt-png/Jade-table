<script lang="ts">
	// One die face (1-6). A new value replays the tumble animation.
	let { value, size = 34 }: { value: number | null; size?: number } = $props();

	const PIPS: Record<number, [number, number][]> = {
		1: [[50, 50]],
		2: [[28, 28], [72, 72]],
		3: [[26, 26], [50, 50], [74, 74]],
		4: [[28, 28], [72, 28], [28, 72], [72, 72]],
		5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
		6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]]
	};
</script>

{#key value}
	<svg class="die" class:blank={value === null} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={value === null ? 'Not rolled yet' : `Die showing ${value}`}>
		<rect x="4" y="4" width="92" height="92" rx="20" class="body" />
		{#if value !== null}
			{#each PIPS[value] as [x, y], i (i)}
				<circle cx={x} cy={y} r={value === 1 ? 13 : 9.5} class:red={value === 1 || value === 4} />
			{/each}
		{:else}
			<text x="50" y="64" text-anchor="middle" font-size="44" font-weight="800">?</text>
		{/if}
	</svg>
{/key}

<style>
	.die {
		display: inline-block;
		flex: none;
		animation: tumble 520ms cubic-bezier(0.2, 0.8, 0.3, 1.2);
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.25));
	}
	.blank {
		animation: none;
		opacity: 0.55;
	}
	.body {
		fill: #fffdf6;
		stroke: #d8cfb8;
		stroke-width: 3;
	}
	circle {
		fill: var(--t-ink);
	}
	circle.red {
		fill: var(--t-red);
	}
	text {
		fill: var(--t-ink);
		font-family: var(--font);
	}
	@keyframes tumble {
		0% {
			transform: rotate(-200deg) scale(0.4);
			opacity: 0;
		}
		70% {
			transform: rotate(12deg) scale(1.08);
			opacity: 1;
		}
		100% {
			transform: rotate(0) scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.die {
			animation: none;
		}
	}
</style>
