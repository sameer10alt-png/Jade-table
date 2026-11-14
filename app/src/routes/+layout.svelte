<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { APP_NAME } from '#lib/brand.ts';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { account, loadAccount, signIn } from '#lib/online/account.svelte.ts';
	import { startNotify, stopNotify } from '#lib/online/friends.svelte.ts';
	import Bell from '#lib/components/Bell.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	onMount(() => {
		loadAccount();
	});
	// badge polling runs only while someone is signed in (it also marks them online for friends)
	$effect(() => {
		if (account.user) startNotify();
		else stopNotify();
	});
	// phones: the links fold into a ☰ menu (the bell stays outside, so invites are one tap away)
	let menu = $state(false);
	let menuBox = $state<HTMLElement>();
	$effect(() => {
		void page.url.pathname;
		menu = false;
	});
	const here = (p: string) => (p === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(p));
	const bare = $derived(page.route.id === '/table' || page.route.id === '/online/[code]');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{APP_NAME}</title>
</svelte:head>

{#if !bare}
	<header class="top">
		<div class="wrap bar">
			<a class="logo" href="/"><span class="mark">麻</span>{APP_NAME}</a>
			<nav bind:this={menuBox}>
				<a class="link" href="/" class:on={here('/')}>Play</a>
				<a class="link" href="/online" class:on={here('/online')}>Online</a>
				<a class="link" href="/rules/taiwanese" class:on={here('/rules')}>Rules</a>
				<a class="link" href="/practice" class:on={here('/practice')}>Practice</a>
				<a class="link" href="/ask" class:on={here('/ask')}>Coach</a>
				{#if account.user}
					<a class="link" href="/progress" class:on={here('/progress')}>Progress</a>
					<a class="link" href="/friends" class:on={here('/friends')}>Friends</a>
					<Bell />
					<a class="me desk" href="/account" title="Your account" aria-label="Your account">
						{#if account.user.picture}
							<img src={account.user.picture} alt="" referrerpolicy="no-referrer" />
						{:else}
							<span>{account.user.name.slice(0, 1).toUpperCase()}</span>
						{/if}
					</a>
				{:else if account.enabled && account.google}
					<button class="signin desk" onclick={() => signIn()}>Sign in</button>
				{/if}
				<button class="burger" class:on={menu} aria-label="Menu" aria-expanded={menu} onclick={() => (menu = !menu)}>
					{#if menu}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
					{:else}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
					{/if}
				</button>
				{#if menu}
					<div class="sheet">
						<a href="/" class:on={here('/')}>Play</a>
						<a href="/online" class:on={here('/online')}>Online</a>
						{#if account.user}<a href="/friends" class:on={here('/friends')}>Friends</a>{/if}
						<a href="/rules/taiwanese" class:on={here('/rules')}>Rules</a>
						<a href="/practice" class:on={here('/practice')}>Practice</a>
						{#if account.user}<a href="/progress" class:on={here('/progress')}>Progress</a>{/if}
						<a href="/ask" class:on={here('/ask')}>Coach</a>
						<hr />
						{#if account.user}
							<a class="acct" href="/account" class:on={here('/account')}>
								<span class="me">
									{#if account.user.picture}<img src={account.user.picture} alt="" referrerpolicy="no-referrer" />{:else}<span>{account.user.name.slice(0, 1).toUpperCase()}</span>{/if}
								</span>
								<span>{account.user.name}<small>Your account</small></span>
							</a>
						{:else if account.enabled && account.google}
							<button class="signin wide" onclick={() => signIn()}>Sign in with Google</button>
						{/if}
					</div>
				{/if}
			</nav>
		</div>
	</header>
{/if}

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (menu = false)}
	onclick={(e) => menu && menuBox && !e.composedPath().includes(menuBox) && (menu = false)}
/>

{@render children()}

<!-- outside the header on purpose: pop-ups show on the game table too -->
{#if account.user}<Toasts />{/if}

{#if !bare}
	<footer class="wrap foot">
		<span>{APP_NAME} · Just for fun: points are for bragging rights only.</span>
		<span class="links"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
	</footer>
{/if}

<style>
	.top {
		border-bottom: 1px solid var(--line);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 60px;
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.2rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 40px;
		border-radius: 6px;
		background: var(--t-face);
		color: var(--t-red);
		box-shadow: 0 3px 0 var(--t-edge);
		font-family: 'Noto Serif SC', serif;
		font-size: 1.2rem;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
		padding: 8px 14px;
		border-radius: 999px;
		text-decoration: none;
		font-weight: 600;
		color: var(--ink-2);
	}
	nav {
		align-items: center;
	}
	.me {
		padding: 0 !important;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		margin-left: 4px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--felt) !important;
		color: var(--felt-ink) !important;
		font-weight: 800;
	}
	.me img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.signin {
		margin-left: 6px;
		padding: 8px 14px;
		border-radius: 999px;
		border: 0;
		background: var(--felt);
		color: var(--felt-ink);
		font: 700 0.9rem var(--font);
		cursor: pointer;
	}
	.burger {
		display: none;
		place-items: center;
		width: 40px;
		height: 40px;
		margin-left: 2px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.burger.on,
	.burger:hover {
		background: var(--bg-2);
	}
	.burger svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.sheet {
		position: fixed;
		top: 61px;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		padding: 8px 12px 14px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.15);
		animation: sheet 0.18s ease-out;
	}
	@keyframes sheet {
		from {
			transform: translateY(-8px);
			opacity: 0;
		}
	}
	.sheet a {
		padding: 13px 14px;
		border-radius: 12px;
		font-size: 1.05rem;
		color: var(--ink);
	}
	.sheet hr {
		width: 100%;
		margin: 6px 0;
		border: 0;
		border-top: 1px solid var(--line);
	}
	.acct {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.acct .me {
		margin: 0;
	}
	.acct small {
		display: block;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--ink-2);
	}
	.signin.wide {
		margin: 6px 0 0;
		padding: 13px;
		font-size: 1rem;
	}
	/* phones: links fold into the ☰ menu */
	@media (max-width: 700px) {
		.link,
		.desk {
			display: none;
		}
		.burger {
			display: grid;
		}
	}
	@media (max-width: 420px) {
		.logo {
			font-size: 1.05rem;
		}
	}
	nav a.on,
	nav a:hover {
		color: var(--ink);
		background: var(--bg-2);
	}
	.foot .links {
		margin-left: 12px;
	}
	.foot a {
		color: var(--ink-2);
	}
	.foot {
		padding-top: 48px;
		padding-bottom: 32px;
		color: var(--ink-2);
		font-size: 0.85rem;
	}
</style>
