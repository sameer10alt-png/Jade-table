<script lang="ts">
	// Small pop-up after each rated hand: "+12 points · 1,034 · Character".
	import { onMount } from 'svelte';
	import { rankFor } from '#lib/ranks.ts';

	let { delta, rating, rank, onDone }: { delta: number; rating: number; rank: string; onDone: () => void } = $props();
	const color = $derived(rankFor(rating).color);

	onMount(() => {
		const t = setTimeout(onDone, 4500);
		return () => clearTimeout(t);
	});
</script>

<a class="toast" href="/progress" class:up={delta > 0} class:down={delta < 0}>
	<span class="d">{delta > 0 ? '+' : ''}{delta}</span>
	<span class="r">{rating.toLocaleString()} pts</span>
	<span class="rank" style:background={color}>{rank}</span>
</a>

<style>
	.toast {
		position: fixed;
		top: 14px;
		right: 14px;
		z-index: 80;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 14px;
		border-radius: 14px;
		background: var(--card);
		color: var(--ink);
		border: 1px solid var(--line);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
		text-decoration: none;
		font: 600 0.9rem var(--font);
		animation: pop 0.35s ease-out;
	}
	.d {
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}
	.up .d {
		color: var(--good);
	}
	.down .d {
		color: var(--danger);
	}
	.r {
		color: var(--ink-2);
	}
	.rank {
		color: #10131a;
		padding: 2px 8px;
		border-radius: 99px;
		font-size: 0.75rem;
	}
	@keyframes pop {
		from {
			transform: translateY(-12px);
			opacity: 0;
		}
	}
</style>
