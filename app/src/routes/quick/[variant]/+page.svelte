<script lang="ts">
	// Waiting for a quick match. We check in every 2 seconds (that also tells the server we're
	// still here); when a table is made we go straight to it.
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { APP_NAME } from '#lib/brand.ts';
	import { VARIANTS } from '#lib/engine/game.ts';
	import type { VariantId } from '#lib/engine/types.ts';
	import { identity, saveIdentity, type Identity } from '#lib/online/client.ts';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';
	import { quickJoin, quickLeave, quickNow, quickStatus, type QuickStatus } from '#lib/online/quick.ts';
	import Avatar from '#lib/components/Avatar.svelte';

	const variant = page.params.variant as VariantId;
	const v = VARIANTS[variant];
	let me = $state<Identity>({ id: '', name: '' });
	let needName = $state(false);
	let status = $state<QuickStatus | null>(null);
	let error = $state('');
	let matched = false;
	let botsAt = $state(0);
	/** when we first joined (kept so a rejoin after a server restart doesn't reset the timer) */
	let since: number | undefined;
	let now = $state(Date.now());
	let poll: ReturnType<typeof setInterval> | undefined;
	const clock = setInterval(() => (now = Date.now()), 250);

	onMount(async () => {
		if (!v) return goto('/online');
		me = identity();
		await loadAccount();
		if (account.enabled && !account.user) return goto('/online'); // online requires a player
		if (account.user) me.name = account.user.name;
		if (!me.name) needName = true;
		else start();
		addEventListener('pagehide', leave);
	});
	onDestroy(() => {
		clearInterval(clock);
		clearInterval(poll);
		if (typeof removeEventListener !== 'undefined') removeEventListener('pagehide', leave);
		leave();
	});

	/** out of the line (Cancel, closing the tab, going elsewhere), unless we got a table */
	function leave() {
		if (!matched && me.id) quickLeave(me.id);
	}

	function apply(s: QuickStatus) {
		status = s;
		if (s.state === 'waiting') {
			botsAt = Date.now() + s.startsInMs;
			since ??= s.since;
		}
		if (s.state === 'matched') {
			matched = true;
			clearInterval(poll);
			// a full page load, so the table page starts fresh
			location.href = `/online/${s.code}`;
		}
	}

	async function start() {
		error = '';
		try {
			apply(await quickJoin(variant, me.id, me.name));
		} catch (e) {
			error = `Could not reach the game server. (${(e as Error).message})`;
			return;
		}
		clearInterval(poll);
		poll = setInterval(async () => {
			try {
				const s = await quickStatus(me.id);
				// the server forgot us (e.g. it restarted): get back in line
				if (s.state === 'none' && !matched) apply(await quickJoin(variant, me.id, me.name, since));
				else apply(s);
			} catch {
				/* a missed check-in is fine; the next one retries */
			}
		}, 2000);
	}

	function saveName() {
		me.name = me.name.trim().slice(0, 16);
		if (!me.name) return;
		saveIdentity(me);
		needName = false;
		start();
	}

	async function startNow() {
		try {
			apply(await quickNow(me.id));
		} catch (e) {
			error = (e as Error).message;
		}
	}

	const waiting = $derived(status?.state === 'waiting' ? status.waiting : 1);
	// names shown filling the table: you, then whoever's joined (real co-waiters or simulated joiners)
	const joined = $derived(status?.state === 'waiting' ? status.joined : []);
	const seatNames = $derived([me.name || 'You', ...joined.map((j) => j.name)].slice(0, 4));
	const myPicture = $derived(account.user?.picture ?? null);
	const secs = $derived(Math.max(0, Math.ceil((botsAt - now) / 1000)));
</script>

<svelte:head><title>Quick match · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<section class="card">
		{#if needName}
			<h1>Quick match · {v?.name}</h1>
			<label>
				<span>Your name at the table</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input bind:value={me.name} maxlength="16" placeholder="e.g. Shama" autofocus onkeydown={(e) => e.key === 'Enter' && saveName()} />
			</label>
			<button class="btn primary big" onclick={saveName}>Find a table</button>
		{:else}
			<p class="kicker">Quick match · {v?.name}</p>
			<h1>{status?.state === 'matched' ? 'Table found!' : 'Finding players…'}</h1>
			<ol class="seats" aria-label="Seats">
				{#each [0, 1, 2, 3] as i (i)}
					<li class:you={i === 0} class:filled={i < seatNames.length}>
						{#if i === 0}<Avatar name={me.name || 'You'} picture={myPicture} size={36} /><b>You</b>{:else if i < seatNames.length}<Avatar name={joined[i - 1].name} picture={joined[i - 1].picture} size={36} /><b>{seatNames[i]}</b>{:else}<span class="pulse">?</span>{/if}
					</li>
				{/each}
			</ol>
			{#if status?.state === 'waiting'}
				<p class="info">
					{#if seatNames.length >= 4}Table's full — starting…{:else if seatNames.length > 1}{seatNames.length} at the table…{:else}Finding players for {v.name}…{/if}
					{#if secs > 0 && seatNames.length < 4}Starts in <b>{secs}s</b>.{/if}
				</p>
				<span class="row">
					<button class="btn primary" onclick={startNow}>Start now</button>
					<a class="btn" href="/online">Cancel</a>
				</span>
			{:else if status?.state === 'matched'}
				<p class="info">Taking you to your seat…</p>
			{/if}
			{#if error}<p class="err">{error}</p>{/if}
		{/if}
	</section>
</main>

<style>
	.card {
		max-width: 520px;
		margin: 40px auto;
		padding: 26px 22px;
		text-align: center;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	h1 {
		margin: 0;
		font-size: 1.7rem;
	}
	.kicker {
		margin: 0;
	}
	.seats {
		list-style: none;
		margin: 6px auto;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, 72px);
		gap: 10px;
	}
	.seats li {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 88px;
		border-radius: 10px;
		background: var(--bg-2);
		border: 2px dashed var(--line);
		font-size: 0.85rem;
	}
	.seats li.filled {
		border-style: solid;
		background: var(--t-face);
		border-color: var(--t-edge);
		box-shadow: 0 3px 0 var(--t-edge);
	}
	.seats li.you {
		border-color: var(--accent);
		box-shadow: 0 3px 0 var(--accent);
	}
	.pulse {
		font: 800 1.4rem var(--font);
		color: var(--ink-2);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.info {
		margin: 0;
		color: var(--ink-2);
	}
	.row {
		display: flex;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: left;
	}
	label span {
		font-weight: 700;
		font-size: 0.85rem;
	}
	input {
		font: 600 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	.err {
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
	}
</style>
