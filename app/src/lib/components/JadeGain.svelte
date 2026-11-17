<script lang="ts">
	// "+25 Jade" pop-up after a hand (also on the game table)
	import { rewards } from '#lib/rewards.svelte.ts';
	let show = $state<{ n: number; lucky: boolean } | null>(null);
	let t: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const g = rewards.gain;
		if (!g || Date.now() - g.at > 5000) return;
		show = { n: g.n, lucky: g.lucky };
		clearTimeout(t);
		t = setTimeout(() => (show = null), 2800);
	});
</script>

{#if show}
	<a class="gain" href="/shop" aria-live="polite">
		<span class="gem" aria-hidden="true"></span>+{show.n} Jade{#if show.lucky}<span class="x2">Lucky 2×</span>{/if}
	</a>
{/if}

<style>
	.gain {
		position: fixed;
		left: 50%;
		bottom: 22px;
		transform: translateX(-50%);
		z-index: 60;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 16px;
		border-radius: 999px;
		background: #123d2d;
		color: #eafff4;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		animation: pop 2.8s ease forwards;
	}
	.gem {
		width: 12px;
		height: 12px;
		transform: rotate(45deg);
		border-radius: 2px;
		background: linear-gradient(135deg, #5fd3a3, #1e7a58 60%, #0f4d36);
	}
	.x2 {
		font-size: 0.72rem;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	@keyframes pop {
		0% {
			opacity: 0;
			transform: translate(-50%, 12px) scale(0.9);
		}
		10%,
		80% {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -8px);
		}
	}
</style>
