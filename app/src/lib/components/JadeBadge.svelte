<script lang="ts">
	import { rewards } from '#lib/rewards.svelte.ts';
	let { mobile = false }: { mobile?: boolean } = $props();
</script>

<a class="jade" class:mobile class:lucky={rewards.lucky?.active} href="/shop" title="Your Jade: spend it in the shop" aria-label="{rewards.jade} Jade. Open the shop">
	<span class="gem" aria-hidden="true"></span>
	<b>{rewards.jade.toLocaleString()}</b>
	{#if rewards.lucky?.active}<span class="x2">2×</span>{/if}
	{#if !rewards.daily.claimed}<span class="dot" title="Daily bonus waiting"></span>{/if}
</a>

<style>
	.jade {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--ink);
		text-decoration: none;
		font-size: 0.88rem;
		white-space: nowrap;
	}
	.jade:hover {
		border-color: #1e7a58;
	}
	.gem {
		width: 12px;
		height: 12px;
		transform: rotate(45deg);
		border-radius: 2px;
		background: linear-gradient(135deg, #5fd3a3, #1e7a58 60%, #0f4d36);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
	}
	.x2 {
		font-size: 0.7rem;
		font-weight: 800;
		padding: 1px 5px;
		border-radius: 6px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.lucky {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.dot {
		position: absolute;
		top: -2px;
		right: -2px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--danger);
		border: 2px solid var(--card);
	}
</style>
