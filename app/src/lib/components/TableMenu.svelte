<script lang="ts">
	// The ☰ menu at the table: navigation, settings you change rarely (so they don't take
	// space on the table), players, rules, history, and parking/leaving the table.
	import { APP_NAME } from '#lib/brand.ts';
	import { seatWind, VARIANTS } from '#lib/engine/game.ts';
	import { WIND_NAMES } from '#lib/engine/tiles.ts';
	import type { GameState } from '#lib/engine/types.ts';
	import type { SeatFriend } from '#lib/online/friends.svelte.ts';

	let {
		game,
		me,
		online = false,
		onClose,
		onHome,
		onLeaveForGood,
		discardMode = $bindable('order'),
		discardFit = $bindable(false),
		hints = $bindable(false),
		speed = $bindable(),
		autoplay = $bindable(false),
		allowAutoplay = false,
		fmt,
		friends = [],
		onAddFriend
	}: {
		game: GameState;
		me: number;
		online?: boolean;
		onClose: () => void;
		/** go home; the table is kept (saved offline, covered by a bot online) */
		onHome: () => void;
		/** end the game for good (offline only) */
		onLeaveForGood?: () => void;
		discardMode?: 'order' | 'player';
		discardFit?: boolean;
		hints?: boolean;
		speed?: 'slow' | 'normal' | 'fast';
		autoplay?: boolean;
		allowAutoplay?: boolean;
		fmt: (n: number) => string;
		/** online, signed in: your friendship with each seat (null = nothing to show) */
		friends?: SeatFriend[];
		onAddFriend?: (seat: number) => void;
	} = $props();

	let view = $state<'main' | 'settings' | 'players' | 'history'>('main');
	let confirm = $state<null | 'home' | 'leave'>(null);
	const v = $derived(VARIANTS[game.opts.variant]);
	const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
	const TITLES = { main: 'At your table', settings: 'Settings', players: 'Players', history: 'History' };
</script>

<div class="scrim" onclick={onClose} aria-hidden="true"></div>
<aside class="menu" aria-label="Table menu">
	<header>
		<div>
			<p class="kicker">{APP_NAME} · Menu</p>
			<h2>{TITLES[view]}</h2>
		</div>
		{#if view !== 'main'}
			<button class="icon" onclick={() => (view = 'main')} aria-label="Back to menu">‹</button>
		{/if}
		<button class="icon" onclick={onClose} aria-label="Close menu">×</button>
	</header>

	<div class="body">
		{#if view === 'main'}
			<button class="row home" onclick={() => (confirm = 'home')}>
				<span>⌂ Back to home page</span><span class="go">→</span>
			</button>
			<button class="row" onclick={() => (view = 'settings')}><span>Settings</span><span class="chev">›</span></button>
			<button class="row" onclick={() => (view = 'players')}><span>Players</span><span class="chev">›</span></button>
			<a class="row" href="/rules/{v.id}" target="_blank" rel="noopener"><span>Rules: {v.name}</span><span class="chev">↗</span></a>
			<button class="row" onclick={() => (view = 'history')}><span>History</span><span class="chev">›</span></button>

			<p class="section">This table</p>
			<button class="row park" onclick={() => (confirm = 'home')}>
				<span>
					<b>Park table</b>
					<small>{online ? 'Step away: a bot covers your seat, and you can rejoin with the code' : 'Save it and finish later'}</small>
				</span>
			</button>
			{#if onLeaveForGood}
				<button class="row leave" onclick={() => (confirm = 'leave')}>
					<span><b>Leave table</b><small>Ends this game for good</small></span>
				</button>
			{/if}
		{:else if view === 'settings'}
			<p class="section">Discards</p>
			<div class="seg-row">
				<span>Show</span>
				<span class="seg">
					<button class:on={discardMode === 'order'} onclick={() => (discardMode = 'order')}>In order</button>
					<button class:on={discardMode === 'player'} onclick={() => (discardMode = 'player')}>By player</button>
				</span>
			</div>
			<div class="seg-row">
				<span>Size</span>
				<span class="seg">
					<button class:on={!discardFit} onclick={() => (discardFit = false)}>Scroll</button>
					<button class:on={discardFit} onclick={() => (discardFit = true)}>Fit</button>
				</span>
			</div>
			<p class="section">Help</p>
			<label class="check"><input type="checkbox" bind:checked={hints} /> Hints: tiles to win, waits, suggested discard</label>
			{#if speed !== undefined}
				<p class="section">Bots</p>
				<div class="seg-row">
					<span>Speed</span>
					<span class="seg">
						<button class:on={speed === 'slow'} onclick={() => (speed = 'slow')}>Relaxed</button>
						<button class:on={speed === 'normal'} onclick={() => (speed = 'normal')}>Normal</button>
						<button class:on={speed === 'fast'} onclick={() => (speed = 'fast')}>Quick</button>
					</span>
				</div>
			{/if}
			{#if allowAutoplay}
				<label class="check"><input type="checkbox" bind:checked={autoplay} /> Let a bot play my seat (watch mode)</label>
			{/if}
		{:else if view === 'players'}
			<ol class="players">
				{#each game.players as p, i (i)}
					<li class:you={i === me}>
						<span class="wind">{game.phase === 'seating' ? '·' : WIND_NAMES[seatWind(game, i)][0]}</span>
						<span class="who">
							<b>{p.name}{i === me && p.name !== 'You' ? ' (you)' : ''}</b>
							<small>{p.bot ? `Bot · ${LEVEL[p.bot]}` : 'Player'}{game.phase !== 'seating' && i === game.dealer ? ' · Dealer' : ''}</small>
						</span>
						{#if friends[i] === 'friend'}
							<span class="fr ok">Friend ✓</span>
						{:else if friends[i] === 'sent'}
							<span class="fr">Requested</span>
						{:else if friends[i] && onAddFriend}
							<button class="fr add" onclick={() => onAddFriend(i)}>{friends[i] === 'incoming' ? 'Accept friend' : 'Add friend'}</button>
						{/if}
						<span class="score">{fmt(p.score)}</span>
					</li>
				{/each}
			</ol>
		{:else if view === 'history'}
			<ol class="log">
				{#each [...game.log].reverse() as e (e.seq)}<li>{e.text}</li>{/each}
			</ol>
		{/if}
	</div>
</aside>

{#if confirm}
	<div class="dialog-wrap">
		<div class="dialog" role="dialog" aria-modal="true">
			{#if confirm === 'home'}
				<p class="kicker">Home page</p>
				<h3>Go to the home page?</h3>
				<p>
					{#if online}
						Your seat stays yours. A bot plays for you while you're away, and you can rejoin any time from the home page or with the table code.
					{:else}
						Don't worry about this game. <b>It's saved</b>, and you can pick it up from the home page any time.
					{/if}
				</p>
				<button class="btn primary big" onclick={onHome}>Go to home page</button>
			{:else}
				<p class="kicker">Leave table</p>
				<h3>End this game for good?</h3>
				<p>The scores and hands so far will be lost. This can't be undone.</p>
				<button class="btn danger big" onclick={() => onLeaveForGood?.()}>End the game</button>
			{/if}
			<button class="link" onclick={() => (confirm = null)}>Stay at the table</button>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 30;
	}
	.menu {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(400px, 100vw);
		z-index: 31;
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, var(--felt) 0%, var(--felt-2) 100%);
		color: var(--felt-ink);
		border-left: 1px solid rgba(224, 165, 38, 0.45);
		box-shadow: -12px 0 30px rgba(0, 0, 0, 0.35);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px 18px;
		border-bottom: 1px solid rgba(224, 165, 38, 0.35);
	}
	header > div {
		flex: 1;
	}
	.kicker {
		margin: 0;
		color: var(--accent);
	}
	h2 {
		margin: 2px 0 0;
		color: var(--accent);
		font-size: 1.6rem;
	}
	.icon {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.18);
		color: var(--felt-ink);
		font-size: 1.3rem;
		cursor: pointer;
	}
	.body {
		flex: 1;
		overflow: auto;
		padding: 16px 18px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		padding: 16px 18px;
		border-radius: 12px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.22);
		color: var(--felt-ink);
		font: 700 0.85rem var(--font);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.row:hover {
		background: rgba(0, 0, 0, 0.32);
	}
	.row.home {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.18);
		margin-bottom: 8px;
	}
	.go {
		color: var(--accent);
	}
	.chev {
		color: var(--felt-ink-2);
	}
	.row small {
		display: block;
		margin-top: 4px;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: none;
		color: var(--felt-ink-2);
	}
	.row.park {
		border-color: rgba(224, 165, 38, 0.55);
	}
	.row.park b {
		color: var(--accent);
	}
	.row.leave {
		border-color: rgba(214, 110, 90, 0.55);
	}
	.row.leave b {
		color: #e4876f;
	}
	.section {
		margin: 14px 0 2px;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.seg-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.2);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--felt-line);
		border-radius: 999px;
		overflow: hidden;
	}
	.seg button {
		border: 0;
		background: transparent;
		color: var(--felt-ink-2);
		font: 700 0.7rem var(--font);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 7px 11px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.check {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 10px 14px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.2);
		font-size: 0.9rem;
	}
	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}
	.players,
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.players li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.22);
	}
	.players li.you {
		outline: 2px solid var(--accent);
	}
	.players .wind {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.12);
		font-weight: 800;
	}
	.players .who {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.players small {
		color: var(--felt-ink-2);
	}
	.fr {
		flex: none;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--ink-2);
	}
	.fr.ok {
		color: var(--good);
	}
	.fr.add {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		font: 700 0.75rem var(--font);
		cursor: pointer;
	}
	.players .score {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.log li {
		font-size: 0.85rem;
		padding: 6px 2px;
		border-bottom: 1px solid var(--felt-line);
		color: var(--felt-ink);
	}
	.dialog-wrap {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(0, 0, 0, 0.5);
	}
	.dialog {
		width: min(440px, 100%);
		padding: 26px 24px 18px;
		border-radius: 18px;
		border: 1px solid var(--accent);
		background: linear-gradient(180deg, var(--felt) 0%, var(--felt-2) 100%);
		color: var(--felt-ink);
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.dialog h3 {
		margin: 0;
		color: var(--accent);
		font-size: 1.8rem;
	}
	.dialog p {
		margin: 0;
		color: var(--felt-ink-2);
		line-height: 1.5;
	}
	.dialog p b {
		color: var(--accent);
	}
	.big {
		padding: 14px;
		margin-top: 8px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.danger {
		background: #b5482f;
		border-color: #b5482f;
		color: white;
	}
	.link {
		border: 0;
		background: none;
		color: var(--felt-ink);
		font: 700 0.8rem var(--font);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		padding: 10px;
		cursor: pointer;
	}
</style>
