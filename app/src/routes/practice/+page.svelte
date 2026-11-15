<script lang="ts">
	// Practice assessment: 3 hands against the bot, then a full report on how you play.
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { ASSESS_HANDS, emptyHand, loadAssess, saveAssess } from '#lib/diagnostics.ts';
	import { newGame, VARIANTS } from '#lib/engine/game.ts';
	import type { BotLevel, VariantId } from '#lib/engine/types.ts';
	import { loadGame, loadPrefs, saveGame } from '#lib/storage.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';

	let variant = $state<VariantId>('taiwanese');
	let level = $state<BotLevel>('intermediate');
	let resuming = $state(false);

	onMount(() => {
		loadAccount();
		const a = loadAssess();
		const g = loadGame();
		resuming = !!a && !!g && a.started === g.opts.seed && g.phase !== 'gameover';
	});

	function start() {
		const prefs = loadPrefs();
		const seed = Math.floor(Math.random() * 2 ** 31);
		const game = newGame({
			variant,
			bots: [level, level, level],
			rounds: 1,
			playerName: prefs.name.trim() || 'You',
			minimum: true,
			redFives: true,
			seed
		});
		saveGame(game);
		saveAssess({ variant, variantName: VARIANTS[variant].name, started: seed, hands: [], cur: emptyHand(), counted: [] });
		goto('/table');
	}
</script>

<svelte:head><title>Practice assessment · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Practice</p>
	<h1>Find out how you really play</h1>
	<p class="lede">
		Play {ASSESS_HANDS} hands against the bot. Every discard and every call is checked against an expert. At the end you get a
		report: your scores in five skills, what you do well, what costs you, and a plan to get better.
	</p>

	<div class="grid">
		<div class="card">
			<h2>Set up</h2>
			<label>
				<span>Game</span>
				<select bind:value={variant}>
					{#each Object.values(VARIANTS) as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
				</select>
			</label>
			<label>
				<span>Bot strength</span>
				<select bind:value={level}>
					<option value="beginner">Beginner</option>
					<option value="intermediate">Intermediate</option>
					<option value="expert">Expert</option>
				</select>
			</label>
			{#if resuming}
				<a class="btn" href="/table">Continue my assessment</a>
			{/if}
			<button class="btn primary big" onclick={start}>{resuming ? 'Start over' : 'Start assessment'}</button>
			{#if account.loaded && !account.user}
				<p class="fine">Sign in to save your reports.</p>
			{/if}
		</div>
		<div class="card">
			<h2>What gets measured</h2>
			<ul>
				<li><strong>Tile efficiency</strong> · do you keep the tiles that win fastest?</li>
				<li><strong>Defense</strong> · do you avoid feeding a player who is ready?</li>
				<li><strong>Speed to ready</strong> · how early your hand is one tile from winning</li>
				<li><strong>Calling decisions</strong> · pung, chow and win calls vs the expert</li>
				<li><strong>Results</strong> · wins, deal-ins and draws</li>
			</ul>
			<p class="fine">Keep hints off so the result reflects you. Letting the bot play your seat skips that hand.</p>
		</div>
	</div>
</main>

<style>
	h1 {
		margin: 6px 0 8px;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
	}
	.kicker {
		margin-top: 32px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 640px;
		margin: 0 0 22px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 16px;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 0.88rem;
		color: var(--ink-2);
	}
	ul {
		margin: 0;
		padding-left: 18px;
		line-height: 1.6;
	}
	.fine {
		color: var(--ink-2);
		font-size: 0.82rem;
		margin: 0;
	}
	.big {
		padding: 13px;
	}
	.btn {
		text-align: center;
		text-decoration: none;
	}
</style>
