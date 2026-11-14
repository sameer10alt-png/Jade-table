<script lang="ts">
	// Shown in the middle of the table while players roll for seats, and while the dealer
	// is about to break the wall.
	import type { GameState } from '#lib/engine/types.ts';
	import Dice from './Dice.svelte';

	let { game, me }: { game: GameState; me: number } = $props();

	const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);
	const st = $derived(game.seating);
	// latest roll per seat (a tied player's earlier roll is replaced when they roll again)
	const latest = $derived.by(() => {
		const out: (number[] | null)[] = [null, null, null, null];
		for (const h of st?.history ?? []) out[h.seat] = h.dice;
		return out;
	});
	const best = $derived(
		st ? Math.max(0, ...st.contenders.filter((c) => st.rolls[c]).map((c) => sum(st.rolls[c]!))) : 0
	);
	const name = (i: number) => (i === me && game.players[i].name !== 'You' ? `${game.players[i].name} (you)` : game.players[i].name);
</script>

<section class="panel">
	{#if game.phase === 'seating' && st}
		<p class="kicker">Roll for seats{st.round > 1 ? ` · tie-break ${st.round - 1}` : ''}</p>
		<h3>The highest total sits East and deals first</h3>
		<ol class="rolls">
			{#each [0, 1, 2, 3] as i (i)}
				{@const d = st.contenders.includes(i) ? st.rolls[i] : latest[i]}
				{@const out = !st.contenders.includes(i)}
				<li class:you={i === me} class:out class:lead={!out && !!d && sum(d) === best && best > 0}>
					<span class="who">{name(i)}</span>
					<span class="dice">
						{#if d}
							{#each d as v, j (j)}<Dice value={v} />{/each}
							<b>{sum(d)}</b>
						{:else}
							<Dice value={null} /><Dice value={null} />
							<b class="wait">…</b>
						{/if}
					</span>
					{#if out}<small>out</small>{/if}
				</li>
			{/each}
		</ol>
	{:else if game.phase === 'wallbreak'}
		<p class="kicker">Hand {game.handNo}</p>
		<h3>{game.dealer === me ? 'You are East. Break the wall' : `${game.players[game.dealer].name} is breaking the wall`}</h3>
		<div class="dice big">
			{#each Array(game.opts.variant === 'riichi' ? 2 : 3) as _, j (j)}<Dice value={null} size={48} />{/each}
		</div>
		<p class="note">The total picks a side of the wall, counted from the dealer, and how many stacks in the deal starts.</p>
	{/if}
</section>

<style>
	.panel {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 16px;
		text-align: center;
		border-radius: 14px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.14);
	}
	.kicker {
		margin: 0;
		color: var(--accent);
	}
	h3 {
		margin: 0;
		font-size: 1.15rem;
		color: var(--felt-ink);
	}
	.rolls {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: min(420px, 100%);
	}
	.rolls li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.18);
		color: var(--felt-ink);
	}
	.rolls li.you {
		outline: 2px solid var(--accent);
	}
	.rolls li.lead {
		background: rgba(224, 165, 38, 0.18);
	}
	.rolls li.out {
		opacity: 0.45;
	}
	.who {
		flex: 1;
		text-align: left;
		font-weight: 700;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dice {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.dice b {
		min-width: 2ch;
		font-size: 1.1rem;
	}
	.dice .wait {
		color: var(--felt-ink-2);
	}
	small {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.big {
		gap: 10px;
		margin: 6px 0;
	}
	.note {
		margin: 0;
		max-width: 360px;
		font-size: 0.8rem;
		color: var(--felt-ink-2);
	}
</style>
