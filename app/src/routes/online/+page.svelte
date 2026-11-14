<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { VARIANTS } from '#lib/engine/game.ts';
	import type { BotLevel, VariantId } from '#lib/engine/types.ts';
	import { createTable, identity, saveIdentity, tableExists, type Identity } from '#lib/online/client.ts';
	import { isTableCode } from '#lib/online/protocol.ts';
	import { account, loadAccount, signIn } from '#lib/online/account.svelte.ts';
	import { quickCounts } from '#lib/online/quick.ts';
	import SignupGate from '#lib/components/SignupGate.svelte';

	let me = $state<Identity>({ id: '', name: '' });
	let variant = $state<VariantId>('taiwanese');
	let botLevel = $state<BotLevel>('intermediate');
	let rounds = $state(1);
	let joinCode = $state('');
	let busy = $state(false);
	let error = $state('');

	// how many people are waiting per game right now (refreshed while you look)
	let waitingNow = $state<Record<string, number>>({});
	onMount(() => {
		(async () => {
			me = identity();
			await loadAccount();
			if (account.user) me.name = account.user.name;
		})();
		const load = () => quickCounts().then((c) => (waitingNow = c));
		load();
		const t = setInterval(load, 5000);
		return () => clearInterval(t);
	});

	function quickMatch(id: VariantId) {
		if (!account.user && !me.name.trim()) return (error = 'Pick a name first, so the table knows who you are.');
		rememberName();
		goto(`/quick/${id}`);
	}

	function rememberName() {
		me.name = me.name.trim().slice(0, 16);
		saveIdentity(me);
	}

	async function create() {
		if (!account.user && !me.name.trim()) return (error = 'Pick a name first, so your friends know who you are.');
		rememberName();
		busy = true;
		error = '';
		try {
			const code = await createTable({ variant, rounds, botLevel, minimum: true, redFives: true }, me.id);
			goto(`/online/${code}`);
		} catch (e) {
			error = `Could not reach the game server. Is it running? (${(e as Error).message})`;
		} finally {
			busy = false;
		}
	}

	async function join() {
		const code = joinCode.trim().toUpperCase();
		if (!account.user && !me.name.trim()) return (error = 'Pick a name first, so your friends know who you are.');
		if (!isTableCode(code)) return (error = 'A table code is 6 letters and numbers, like K7QM2X.');
		rememberName();
		busy = true;
		error = '';
		try {
			if (!(await tableExists(code))) error = `No table with code ${code}.`;
			else goto(`/online/${code}`);
		} catch (e) {
			error = `Could not reach the game server. (${(e as Error).message})`;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Play online · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Play online</p>
	<h1>Pull up a chair</h1>
	<p class="lede">Jump into a quick match with other players, or start a table and share its code with friends. Bots fill any empty seats.</p>

	{#if account.loaded && account.enabled && !account.user}
		<SignupGate next="/online" />
	{:else}

	{#if account.user}
		<p class="playing">Playing as <b>{account.user.name}</b> · <a href="/account">change</a></p>
	{:else}
	<label class="name">
			<span>Your name</span>
			<input bind:value={me.name} maxlength="16" placeholder="e.g. Shama" onchange={rememberName} />
		</label>
		{#if account.enabled && account.google}
			<p class="playing">Or <button class="linkish" onclick={() => signIn('/online')}>sign in with Google</button> to keep your tables on any device.</p>
		{/if}
	{/if}

	{#if error}<p class="err">{error}</p>{/if}

	<section class="card quick">
		<div>
			<h2>Quick match</h2>
			<p class="sub">Play with whoever's around right now. If nobody comes within 30 seconds, bots fill the empty seats.</p>
		</div>
		<div class="qbtns">
			{#each Object.values(VARIANTS) as v (v.id)}
				<button class="btn primary" onclick={() => quickMatch(v.id)}>
					{v.name}
					{#if waitingNow[v.id]}<small>{waitingNow[v.id]} waiting</small>{/if}
				</button>
			{/each}
		</div>
	</section>

	<div class="cols">
		<section class="card">
			<h2>Start a table</h2>
			<label>
				<span>Game</span>
				<select bind:value={variant}>
					{#each Object.values(VARIANTS) as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
				</select>
			</label>
			<label>
				<span>Bots for empty seats</span>
				<select bind:value={botLevel}>
					<option value="beginner">Beginner</option>
					<option value="intermediate">Intermediate</option>
					<option value="expert">Expert</option>
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
			<button class="btn primary big" disabled={busy} onclick={create}>Create table</button>
		</section>

		<section class="card">
			<h2>Join a table</h2>
			<p class="sub">Got a code from a friend? Enter it here.</p>
			<input
				class="code"
				bind:value={joinCode}
				maxlength="6"
				placeholder="K7QM2X"
				autocapitalize="characters"
				onkeydown={(e) => e.key === 'Enter' && join()}
			/>
			<button class="btn dark big" disabled={busy} onclick={join}>Join</button>
		</section>
	</div>
	{/if}
</main>

<style>
	h1 {
		margin: 6px 0 8px;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
	}
	.kicker {
		margin-top: 32px;
	}
	.quick {
		margin-bottom: 16px;
	}
	.quick .sub {
		margin: 6px 0 0;
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
		font-size: 0.72rem;
		font-weight: 600;
		opacity: 0.8;
	}
	.lede {
		color: var(--ink-2);
		max-width: 620px;
		margin: 0 0 20px;
	}
	.name {
		max-width: 360px;
		margin-bottom: 16px;
	}
	.playing {
		margin: 0 0 16px;
		color: var(--ink-2);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
	.err {
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
	}
	.sub {
		margin: -6px 0 0;
		color: var(--ink-2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	input,
	select {
		font: 500 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	.code {
		font: 800 1.6rem var(--font);
		letter-spacing: 0.3em;
		text-transform: uppercase;
		text-align: center;
	}
	.big {
		padding: 14px;
		font-size: 1.05rem;
	}
</style>
