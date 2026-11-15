<script lang="ts">
	import { onMount } from 'svelte';
	import Tile from '#lib/components/Tile.svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { VARIANTS } from '#lib/engine/game.ts';
	import { loadGame } from '#lib/storage.ts';
	import { lastTable } from '#lib/online/client.ts';
	import MyTables from '#lib/components/MyTables.svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import { friendsOverview, notify, type Invite } from '#lib/online/friends.svelte.ts';
	import { quickCounts } from '#lib/online/quick.ts';
	import { WIND_NAMES } from '#lib/engine/tiles.ts';
	import type { GameState } from '#lib/engine/types.ts';

	const cards = [
		{ id: 'taiwanese', sample: ['dr', 'dr', 'dr', 'f2'] },
		{ id: 'riichi', sample: ['p5', 'p5', 'c5', 'ww'] },
		{ id: 'bombay', sample: ['jk', 'dg', 'dg', 's3'] }
	];
	let saved = $state<GameState | null>(null);
	let onlineCode = $state<string | null>(null);
	let signinFailed = $state(false);
	onMount(() => {
		const g = loadGame();
		if (g && g.phase !== 'gameover') saved = g;
		onlineCode = lastTable();
		loadAccount();
		signinFailed = new URLSearchParams(location.search).get('signin') === 'failed';
	});
	// quick match right on the front page, with how many are waiting per game
	let waitingNow = $state<Record<string, number>>({});
	$effect(() => {
		const load = () => quickCounts().then((c) => (waitingNow = c));
		load();
		const t = setInterval(load, 5000);
		return () => clearInterval(t);
	});

	// invitations from friends: fetched whenever the header's poll sees the count change
	let invites = $state<Invite[]>([]);
	$effect(() => {
		if (account.user && notify.invites > 0) friendsOverview().then((d) => (invites = d.invites)).catch(() => {});
		else invites = [];
	});
</script>

<svelte:head><title>{APP_NAME} · Mahjong, played your way</title></svelte:head>

<main class="wrap">
	<section class="hero">
		<p class="kicker">Shuffle up</p>
		<h1>Pick your game. <em>Play it better.</em></h1>
		<p class="lede">Taiwanese, Riichi or Bombay. Every game gets reviewed, and a coach answers your questions.</p>
		<div class="hero-cta">
			<a class="btn primary" href="/online">Play online</a>
			<a class="btn" href="/practice">Test my skills</a>
		</div>
	</section>

	<section class="quick">
		<span class="qtext">
			<strong>Quick match</strong>
			<small>Matched in seconds. Empty seats get filled so you never wait long.</small>
		</span>
		<span class="qbtns">
			{#each cards as c (c.id)}
				<a class="btn primary" href="/quick/{c.id}">
					{VARIANTS[c.id].name.replace(' Mahjong', '').replace(' Traditional', '')}
					{#if waitingNow[c.id]}<small>{waitingNow[c.id]} waiting</small>{/if}
				</a>
			{/each}
		</span>
	</section>

	{#if saved}
		<a class="resume" href="/table">
			<span>
				<strong>You left a game going</strong>
				<small>{VARIANTS[saved.opts.variant].name} · {WIND_NAMES[saved.round]} round, hand {saved.handNo}</small>
			</span>
			<span class="btn primary">Rejoin</span>
		</a>
	{/if}

	{#if signinFailed}
		<p class="warn">Sign-in didn't complete. Please try again.</p>
	{/if}

	{#each invites as inv (inv.id)}
		<a class="resume" href="/online/{inv.code}">
			<span>
				<strong>{inv.from.name} invited you to play</strong>
				<small>{inv.variantName} · table {inv.code}</small>
			</span>
			<span class="btn primary">Join</span>
		</a>
	{/each}

	{#if account.user}
		<MyTables limit={5} />
	{:else if onlineCode}
		<a class="resume" href="/online/{onlineCode}">
			<span>
				<strong>Your online table {onlineCode}</strong>
				<small>A bot keeps your seat while you're away</small>
			</span>
			<span class="btn primary">Rejoin</span>
		</a>
	{/if}

	<section class="games" id="games">
		{#each cards as c (c.id)}
			{@const v = VARIANTS[c.id]}
			<a class="game" href="/play/{c.id}">
				<div class="tiles">
					{#each c.sample as k, i (i)}
						<Tile tile={{ id: i, k, red: c.id === 'riichi' && k === 'p5' && i === 0 }} size="md" />
					{/each}
				</div>
				<h2>{v.name}</h2>
				<p>{v.tagline}</p>
				<span class="go">Play →</span>
			</a>
		{/each}
	</section>

	<a class="online" href="/online">
		<span>
			<strong>Play online</strong>
			<small>Jump into a match, or make a private table and send the code to friends.</small>
		</span>
		<span class="btn dark">Play online →</span>
	</a>

	<section class="how">
		<div>
			<h3>A coach on call</h3>
			<p>Ask anything about rules, scoring or strategy and get a straight answer.</p>
		</div>
		<div>
			<h3>A report card after every game</h3>
			<p>Each discard is graded from Brilliant to Blunder, with what to try next time.</p>
		</div>
		<div>
			<h3>Know your weak spots</h3>
			<p>Three practice hands against the bot give you a skill breakdown and a plan to improve.</p>
		</div>
	</section>
</main>

<style>
	.hero {
		text-align: center;
		padding: 56px 0 28px;
	}
	.hero h1 {
		font-size: clamp(2.2rem, 6vw, 3.8rem);
		margin: 10px 0;
	}
	.hero em {
		color: var(--pop);
		font-style: italic;
	}
	.lede {
		color: var(--ink-2);
		max-width: 560px;
		margin: 0 auto;
		font-size: 1.05rem;
	}
	.hero-cta {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
		margin-top: 20px;
	}
	.warn {
		max-width: 640px;
		margin: 0 auto 16px;
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
		text-align: center;
	}
	.quick {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 18px;
		flex-wrap: wrap;
		max-width: 760px;
		margin: 0 auto 24px;
		padding: 16px 18px;
		border-radius: var(--radius);
		background: var(--felt);
		color: var(--felt-ink);
	}
	.qtext strong {
		display: block;
		font-family: var(--display);
		font-size: 1.25rem;
	}
	.qtext small {
		opacity: 0.85;
	}
	.qbtns {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.qbtns .btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.2;
	}
	.qbtns small {
		font-size: 0.7rem;
		font-weight: 600;
		opacity: 0.8;
	}
	.resume {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		max-width: 640px;
		margin: 0 auto 24px;
		padding: 14px 18px;
		border-radius: var(--radius);
		background: var(--card);
		border: 1px solid var(--accent);
		text-decoration: none;
	}
	.resume small {
		display: block;
		color: var(--ink-2);
	}
	.games {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 16px;
	}
	.game {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 22px;
		border-radius: 18px;
		background: radial-gradient(120% 90% at 20% 0%, var(--felt) 0%, var(--felt-2) 100%);
		color: var(--felt-ink);
		text-decoration: none;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		transition: transform 150ms;
	}
	.game:hover {
		transform: translateY(-4px);
	}
	.tiles {
		display: flex;
		gap: 4px;
		margin-bottom: 14px;
	}
	.game h2 {
		margin: 0;
		font-size: 1.5rem;
	}
	.game p {
		margin: 0;
		color: var(--felt-ink-2);
		flex: 1;
	}
	.go {
		margin-top: 14px;
		font-weight: 700;
		color: var(--accent);
	}
	.online {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-top: 16px;
		padding: 18px 22px;
		border-radius: 18px;
		background: var(--card);
		border: 1px solid var(--line);
		text-decoration: none;
	}
	.online small {
		display: block;
		color: var(--ink-2);
	}
	.how {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 24px;
		margin-top: 56px;
	}
	.how h3 {
		margin: 0 0 6px;
	}
	.how p {
		margin: 0;
		color: var(--ink-2);
	}
</style>
