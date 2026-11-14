<script lang="ts">
	// The tables a signed-in player is seated at: rejoin from any device.
	import { onMount } from 'svelte';
	import { WIND_NAMES } from '#lib/engine/tiles.ts';
	import { forgetTable, myTables, type MyTable } from '#lib/online/account.svelte.ts';

	let { limit = 30, title = 'Your tables' }: { limit?: number; title?: string } = $props();

	let tables = $state<MyTable[] | null>(null);
	let failed = $state(false);

	onMount(load);
	async function load() {
		try {
			tables = await myTables();
		} catch {
			failed = true;
		}
	}

	async function forget(code: string) {
		await forgetTable(code);
		tables = tables?.filter((t) => t.code !== code) ?? null;
	}

	function ago(iso: string) {
		const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min} min ago`;
		const h = Math.round(min / 60);
		return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
	}
	const fmtScore = (n: number) => (n > 0 ? `+${n}` : String(n));
</script>

{#if tables && tables.length}
	<section class="mine">
		<h2>{title}</h2>
		<ul>
			{#each tables.slice(0, limit) as t (t.code)}
				<li class:turn={t.yourTurn}>
					<a class="open" href="/online/{t.code}">
						<span class="top">
							<b>{t.variantName}</b>
							<span class="code">{t.code}</span>
							{#if t.yourTurn}<span class="pill">Your turn</span>{/if}
						</span>
						<span class="sub">
							{#if t.status === 'lobby'}
								Waiting to start
							{:else if t.status === 'finished'}
								Finished
							{:else}
								{WIND_NAMES[t.round]} round · hand {t.handNo}
							{/if}
							· {ago(t.updatedAt)}
						</span>
						<span class="players">
							{#each t.players as p, i (i)}
								<span class:you={p.you}>{p.name}{p.bot ? ' (bot)' : ''}{t.status !== 'lobby' ? ` ${fmtScore(p.score)}` : ''}</span>
							{/each}
						</span>
					</a>
					<span class="actions">
						<a class="btn primary" href="/online/{t.code}">{t.status === 'finished' ? 'View' : 'Rejoin'}</a>
						<button class="forget" onclick={() => forget(t.code)} title="Remove from this list" aria-label="Remove {t.code} from your tables">×</button>
					</span>
				</li>
			{/each}
		</ul>
	</section>
{:else if failed}
	<p class="muted">Couldn't load your tables right now.</p>
{/if}

<style>
	.mine {
		margin: 24px auto;
		max-width: 760px;
	}
	h2 {
		margin: 0 0 10px;
		font-size: 1.3rem;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	li.turn {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.open {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-decoration: none;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.code {
		font: 700 0.75rem ui-monospace, monospace;
		letter-spacing: 0.12em;
		color: var(--ink-2);
	}
	.pill {
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.sub {
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.players {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.players .you {
		color: var(--ink);
		font-weight: 700;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: none;
	}
	.forget {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink-2);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.muted {
		color: var(--ink-2);
		text-align: center;
	}
</style>
