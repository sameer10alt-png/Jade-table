<script lang="ts">
	// Your record: wins, draws, losses, recent hands and saved practice reports.
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import DiagnosticReportView from '#lib/components/DiagnosticReport.svelte';
	import type { DiagnosticReport } from '#lib/diagnostics.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';

	interface Progress {
		enabled: boolean;
		signedIn: boolean;
		wins?: number;
		losses?: number;
		draws?: number;
		history?: { outcome: string; source: string; at: string }[];
		diagnostics?: { id: number; at: string; report: DiagnosticReport }[];
	}

	let p = $state<Progress | null>(null);
	let open = $state<number | null>(null);

	onMount(async () => {
		loadAccount();
		try {
			const r = await fetch('/api/progress', { credentials: 'same-origin' });
			p = r.ok ? await r.json() : { enabled: false, signedIn: false };
		} catch {
			p = { enabled: false, signedIn: false };
		}
	});

	const hands = $derived((p?.wins ?? 0) + (p?.losses ?? 0) + (p?.draws ?? 0));
	const OUT: Record<string, string> = { win: 'Won', loss: 'Lost', dealin: 'Dealt in', draw: 'Draw' };
</script>

<svelte:head><title>My progress · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">My progress</p>
	{#if !p}
		<p class="muted">Loading…</p>
	{:else if !p.signedIn}
		<h1>Your record</h1>
		<p class="lede">Sign up to keep your wins, losses and practice reports.</p>
		<a class="btn primary" href="/online">Sign up / sign in</a>
	{:else}
		<div class="hero card">
			<div class="rec">
				<span><strong>{p.wins}</strong> won</span>
				<span><strong>{p.draws}</strong> draws</span>
				<span><strong>{p.losses}</strong> lost</span>
				<span><strong>{hands ? Math.round(((p.wins ?? 0) / hands) * 100) : 0}%</strong> win rate</span>
			</div>
		</div>

		<h2>Recent hands</h2>
		{#if p.history?.length}
			<div class="hist">
				{#each [...p.history].reverse().slice(0, 15) as h, i (i)}
					<div class="hrow">
						<span class:up={h.outcome === 'win'} class:down={h.outcome === 'dealin'}>{OUT[h.outcome] ?? h.outcome}</span>
						<span class="muted">{h.source === 'online' ? 'vs people' : 'vs bots'}</span>
						<span class="muted">{new Date(h.at).toLocaleDateString()}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="muted">No hands yet. <a href="/">Play a game</a> and they'll show up here.</p>
		{/if}

		<h2>Practice reports</h2>
		{#if p.diagnostics?.length}
			{#each p.diagnostics as d (d.id)}
				<button class="drow" onclick={() => (open = open === d.id ? null : d.id)}>
					<strong>{d.report.overall}</strong>
					<span>{d.report.level} · {d.report.variantName}</span>
					<span class="muted">{new Date(d.at).toLocaleDateString()}</span>
				</button>
				{#if open === d.id}<div class="card"><DiagnosticReportView report={d.report} inline /></div>{/if}
			{/each}
		{:else}
			<p class="muted">No reports yet.</p>
		{/if}
		<a class="btn primary" href="/practice">Take a practice assessment</a>
	{/if}
</main>

<style>
	.kicker {
		margin-top: 32px;
	}
	h1 {
		margin: 6px 0 8px;
	}
	h2 {
		margin: 28px 0 10px;
		font-size: 1.15rem;
	}
	.lede,
	.muted {
		color: var(--ink-2);
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 20px;
		margin: 8px 0;
	}
	.hero {
		text-align: center;
	}
	.rec {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 18px;
		margin-top: 12px;
		color: var(--ink-2);
	}
	.rec strong {
		color: var(--ink);
	}
	.hist {
		margin-top: 8px;
	}
	.hrow,
	.drow {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 10px;
		padding: 8px 4px;
		border-bottom: 1px solid var(--line);
		font-size: 0.9rem;
	}
	.drow {
		grid-template-columns: 48px 1fr auto;
		width: 100%;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.up {
		color: var(--good);
	}
	.down {
		color: var(--danger);
	}
	.btn {
		display: inline-block;
		margin-top: 16px;
		text-decoration: none;
	}
</style>
