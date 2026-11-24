<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { newGame, VARIANTS } from '#lib/engine/game.ts';
	import type { BotLevel, VariantId } from '#lib/engine/types.ts';
	import { loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from '#lib/storage.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import { createTable, identity } from '#lib/online/client.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const v = $derived(VARIANTS[data.variant]);

	let prefs = $state<Prefs>({ name: 'You', hints: false, speed: 'normal', autoPass: false });
	let skill = $state<BotLevel | 'mixed'>('intermediate');
	let rounds = $state(1);
	let minimum = $state(true);
	let redFives = $state(true);
	let charleston = $state(typeof location !== 'undefined' && new URLSearchParams(location.search).get('charleston') === '1');
	let blocking = $state(false);
	/** signed in: run the game on the server so it can be continued on any device */
	let toAccount = $state(true);
	let starting = $state(false);
	let startError = $state('');

	onMount(() => {
		loadAccount();
		prefs = loadPrefs();
		const g = loadGame();
		blocking = !!g && g.phase !== 'gameover';
	});

	async function start() {
		savePrefs(prefs);
		if (account.user && toAccount) {
			starting = true;
			startError = '';
			try {
				const code = await createTable(
					{ variant: data.variant as VariantId, rounds, botLevel: skill, minimum, redFives, charleston },
					identity().id
				);
				goto(`/online/${code}?start=1`);
			} catch (e) {
				startError = `Could not start the table: ${(e as Error).message}`;
			} finally {
				starting = false;
			}
			return;
		}
		const bots: [BotLevel, BotLevel, BotLevel] =
			skill === 'mixed' ? ['beginner', 'intermediate', 'expert'] : [skill, skill, skill];
		const game = newGame({
			variant: data.variant as VariantId,
			bots,
			rounds,
			playerName: prefs.name.trim() || 'You',
			minimum,
			redFives,
			charleston,
			seed: Math.floor(Math.random() * 2 ** 31)
		});
		saveGame(game);
		goto('/table');
	}
</script>

<svelte:head><title>{v.name} · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<a class="back" href="/">← All games</a>
	<p class="kicker">{v.name}</p>
	<h1>How would you like to play?</h1>

	{#if blocking}
		<div class="note">
			You have a table in progress. Starting a new one will replace it.
			<a href="/table">Rejoin that game</a>
		</div>
	{/if}

	<div class="cols">
		<form
			class="card"
			onsubmit={(e) => {
				e.preventDefault();
				start();
			}}
		>
			<h2>Play with bots <span class="tag">Solo · instant</span></h2>
			<p class="sub">Set the pace, then jump straight into a table.</p>

			<label>
				<span>Your name</span>
				<input bind:value={prefs.name} maxlength="16" />
			</label>

			<label>
				<span>Bot skill</span>
				<select bind:value={skill}>
					<option value="beginner">Beginner</option>
					<option value="intermediate">Intermediate</option>
					<option value="expert">Expert</option>
					<option value="mixed">Mixed (one of each)</option>
				</select>
			</label>

			<label>
				<span>Game length</span>
				<select bind:value={rounds}>
					<option value={1}>East round only</option>
					<option value={2}>East and South</option>
					<option value={4}>Full game (four rounds)</option>
				</select>
			</label>

			{#if data.variant === 'taiwanese'}
				<label class="check">
					<input type="checkbox" bind:checked={minimum} />
					<span>Round minimum (East 20, South 22, West 24, North 26)</span>
				</label>
			{/if}
			{#if data.variant === 'riichi'}
				<label class="check">
					<input type="checkbox" bind:checked={redFives} />
					<span>Red fives (aka dora)</span>
				</label>
			{/if}
			{#if data.variant !== 'american'}
			<label class="check">
				<input type="checkbox" bind:checked={charleston} />
				<span>Charleston (pass 3 tiles right, across, left before each hand; optional second Charleston and courtesy pass)</span>
			</label>
			{/if}
			<label class="check">
				<input type="checkbox" bind:checked={prefs.hints} />
				<span>Show hints (tiles to win, waits, suggested discard)</span>
			</label>
			<label>
				<span>Bot speed</span>
				<select bind:value={prefs.speed}>
					<option value="slow">Relaxed</option>
					<option value="normal">Normal</option>
					<option value="fast">Quick</option>
				</select>
			</label>

			{#if account.user}
				<label class="check">
					<input type="checkbox" bind:checked={toAccount} />
					<span>Save to my account (continue on any device)</span>
				</label>
			{/if}
			{#if startError}<p class="err">{startError}</p>{/if}
			<button class="btn primary big" type="submit" disabled={starting}>{starting ? 'Dealing…' : 'Deal me in'}</button>
		</form>

		<aside class="card rules">
			<h2>At a glance</h2>
			<ul>
				{#each v.rulesSummary as line}
					<li>{line}</li>
				{/each}
			</ul>
			<a class="btn" href="/rules/{data.variant}">Full rules and scoring</a>
		</aside>
	</div>
</main>

<style>
	.back {
		display: inline-block;
		margin: 24px 0 12px;
		color: var(--ink-2);
		text-decoration: none;
	}
	h1 {
		margin: 6px 0 20px;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
	}
	.note {
		padding: 12px 16px;
		border-radius: 12px;
		background: var(--bg-2);
		margin-bottom: 16px;
	}
	.note a {
		font-weight: 700;
		margin-left: 6px;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 16px;
	}
	@media (max-width: 760px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card h2 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.tag {
		font: 700 0.7rem var(--font);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--felt);
		color: var(--felt-ink);
	}
	.sub {
		margin: -6px 0 4px;
		color: var(--ink-2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	label.check {
		flex-direction: row;
		align-items: center;
		font-weight: 500;
	}
	input:not([type='checkbox']),
	select {
		font: 500 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--felt);
	}
	.err {
		margin: 0;
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
	}
	.big {
		margin-top: 6px;
		padding: 14px;
		font-size: 1.05rem;
	}
	.rules ul {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--ink-2);
	}
	.rules .btn {
		align-self: flex-start;
	}
</style>
