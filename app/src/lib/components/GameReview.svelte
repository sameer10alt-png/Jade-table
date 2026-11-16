<script module lang="ts">
	export type { GameReviewData, MoveReview } from '#lib/review-log.ts';
	import type { GameReviewData } from '#lib/review-log.ts';
	import type { DiscardGrade } from '#lib/engine/bots.ts';
</script>

<script lang="ts">
	import Tile from '#lib/components/Tile.svelte';
	import { page } from '$app/state';
	import { account } from '#lib/online/account.svelte.ts';

	let { data, onClose, log }: { data: GameReviewData; onClose: () => void; log?: () => string } = $props();

	// ---- "Review with the Dragon": send the game log, get back what was good and what to fix ----
	type DragonReview = { summary: string; good: string[]; bad: string[]; focus: string };
	let dragon = $state<DragonReview | null>(null);
	let dragonBusy = $state(false);
	let dragonErr = $state('');
	let started = $state(0);
	let tick = $state(0);
	const signinHref = $derived(`/signin?next=${encodeURIComponent(page.url.pathname + page.url.search)}`);

	async function askDragon() {
		if (!log || dragonBusy) return;
		dragonBusy = true;
		dragonErr = '';
		started = Date.now();
		const timer = setInterval(() => (tick = Date.now()), 200);
		try {
			const r = await fetch('/api/ask/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ log: log() })
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) dragonErr = d.error ?? 'The Dragon is unavailable right now.';
			else dragon = d as DragonReview;
		} catch {
			dragonErr = 'Couldn’t reach the Dragon. Check your connection and try again.';
		} finally {
			clearInterval(timer);
			dragonBusy = false;
		}
	}
	const waited = $derived(((Math.max(tick, started) - started) / 1000).toFixed(1));

	const LABEL: Record<DiscardGrade, string> = {
		amazing: 'Brilliant',
		great: 'Great',
		best: 'Best',
		good: 'Good',
		inaccuracy: 'Inaccuracy',
		mistake: 'Mistake',
		blunder: 'Blunder'
	};
	// order shown in the pill row (only non-zero pills render)
	const ORDER: DiscardGrade[] = ['amazing', 'great', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />
<div class="overlay" onclick={onClose} role="presentation">
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<p class="kicker">Game review</p>
		<div class="acc-row">
			<div class="acc">{data.accuracy}%</div>
			<div class="acc-sub">
				<strong>{data.verdict}</strong>
				<span>{data.total} discard{data.total === 1 ? '' : 's'} reviewed · how often you matched an expert</span>
			</div>
		</div>

		<div class="grades">
			{#each ORDER as g (g)}
				{#if data.counts[g]}<span class="g {g}">{data.counts[g]} {LABEL[g]}</span>{/if}
			{/each}
		</div>

		{#if data.tips.length}
			<div class="tips">
				<div class="tips-h">How to improve</div>
				<ul>{#each data.tips as t (t)}<li>{t}</li>{/each}</ul>
			</div>
		{/if}

		{#if data.notable.length}
			<div class="list-h">Key moments</div>
			<div class="list">
				{#each data.notable as m (m.handNo + m.chosenK + m.reason)}
					<div class="row">
						<span class="dot {m.grade}">{LABEL[m.grade]}</span>
						<span class="tiles">
							<Tile tile={{ id: -1, k: m.chosenK }} size="xs" />
							{#if m.chosenK !== m.bestK}<span class="arrow">better</span><Tile tile={{ id: -2, k: m.bestK }} size="xs" />{/if}
						</span>
						<span class="reason">{m.reason}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="clean">Clean game — no clear mistakes. Try a harder bot level.</p>
		{/if}

		{#if log}
			<div class="dragon">
				{#if dragon}
					<div class="tips-h">🐉 The Dragon's review</div>
					<p class="d-sum">{dragon.summary}</p>
					{#if dragon.good.length}
						<div class="d-h good">What went well</div>
						<ul>{#each dragon.good as t (t)}<li>{t}</li>{/each}</ul>
					{/if}
					{#if dragon.bad.length}
						<div class="d-h bad">What to fix</div>
						<ul>{#each dragon.bad as t (t)}<li>{t}</li>{/each}</ul>
					{/if}
					{#if dragon.focus}<p class="d-focus"><strong>Next game:</strong> {dragon.focus}</p>{/if}
				{:else if !account.user}
					<a class="btn primary dbtn" href={signinHref}>🐉 Sign in to review with the Dragon</a>
				{:else}
					<button class="btn primary dbtn" onclick={askDragon} disabled={dragonBusy}>
						{dragonBusy ? `The Dragon is reading your game… ${waited}s` : '🐉 Review my game with the Dragon'}
					</button>
					{#if dragonErr}<p class="d-err">{dragonErr}</p>{/if}
				{/if}
			</div>
		{/if}

		<div class="next">
			<a class="nx" href="/practice">
				<strong>Take the skill test</strong>
				<small>3 hands → a full report on how you play</small>
			</a>
			<a class="nx" href="/ask">
				<strong>Ask the Dragon</strong>
				<small>Questions about this game? Get an answer</small>
			</a>
		</div>
		<button class="btn primary close" onclick={onClose}>Done</button>
	</div>
</div>

<style>
	.dragon {
		margin: 16px 0;
		padding: 14px 16px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--accent, #7a3) 8%, transparent);
		border: 1px solid var(--line);
	}
	.dbtn {
		width: 100%;
		justify-content: center;
		text-align: center;
	}
	.d-sum {
		margin: 6px 0 10px;
	}
	.d-h {
		font-weight: 700;
		font-size: 0.85rem;
		margin-top: 8px;
	}
	.d-h.good {
		color: var(--good, #2f6f4e);
	}
	.d-h.bad {
		color: var(--bad, #b5452b);
	}
	.dragon ul {
		margin: 4px 0;
		padding-left: 18px;
	}
	.dragon li {
		margin: 3px 0;
	}
	.d-focus {
		margin: 10px 0 0;
	}
	.d-err {
		margin: 8px 0 0;
		color: var(--bad, #b5452b);
		font-size: 0.85rem;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(6, 10, 14, 0.62);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 60;
		padding: 16px;
	}
	.modal {
		background: var(--card);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 24px;
		width: 100%;
		max-width: 540px;
		max-height: 90vh;
		overflow: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
	}
	.acc-row {
		display: flex;
		align-items: center;
		gap: 16px;
		margin: 6px 0 16px;
	}
	.acc {
		font-family: var(--display);
		font-size: 2.8rem;
		font-weight: 600;
		color: var(--good);
		line-height: 1;
	}
	.acc-sub strong {
		display: block;
		font-size: 1.05rem;
	}
	.acc-sub span {
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.grades {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 16px;
	}
	.g {
		font-size: 0.8rem;
		font-weight: 600;
		padding: 4px 9px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--ink-2);
	}
	.g.amazing {
		color: #7c4dd6;
		border-color: #7c4dd655;
		background: #7c4dd610;
	}
	.g.great {
		color: #1f74c4;
		border-color: #1f74c455;
	}
	.g.best {
		color: #1c7a4a;
		border-color: #1c7a4a55;
	}
	.g.inaccuracy {
		color: #bd8b2e;
		border-color: #bd8b2e55;
	}
	.g.mistake {
		color: #d1662a;
		border-color: #d1662a55;
	}
	.g.blunder {
		color: var(--danger);
		border-color: #b23a2e55;
	}
	.tips {
		background: var(--bg-2);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 16px;
	}
	.tips-h {
		font-weight: 700;
		font-size: 0.85rem;
		margin-bottom: 4px;
	}
	.tips ul {
		margin: 0;
		padding-left: 18px;
	}
	.tips li {
		color: var(--ink-2);
		font-size: 0.9rem;
		line-height: 1.45;
		margin: 3px 0;
	}
	.list-h {
		font-weight: 700;
		font-size: 0.85rem;
		margin-bottom: 8px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row {
		display: grid;
		grid-template-columns: 76px auto 1fr;
		align-items: center;
		gap: 10px;
		padding: 8px 2px;
		border-bottom: 1px solid var(--line);
		font-size: 0.88rem;
	}
	.dot {
		font-size: 0.68rem;
		font-weight: 700;
		text-align: center;
		padding: 3px 0;
		border-radius: 6px;
		color: #fff;
	}
	.dot.amazing {
		background: #7c4dd6;
	}
	.dot.great {
		background: #1f74c4;
	}
	.dot.inaccuracy {
		background: #bd8b2e;
	}
	.dot.mistake {
		background: #d1662a;
	}
	.dot.blunder {
		background: var(--danger);
	}
	.tiles {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.arrow {
		font-size: 0.68rem;
		color: var(--ink-2);
	}
	.reason {
		color: var(--ink-2);
	}
	.clean {
		color: var(--ink-2);
	}
	.next {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 18px;
	}
	.nx {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 11px 13px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--pop) 45%, var(--line));
		background: color-mix(in srgb, var(--pop) 12%, var(--card));
		color: var(--ink);
		text-decoration: none;
	}
	.nx:hover {
		border-color: var(--pop);
	}
	.nx small {
		color: var(--ink-2);
		font-size: 0.78rem;
	}
	.close {
		margin-top: 18px;
		width: 100%;
	}
</style>
