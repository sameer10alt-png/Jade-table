<script lang="ts">
	import type { SeatFriend } from '#lib/online/friends.svelte.ts';

	// A tiny marker beside a player's name at the table: tap to add them, or see that
	// you're already friends (or that your request is waiting).
	let { state, onAdd }: { state: SeatFriend; onAdd?: () => void } = $props();
	const TITLE = { none: 'Add friend', incoming: 'Wants to be your friend: tap to accept', sent: 'Friend request sent', friend: 'Friend' };
</script>

{#if state}
	{#if (state === 'none' || state === 'incoming') && onAdd}
		<button
			class="fi add"
			class:incoming={state === 'incoming'}
			title={TITLE[state]}
			aria-label={TITLE[state]}
			onclick={(e) => {
				e.stopPropagation();
				onAdd();
			}}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><path d="M19 8v6M16 11h6" /></svg>
		</button>
	{:else if state === 'sent'}
		<span class="fi sent" title={TITLE.sent} aria-label={TITLE.sent}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><circle cx="19" cy="11" r="3.5" /><path d="M19 9.5V11l1 1" /></svg>
		</span>
	{:else if state === 'friend'}
		<span class="fi friend" title={TITLE.friend} aria-label={TITLE.friend}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><path d="M16 11l2 2 4-4" /></svg>
		</span>
	{/if}
{/if}

<style>
	.fi {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 22px;
		height: 22px;
		padding: 0;
		border-radius: 50%;
		border: 0;
		vertical-align: middle;
	}
	svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* add: an empty outlined button, so it reads as "tap me" */
	.add {
		background: transparent;
		border: 1.5px solid rgba(255, 255, 255, 0.55);
		color: #fff;
		cursor: pointer;
	}
	.add:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	/* they asked you: solid gold, the one that wants attention */
	.add.incoming {
		background: var(--accent);
		border-color: var(--accent);
		color: #1d1a12;
	}
	/* waiting: dashed and faded */
	.sent {
		border: 1.5px dashed rgba(255, 255, 255, 0.45);
		color: rgba(255, 255, 255, 0.6);
	}
	/* friends: a solid ivory badge (like a tile face) with a green tick, clearly not a button */
	.friend {
		background: var(--t-face);
		color: var(--good);
		box-shadow: 0 1px 0 var(--t-edge);
	}
	.friend svg {
		stroke-width: 2.6;
	}
</style>
