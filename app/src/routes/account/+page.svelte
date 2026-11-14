<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import { account, loadAccount, rename, signIn, signOut } from '#lib/online/account.svelte.ts';
	import MyTables from '#lib/components/MyTables.svelte';

	let name = $state('');
	let saving = $state(false);
	let message = $state('');

	onMount(async () => {
		await loadAccount();
		name = account.user?.name ?? '';
	});

	async function save() {
		saving = true;
		message = '';
		try {
			name = await rename(name);
			message = 'Saved. New tables will show this name.';
		} catch (e) {
			message = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	async function out() {
		await signOut();
		goto('/');
	}
</script>

<svelte:head><title>Your account · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Account</p>
	{#if !account.loaded}
		<p class="muted">Loading…</p>
	{:else if account.user}
		<div class="head">
			{#if account.user.picture}<img src={account.user.picture} alt="" referrerpolicy="no-referrer" />{/if}
			<div>
				<h1>{account.user.name}</h1>
				{#if account.user.email}<p class="muted">Signed in with Google · {account.user.email}</p>{/if}
			</div>
		</div>

		<section class="card">
			<h2>Your name at the table</h2>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<input bind:value={name} maxlength="16" />
				<button class="btn primary" disabled={saving || !name.trim()}>Save</button>
			</form>
			{#if message}<p class="muted">{message}</p>{/if}
		</section>

		<MyTables title="Your tables" />
		<p class="muted small">Tables are kept for a few days after the last move. Start a bot game while signed in and it appears here too.</p>

		<button class="btn" onclick={out}>Sign out</button>
	{:else}
		<h1>You're playing as a guest</h1>
		<p class="muted">Guests can play everything. Signing in adds your tables on any device, and friends.</p>
		{#if account.enabled && account.google}
			<button class="btn primary" onclick={() => signIn('/account')}>Sign in with Google</button>
		{:else}
			<p class="muted">Sign-in isn't switched on for this site yet.</p>
		{/if}
	{/if}
</main>

<style>
	.kicker {
		margin-top: 32px;
	}
	h1 {
		margin: 4px 0;
		font-size: clamp(1.8rem, 4vw, 2.4rem);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 20px;
	}
	.head img {
		width: 64px;
		height: 64px;
		border-radius: 50%;
	}
	.muted {
		color: var(--ink-2);
		margin: 4px 0;
	}
	.card {
		max-width: 520px;
		margin: 16px 0;
		padding: 20px;
		border-radius: 16px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.card h2 {
		margin: 0 0 10px;
		font-size: 1.2rem;
	}
	.small {
		font-size: 0.85rem;
	}
	form {
		display: flex;
		gap: 8px;
	}
	input {
		font: 500 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	form .btn {
		flex: none;
	}
</style>
