<script lang="ts">
	// Full practice diagnostic: overall score, skill bars, strengths, weaknesses, a plan,
	// key moments, and strategy questions that open the AI coach.
	import Tile from '#lib/components/Tile.svelte';
	import type { DiagnosticReport } from '#lib/diagnostics.ts';

	let { report, onClose, inline = false }: { report: DiagnosticReport; onClose?: () => void; inline?: boolean } = $props();

	const LABEL: Record<string, string> = {
		amazing: 'Brilliant',
		great: 'Great',
		inaccuracy: 'Inaccuracy',
		mistake: 'Mistake',
		blunder: 'Blunder'
	};
	const tone = (n: number) => (n >= 80 ? 'hi' : n >= 60 ? 'mid' : 'lo');
	const ask = (q: string) => `/ask?q=${encodeURIComponent(q)}`;
</script>

{#snippet body()}
	<p class="kicker">Practice diagnostic · {report.variantName}</p>
	<div class="top">
		<div class="score {tone(report.overall)}">{report.overall}</div>
		<div>
			<strong class="level">{report.level}</strong>
			<span class="sub">{report.headline}</span>
			<span class="sub small"
				>{report.stats.hands} hands · {report.stats.wins} won · {report.stats.dealIns} dealt in · {report.stats.accuracy}% expert-level discards</span
			>
		</div>
	</div>

	<div class="skills">
		{#each report.skills as s (s.key)}
			<div class="skill">
				<div class="skill-h">
					<span>{s.name}</span>
					<span class="num">{s.tested ? s.score : '—'}</span>
				</div>
				<div class="bar"><div class="fill {tone(s.score)}" style:width="{s.tested ? s.score : 0}%"></div></div>
				<div class="detail">{s.detail}</div>
			</div>
		{/each}
	</div>

	<div class="cols">
		{#if report.strengths.length}
			<div class="box good">
				<div class="box-h">Strengths</div>
				<ul>{#each report.strengths as t (t)}<li>{t}</li>{/each}</ul>
			</div>
		{/if}
		{#if report.weaknesses.length}
			<div class="box weak">
				<div class="box-h">Weaknesses</div>
				<ul>{#each report.weaknesses as t (t)}<li>{t}</li>{/each}</ul>
			</div>
		{/if}
	</div>

	<div class="box plan">
		<div class="box-h">How to improve</div>
		<ol>{#each report.plan as t (t)}<li>{t}</li>{/each}</ol>
	</div>

	{#if report.moments.length}
		<div class="list-h">Key moments</div>
		{#each report.moments as m, i (i)}
			<div class="row">
				<span class="dot {m.grade}">{LABEL[m.grade] ?? m.grade}</span>
				<span class="tiles">
					<Tile tile={{ id: -1, k: m.chosenK }} size="xs" />
					{#if m.chosenK !== m.bestK}<span class="arrow">better</span><Tile tile={{ id: -2, k: m.bestK }} size="xs" />{/if}
				</span>
				<span class="reason">Hand {m.hand}: {m.reason}</span>
			</div>
		{/each}
	{/if}

	<div class="list-h">Strategy questions for the Dragon</div>
	<div class="qs">
		{#each report.questions as q (q)}
			<a class="q" href={ask(q)}>{q}</a>
		{/each}
	</div>
{/snippet}

<svelte:window onkeydown={(e) => !inline && e.key === 'Escape' && onClose?.()} />

{#if inline}
	<div class="inline">{@render body()}</div>
{:else}
	<div class="overlay" onclick={() => onClose?.()} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			{@render body()}
			<div class="actions">
				<a class="btn" href="/progress">See my progress</a>
				<a class="btn" href="/practice">Practice again</a>
				<button class="btn primary" onclick={() => onClose?.()}>Done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(6, 10, 14, 0.62);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 70;
		padding: 16px;
	}
	.modal {
		background: var(--card);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 24px;
		width: 100%;
		max-width: 620px;
		max-height: 92vh;
		overflow: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 16px;
		margin: 6px 0 18px;
	}
	.score {
		font-family: var(--display);
		font-size: 3rem;
		font-weight: 600;
		line-height: 1;
		min-width: 72px;
	}
	.hi {
		color: var(--good);
	}
	.mid {
		color: var(--accent);
	}
	.lo {
		color: var(--danger);
	}
	.level {
		display: block;
		font-size: 1.1rem;
	}
	.sub {
		display: block;
		color: var(--ink-2);
		font-size: 0.9rem;
	}
	.small {
		font-size: 0.8rem;
		margin-top: 2px;
	}
	.skills {
		display: grid;
		gap: 12px;
		margin-bottom: 18px;
	}
	.skill-h {
		display: flex;
		justify-content: space-between;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 8px;
		border-radius: 99px;
		background: var(--bg-2);
		overflow: hidden;
		margin: 5px 0 3px;
	}
	.fill {
		height: 100%;
		border-radius: 99px;
	}
	.fill.hi {
		background: var(--good);
	}
	.fill.mid {
		background: var(--accent);
	}
	.fill.lo {
		background: var(--danger);
	}
	.detail {
		color: var(--ink-2);
		font-size: 0.82rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 10px;
		margin-bottom: 10px;
	}
	.box {
		background: var(--bg-2);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 10px;
	}
	.box.good {
		border-left: 3px solid var(--good);
	}
	.box.weak {
		border-left: 3px solid var(--danger);
	}
	.box.plan {
		border-left: 3px solid var(--pop);
	}
	.box-h {
		font-weight: 700;
		font-size: 0.85rem;
		margin-bottom: 4px;
	}
	.box ul,
	.box ol {
		margin: 0;
		padding-left: 18px;
	}
	.box li {
		color: var(--ink-2);
		font-size: 0.88rem;
		line-height: 1.45;
		margin: 3px 0;
	}
	.list-h {
		font-weight: 700;
		font-size: 0.85rem;
		margin: 14px 0 6px;
	}
	.row {
		display: grid;
		grid-template-columns: 76px auto 1fr;
		align-items: center;
		gap: 10px;
		padding: 7px 2px;
		border-bottom: 1px solid var(--line);
		font-size: 0.85rem;
	}
	.dot {
		font-size: 0.68rem;
		font-weight: 700;
		text-align: center;
		padding: 3px 0;
		border-radius: 6px;
		color: #fff;
		background: var(--ink-2);
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
	.qs {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.q {
		display: block;
		padding: 9px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		text-decoration: none;
		font-size: 0.88rem;
	}
	.q::after {
		content: ' → Ask the Dragon';
		color: var(--pop);
		font-weight: 600;
	}
	.q:hover {
		border-color: var(--pop);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}
	.actions .btn {
		flex: 1;
		text-align: center;
		text-decoration: none;
	}
</style>
