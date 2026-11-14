<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APP_NAME } from '#lib/brand.ts';
	import { account, loadAccount, signIn } from '#lib/online/account.svelte.ts';
	import { useFriendLink, whoSentLink } from '#lib/online/friends.svelte.ts';

	const token = $derived(page.params.token ?? '');
	let sender = $state<{ name: string; picture: string | null } | null>(null);
	let result = $state<'friends' | null>(null);
	let error = $state('');
	let busy = $state(false);

	onMount(async () => {
		await loadAccount();
		try {
			sender = await whoSentLink(token);
		} catch (e) {
			error = (e as Error).message;
			return;
		}
	});

	// nothing happens until you press Accept: a friendship needs your yes too
	async function accept() {
		busy = true;
		try {
			await useFriendLink(token);
			result = 'friends';
		} catch (e) {
			error = (e as Error).message;
		}
		busy = false;
	}
</script>

<svelte:head><title>Add friend · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<section class="card">
		{#if error}
			<h1>Hmm.</h1>
			<p>{error}</p>
			{#if /own link/.test(error)}
				<p class="muted">Send this link to friends: when they open it, you're friends.</p>
				<a class="btn" href="/friends">Your friends</a>
			{:else}
				<p class="muted">The link may have been replaced by a newer one. Ask your friend to send it again.</p>
				<a class="btn" href="/">Go home</a>
			{/if}
		{:else if !sender || !account.loaded}
			<p class="muted">Loading…</p>
		{:else}
			<span class="avatar">
				{#if sender.picture}<img src={sender.picture} alt="" referrerpolicy="no-referrer" />{:else}{sender.name.slice(0, 1).toUpperCase()}{/if}
			</span>
			{#if result === 'friends'}
				<h1>You and {sender.name} are friends</h1>
				<p class="muted">You'll see when they're online, and you can invite each other to tables.</p>
				<span class="row">
					<a class="btn primary" href="/friends">See friends</a>
					<a class="btn" href="/online">Open a table</a>
				</span>
			{:else if !account.user}
				<h1>{sender.name} invited you to {APP_NAME}</h1>
				<p class="muted">Mahjong in the browser: Riichi, Taiwanese and Bombay, with friends or bots. Sign in, then accept to become friends.</p>
				<span class="row">
					{#if account.enabled && account.google}
						<button class="btn primary" onclick={() => signIn(location.pathname)}>Sign in with Google</button>
					{/if}
					<a class="btn" href="/">Just play as a guest</a>
				</span>
			{:else}
				<h1>{sender.name} wants to be friends</h1>
				<p class="muted">Friends see when each other is online and can invite each other to tables.</p>
				<span class="row">
					<button class="btn primary" disabled={busy} onclick={accept}>Accept</button>
					<a class="btn" href="/">Not now</a>
				</span>
			{/if}
		{/if}
	</section>
</main>

<style>
	.card {
		max-width: 520px;
		margin: 48px auto;
		padding: 28px 22px;
		text-align: center;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 20px;
	}
	h1 {
		margin: 12px 0 8px;
		font-size: 1.5rem;
	}
	.avatar {
		display: inline-grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--felt);
		color: var(--felt-ink);
		font: 800 1.8rem var(--font);
	}
	.avatar img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}
	.row {
		display: flex;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 16px;
	}
	.muted {
		color: var(--ink-2);
	}
</style>
