<script lang="ts">
	// Your progress: points, rank, checkpoints, record, history and saved practice reports.
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import DiagnosticReportView from '#lib/components/DiagnosticReport.svelte';
	import type { DiagnosticReport } from '#lib/diagnostics.ts';
	import { nextRank, rankFor, rankProgress, RANKS } from '#lib/ranks.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';

	interface Progress {
		enabled: boolean;
		signedIn: boolean;
		rating?: number;
		start?: number;
		wins?: number;
		losses?: number;
		draws?: number;
		history?: { outcome: string; delta: number; rating: number; source: string; at: string }[];
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

	const rating = $derived(p?.rating ?? 1000);
	const rank = $derived(rankFor(rating));
	const next = $derived(nextRank(rating));
	const hands = $derived((p?.wins ?? 0) + (p?.losses ?? 0) + (p?.draws ?? 0));

	// sparkline of points over time
	const spark = $derived.by(() => {
		const pts = [p?.start ?? rating, ...(p?.history ?? []).map((h) => h.rating)];
		if (pts.length < 2) return null;
		const lo = Math.min(...pts) - 10;
		const hi = Math.max(...pts) + 10;
		const W = 600;
		const H = 120;
		const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - lo) / (hi - lo)) * H]);
		return { W, H, d: xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '), last: xy[xy.length - 1] };
	});
	const OUT: Record<string, string> = { win: 'Won', loss: 'Lost', dealin: 'Dealt in', draw: 'Draw' };
</script>

<svelte:head><title>My progress · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">My progress</p>
	{#if !p}
		<p class="muted">Loading…</p>
	{:else if !p.signedIn}
		<h1>Points and ranks</h1>
		<p class="lede">Sign up to earn points every hand, climb the ranks and keep your practice reports.</p>
		<a class="btn primary" href="/online">Sign up / sign in</a>
	{:else}
		<div class="hero card">
			<div class="badge" style:background={rank.color}>{rank.name}</div>
			<div class="pts">{rating.toLocaleString()} <span>points</span></div>
			<p class="muted">{rank.blurb}</p>
			<div class="bar"><div class="fill" style:width="{rankProgress(rating) * 100}%" style:background={rank.color}></div></div>
			<p class="muted small">
				{#if next}{next.min - rating} points to <strong>{next.name}</strong>{:else}Top rank reached{/if}
			</p>
			<div class="rec">
				<span><strong>{p.wins}</strong> won</span>
				<span><strong>{p.draws}</strong> draws</span>
				<span><strong>{p.losses}</strong> lost</span>
				<span><strong>{hands ? Math.round(((p.wins ?? 0) / hands) * 100) : 0}%</strong> win rate</span>
			</div>
		</div>

		<h2>Checkpoints</h2>
		<div class="ladder">
			{#each RANKS as r (r.name)}
				<div class="step" class:reached={rating >= r.min} class:here={r.name === rank.name}>
					<span class="chip" style:background={r.color}></span>
					<strong>{r.name}</strong>
					<span class="muted">{r.min.toLocaleString()}+</span>
				</div>
			{/each}
		</div>
		<p class="muted small">
			Win a hand: points up. Draw: no change. Someone else wins: points down, most for whoever dealt in. Games against
			people count twice as much as games against bots.
		</p>

		<h2>History</h2>
		{#if spark}
			<svg class="spark" viewBox="0 0 {spark.W} {spark.H}" preserveAspectRatio="none" aria-label="Points over time">
				<path d={spark.d} fill="none" stroke={rank.color} stroke-width="2.5" vector-effect="non-scaling-stroke" />
			</svg>
		{/if}
		{#if p.history?.length}
			<div class="hist">
				{#each [...p.history].reverse().slice(0, 15) as h, i (i)}
					<div class="hrow">
						<span>{OUT[h.outcome] ?? h.outcome}</span>
						<span class="muted">{h.source === 'online' ? 'vs people' : 'vs bots'}</span>
						<span class="d" class:up={h.delta > 0} class:down={h.delta < 0}>{h.delta > 0 ? '+' : ''}{h.delta}</span>
						<span class="muted">{h.rating}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="muted">No rated hands yet. <a href="/">Play a game</a> to start earning points.</p>
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
	.small {
		font-size: 0.85rem;
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
	.badge {
		display: inline-block;
		color: #10131a;
		font-weight: 700;
		padding: 5px 14px;
		border-radius: 99px;
	}
	.pts {
		font-family: var(--display);
		font-size: 3rem;
		font-weight: 600;
		margin: 8px 0 0;
	}
	.pts span {
		font-size: 1rem;
		color: var(--ink-2);
		font-family: var(--font);
	}
	.bar {
		height: 10px;
		border-radius: 99px;
		background: var(--bg-2);
		overflow: hidden;
		max-width: 420px;
		margin: 12px auto 6px;
	}
	.fill {
		height: 100%;
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
	.ladder {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 8px;
		margin-bottom: 8px;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		opacity: 0.5;
	}
	.step.reached {
		opacity: 1;
	}
	.step.here {
		border-color: var(--pop);
		box-shadow: 0 0 0 2px var(--pop) inset;
	}
	.chip {
		width: 22px;
		height: 6px;
		border-radius: 3px;
	}
	.spark {
		width: 100%;
		height: 120px;
		background: var(--bg-2);
		border-radius: 12px;
	}
	.hist {
		margin-top: 8px;
	}
	.hrow,
	.drow {
		display: grid;
		grid-template-columns: 1fr 1fr 60px 60px;
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
	.d {
		font-weight: 700;
		text-align: right;
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
