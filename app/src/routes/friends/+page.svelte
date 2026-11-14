<script lang="ts">
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import FriendRow from '#lib/components/FriendRow.svelte';
	import { account, loadAccount, signIn } from '#lib/online/account.svelte.ts';
	import {
		dismissInvite,
		friendLinkUrl,
		friendsOverview,
		newFriendLink,
		removeFriend,
		requestFriend,
		respondFriend,
		type FriendsOverview
	} from '#lib/online/friends.svelte.ts';

	let data = $state<FriendsOverview | null>(null);
	let code = $state('');
	let message = $state('');
	let error = $state('');
	let copied = $state('');

	onMount(async () => {
		await loadAccount();
		if (account.user) await refresh();
	});

	async function refresh() {
		try {
			data = await friendsOverview();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function run(fn: () => Promise<unknown>, ok?: string) {
		error = '';
		message = '';
		try {
			await fn();
			if (ok) message = ok;
			await refresh();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function add() {
		const c = code.trim().replace(/^#/, '').toUpperCase();
		if (!/^[A-Z0-9]{6}$/.test(c)) return (error = 'A friend code is 6 letters and numbers, like K7QM2X.');
		await run(async () => {
			const r = await requestFriend(c);
			message = r.status === 'friends' ? `You and ${r.name} are now friends.` : `Request sent to ${r.name}.`;
			code = '';
		});
	}

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 1600);
		} catch {
			/* clipboard unavailable: the text is on screen to copy by hand */
		}
	}

	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
	async function share() {
		if (!data) return;
		try {
			await navigator.share({ title: APP_NAME, text: `Play mahjong with me on ${APP_NAME}!`, url: friendLinkUrl(data.myLink) });
		} catch {
			/* cancelled */
		}
	}
</script>

<svelte:head><title>Friends · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Friends</p>
	<h1>Play with your people</h1>

	{#if !account.loaded}
		<p class="muted">Loading…</p>
	{:else if !account.user}
		<p class="muted">Friends need an account, so we know who's who.</p>
		{#if account.enabled && account.google}<button class="btn primary" onclick={() => signIn('/friends')}>Sign in with Google</button>{/if}
	{:else if data}
		<section class="card share">
			<div>
				<p class="label">Your friend code</p>
				<p class="code">#{data.myCode}</p>
				<button class="btn" onclick={() => copy(data!.myCode, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
				<p class="hint">Friends type this in, and you accept their request.</p>
			</div>
			<div>
				<p class="label">Your add-me link</p>
				<p class="link">{friendLinkUrl(data.myLink)}</p>
				<span class="row">
					{#if canShare}<button class="btn primary" onclick={share}>Share</button>{/if}
					<button class="btn" onclick={() => copy(friendLinkUrl(data!.myLink), 'link')}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
				</span>
				<p class="hint">
					Anyone who opens it can accept, even if they're new, and you're friends. You don't need to approve again.
					<button class="linkish" onclick={() => run(newFriendLink, 'New link made. The old one no longer works.')}>Make a new link</button>
				</p>
			</div>
		</section>

		<form
			class="add"
			onsubmit={(e) => {
				e.preventDefault();
				add();
			}}
		>
			<input bind:value={code} maxlength="7" placeholder="Friend code, e.g. K7QM2X" autocapitalize="characters" />
			<button class="btn dark">Add friend</button>
		</form>
		{#if message}<p class="ok">{message}</p>{/if}
		{#if error}<p class="err">{error}</p>{/if}

		{#if data.invites.length}
			<h2>Invitations</h2>
			<ul class="list">
				{#each data.invites as inv (inv.id)}
					<li class="invite">
						<span><b>{inv.from.name}</b> invited you to a {inv.variantName} table</span>
						<span class="row">
							<a class="btn primary" href="/online/{inv.code}">Join</a>
							<button class="btn" onclick={() => run(() => dismissInvite(inv.id))}>Not now</button>
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.incoming.length}
			<h2>Requests</h2>
			<ul class="list">
				{#each data.incoming as f (f.code)}
					<FriendRow friend={f}>
						<button class="btn primary" onclick={() => run(() => respondFriend(f.code, true), `You and ${f.name} are now friends.`)}>Accept</button>
						<button class="btn" onclick={() => run(() => respondFriend(f.code, false))}>Decline</button>
					</FriendRow>
				{/each}
			</ul>
		{/if}

		<h2>Friends {data.friends.length ? `· ${data.friends.length}` : ''}</h2>
		{#if data.friends.length}
			<ul class="list">
				{#each [...data.friends].sort((a, b) => Number(b.online || b.atTable) - Number(a.online || a.atTable)) as f (f.code)}
					<FriendRow friend={f}>
						<button class="btn small" onclick={() => confirm(`Remove ${f.name} from your friends?`) && run(() => removeFriend(f.code))}>Remove</button>
					</FriendRow>
				{/each}
			</ul>
			<p class="hint">To play together, open a table from <a href="/online">Online</a> and invite them from its lobby.</p>
		{:else}
			<p class="muted">No friends yet. Share your link, or add someone by their code.</p>
		{/if}

		{#if data.outgoing.length}
			<h2>Waiting for an answer</h2>
			<ul class="list">
				{#each data.outgoing as f (f.code)}
					<FriendRow friend={f}>
						<button class="btn small" onclick={() => run(() => removeFriend(f.code))}>Cancel</button>
					</FriendRow>
				{/each}
			</ul>
		{/if}

		{#if data.suggestions.length}
			<h2>Played with you recently</h2>
			<ul class="list">
				{#each data.suggestions as f (f.code)}
					<FriendRow friend={f}>
						<button class="btn small" onclick={() => run(() => requestFriend(f.code), `Request sent to ${f.name}.`)}>Add</button>
					</FriendRow>
				{/each}
			</ul>
		{/if}
	{:else if error}
		<p class="err">{error}</p>
	{/if}
</main>

<style>
	.kicker {
		margin-top: 32px;
	}
	h1 {
		margin: 4px 0 16px;
		font-size: clamp(1.8rem, 4vw, 2.4rem);
	}
	h2 {
		margin: 28px 0 10px;
		font-size: 1.2rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 18px;
	}
	.share {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}
	@media (max-width: 640px) {
		.share {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.label {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.code {
		margin: 4px 0 10px;
		font: 800 2rem var(--font);
		letter-spacing: 0.12em;
		color: var(--t-red);
	}
	.link {
		margin: 6px 0 10px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--bg-2);
		font: 0.85rem ui-monospace, monospace;
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.hint {
		margin: 8px 0 0;
		font-size: 0.85rem;
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
	.add {
		display: flex;
		gap: 8px;
		margin-top: 16px;
		max-width: 520px;
	}
	.add input {
		font: 600 1rem var(--font);
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		text-transform: uppercase;
	}
	.add input::placeholder {
		text-transform: none;
	}
	.add .btn {
		flex: none;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 640px;
	}
	.invite {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--card);
		border: 1px solid var(--accent);
	}
	.small {
		padding: 6px 12px;
		font-size: 0.85rem;
	}
	.muted {
		color: var(--ink-2);
	}
	.ok {
		color: var(--good);
		font-weight: 600;
	}
	.err {
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
		max-width: 520px;
	}
</style>
