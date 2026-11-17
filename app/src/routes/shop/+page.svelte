<script lang="ts">
	// The Jade shop: daily bonus, Lucky Hours, tile backs, table felts and Dragon tokens.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APP_NAME } from '#lib/brand.ts';
	import { account } from '#lib/online/account.svelte.ts';
	import { buyItem, claimDaily, equipItem, refreshRewards, rewards } from '#lib/rewards.svelte.ts';
	import { EARN, ITEMS, LUCKY_HOURS_UTC, type ShopItem } from '#lib/shop.ts';

	let now = $state(Date.now());
	let msg = $state<{ text: string; good: boolean } | null>(null);
	let busy = $state<string | null>(null);
	onMount(() => {
		refreshRewards();
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	const signedIn = $derived(!!account.user && rewards.signedIn);
	const lucky = $derived(rewards.lucky);
	const luckyOn = $derived(!!lucky?.active && (lucky.endsAt ?? 0) > now);
	const left = (t: number) => {
		const s = Math.max(0, Math.round((t - now) / 1000));
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h ? `${h}h ${m}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
	};
	const localHour = (utc: number) => {
		const d = new Date();
		d.setUTCHours(utc, 0, 0, 0);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	};

	async function act(item: ShopItem | null, fn: () => Promise<{ ok: boolean; error?: string; earned?: number }>, good: string) {
		busy = item?.id ?? 'daily';
		const r = await fn();
		busy = null;
		msg = r.ok ? { text: r.earned ? `+${r.earned} Jade collected!` : good, good: true } : { text: r.error ?? 'Something went wrong', good: false };
	}
	const owns = (i: ShopItem) => rewards.owned.includes(i.id);
	const wearing = (i: ShopItem) => rewards.equipped[i.kind] === i.id;
	const backs = ITEMS.filter((i) => i.kind === 'back');
	const felts = ITEMS.filter((i) => i.kind === 'felt');
	const tokens = ITEMS.filter((i) => i.kind === 'token');
</script>

<svelte:head><title>Jade shop · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Jade shop</p>
	{#if !rewards.enabled && !account.user?.isAdmin}
		<h1>Coming soon</h1>
		<p class="sub">Earn coins by playing and unlock new tiles and tables. <a href="/">Play a game</a> while you wait.</p>
	{:else}
	<h1>Earn Jade. Make the table yours.</h1>

	<section class="top">
		<div class="card bal">
			<span class="gem big" aria-hidden="true"></span>
			<div>
				<b>{signedIn ? rewards.jade.toLocaleString() : '—'}</b>
				<small>Jade{#if signedIn && rewards.tokens} · {rewards.tokens} Dragon token{rewards.tokens === 1 ? '' : 's'}{/if}</small>
			</div>
		</div>

		<div class="card lucky" class:on={luckyOn}>
			{#if luckyOn && lucky?.endsAt}
				<b>Lucky Hour is on!</b>
				<small>Double Jade on every hand. Ends in {left(lucky.endsAt)}.</small>
				<a class="btn primary" href="/quick">Play now</a>
			{:else}
				<b>Next Lucky Hour in {lucky ? left(lucky.nextAt) : '…'}</b>
				<small>Double Jade every day at {LUCKY_HOURS_UTC.map(localHour).join(' and ')} (your time), for one hour.</small>
			{/if}
		</div>

		<div class="card daily">
			{#if !signedIn}
				<b>Daily bonus</b>
				<small>Sign in to collect free Jade every day.</small>
				<a class="btn primary" href="/signin?next={encodeURIComponent(page.url.pathname)}">Sign in</a>
			{:else if rewards.daily.claimed}
				<b>Daily bonus collected</b>
				<small>{rewards.daily.streak}-day streak. Come back tomorrow for more.</small>
			{:else}
				<b>Daily bonus: +{rewards.daily.amount} Jade</b>
				<small>Come back every day to grow it, up to +{EARN.dailyMax}.</small>
				<button class="btn primary" disabled={busy === 'daily'} onclick={() => act(null, claimDaily, '')}>Collect</button>
			{/if}
		</div>
	</section>

	{#if msg}<p class="msg" class:bad={!msg.good} role="status">{msg.text}</p>{/if}

	<section class="earn card">
		<h2>How to earn</h2>
		<ul>
			<li><b>+{EARN.hand}</b> every hand you finish</li>
			<li><b>+{EARN.win}</b> more when you win it</li>
			<li><b>+{EARN.people}</b> more at a table with real players</li>
			<li><b>+{EARN.firstWin}</b> for your first win each day {#if signedIn && rewards.firstWinDone}<em>(done today)</em>{/if}</li>
			<li><b>2×</b> everything in a Lucky Hour</li>
		</ul>
	</section>

	<h2>Tile backs</h2>
	<div class="grid">
		{#each backs as i (i.id)}
			<div class="card item" class:worn={signedIn && wearing(i)}>
				<div class="prev tiles" aria-hidden="true">
					{#each [0, 1, 2] as n (n)}<span class="tb" style="background: linear-gradient(160deg, {i.colors?.[0]}, {i.colors?.[1]})"></span>{/each}
				</div>
				{@render buy(i)}
			</div>
		{/each}
	</div>

	<h2>Table felts</h2>
	<div class="grid">
		{#each felts as i (i.id)}
			<div class="card item" class:worn={signedIn && wearing(i)}>
				<div class="prev felt" aria-hidden="true" style="background: radial-gradient(140% 100% at 50% 0%, {i.colors?.[0]}, {i.colors?.[1]})">
					<span class="mini"></span><span class="mini"></span><span class="mini"></span>
				</div>
				{@render buy(i)}
			</div>
		{/each}
	</div>

	<h2>Dragon tokens</h2>
	<p class="sub">Each token is one more Dragon question or game review after your free ones for the day run out. Used automatically.</p>
	<div class="grid two">
		{#each tokens as i (i.id)}
			<div class="card item">
				<div class="prev dragon" aria-hidden="true">龍 <span>×{i.qty}</span></div>
				{@render buy(i)}
				<small class="blurb">{i.blurb}</small>
			</div>
		{/each}
	</div>
	{/if}
</main>

{#snippet buy(i: ShopItem)}
	<div class="row">
		<span class="name">{i.name}</span>
		{#if i.kind !== 'token' && (owns(i) || i.price === 0)}
			{#if signedIn && wearing(i)}
				<span class="tag">Using</span>
			{:else}
				<button class="btn" disabled={!signedIn || busy === i.id} onclick={() => act(i, () => equipItem(i), `${i.name} is on.`)}>Use</button>
			{/if}
		{:else}
			<button
				class="btn primary"
				disabled={!signedIn || busy === i.id || rewards.jade < i.price}
				title={signedIn && rewards.jade < i.price ? `You need ${i.price - rewards.jade} more Jade` : ''}
				onclick={() => act(i, () => buyItem(i), i.kind === 'token' ? `Got ${i.qty} Dragon tokens.` : `${i.name} unlocked and on!`)}
			>
				<span class="gem" aria-hidden="true"></span>{i.price.toLocaleString()}
			</button>
		{/if}
	</div>
{/snippet}

<style>
	h1 {
		margin: 4px 0 18px;
	}
	h2 {
		margin: 28px 0 10px;
		font-size: 1.15rem;
	}
	.sub {
		margin: -4px 0 12px;
		color: var(--ink-2);
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 14px;
	}
	.top {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
	}
	.top .card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.top small {
		color: var(--ink-2);
	}
	.bal {
		flex-direction: row !important;
		align-items: center !important;
		gap: 14px !important;
	}
	.bal b {
		display: block;
		font-size: 1.8rem;
		line-height: 1;
	}
	.lucky.on {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--card));
	}
	.msg {
		margin: 12px 0 0;
		padding: 10px 14px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--good) 14%, var(--card));
	}
	.msg.bad {
		background: color-mix(in srgb, var(--danger) 14%, var(--card));
	}
	.earn {
		margin-top: 16px;
	}
	.earn h2 {
		margin: 0 0 8px;
	}
	.earn ul {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
	}
	.earn em {
		color: var(--ink-2);
		font-style: normal;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 12px;
	}
	.grid.two {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.item.worn {
		border-color: var(--good);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--good) 25%, transparent);
	}
	.prev {
		height: 84px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
	.tiles {
		background: var(--bg-2);
	}
	.tb {
		width: 30px;
		height: 42px;
		border-radius: 5px;
		box-shadow:
			inset 0 0 0 2px rgba(255, 255, 255, 0.18),
			0 3px 0 rgba(0, 0, 0, 0.25);
	}
	.mini {
		width: 18px;
		height: 25px;
		border-radius: 3px;
		background: linear-gradient(180deg, #fffdf6, #f1ead8);
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
	}
	.dragon {
		background: linear-gradient(135deg, #3b1d5e, #1b0f2e);
		color: #ffd27a;
		font-size: 2rem;
		font-family: var(--display);
	}
	.dragon span {
		font-size: 1rem;
		font-family: var(--font);
		font-weight: 700;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.name {
		font-weight: 600;
	}
	.tag {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--good);
	}
	.blurb {
		color: var(--ink-2);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.gem {
		display: inline-block;
		width: 10px;
		height: 10px;
		transform: rotate(45deg);
		border-radius: 2px;
		background: linear-gradient(135deg, #5fd3a3, #1e7a58 60%, #0f4d36);
	}
	.gem.big {
		width: 26px;
		height: 26px;
		border-radius: 5px;
	}
</style>
