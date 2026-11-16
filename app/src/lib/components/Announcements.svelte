<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { account } from '#lib/online/account.svelte.ts';

	// Messages an admin puts on players' screens: banners across the top, pop-ups in the middle,
	// and a maintenance screen. Checked on load, on every page change and every 20 seconds.
	type Item = { id: number; text: string; style: 'banner' | 'popup'; level: 'info' | 'warn' | 'celebrate'; link: string | null };
	let items = $state<Item[]>([]);
	let maintenance = $state<string | null>(null);
	let seen = $state<number[]>([]);
	const KEY = 'pt.announce.seen';

	function load() {
		fetch('/api/announcements')
			.then((r) => r.json())
			.then((d: { items?: Item[]; maintenance?: string | null }) => {
				items = d.items ?? [];
				maintenance = d.maintenance ?? null;
			})
			.catch(() => {});
	}
	function dismiss(id: number) {
		seen = [...seen, id].slice(-200);
		try {
			localStorage.setItem(KEY, JSON.stringify(seen));
		} catch {
			/* private mode: dismissed for this visit only */
		}
	}
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		try {
			seen = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		} catch {
			seen = [];
		}
		timer = setInterval(load, 20_000);
	});
	onDestroy(() => clearInterval(timer));
	$effect(() => {
		void page.url.pathname;
		void account.user;
		load();
	});

	const banners = $derived(items.filter((i) => i.style === 'banner' && !seen.includes(i.id)));
	const popup = $derived(items.find((i) => i.style === 'popup' && !seen.includes(i.id)) ?? null);
	const ICON = { info: '📣', warn: '⚠️', celebrate: '🎉' };
</script>

{#if maintenance && !page.url.pathname.startsWith('/admin') && !page.url.pathname.startsWith('/signin')}
	<div class="maint">
		<div class="mbox">
			<div class="mi">🛠️</div>
			<h2>Back soon</h2>
			<p>{maintenance}</p>
		</div>
	</div>
{/if}

{#if banners.length}
	<div class="banners">
		{#each banners as b (b.id)}
			<div class="banner {b.level}" role="status">
				<span>{ICON[b.level]}</span>
				<span class="bt">{b.text}{#if b.link}&nbsp;<a href={b.link}>Open</a>{/if}</span>
				<button aria-label="Dismiss" onclick={() => dismiss(b.id)}>✕</button>
			</div>
		{/each}
	</div>
{/if}

{#if popup}
	<div class="pback" role="presentation">
		<div class="pop {popup.level}" role="alertdialog" aria-modal="true" aria-label="Message">
			<div class="pi">{ICON[popup.level]}</div>
			<p>{popup.text}</p>
			<div class="pbtns">
				{#if popup.link}<a class="btn primary" href={popup.link} onclick={() => dismiss(popup!.id)}>Open</a>{/if}
				<button class="btn" onclick={() => dismiss(popup!.id)}>OK</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.banners {
		position: fixed;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 90;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: min(680px, calc(100% - 16px));
	}
	.banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px 10px 14px;
		border-radius: 12px;
		background: #1f3a5f;
		color: #fff;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
		font-weight: 600;
	}
	.banner.warn {
		background: #8a4b0f;
	}
	.banner.celebrate {
		background: #2f6f4e;
	}
	.bt {
		flex: 1;
	}
	.bt a {
		color: inherit;
		text-decoration: underline;
	}
	.banner button {
		border: 0;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		border-radius: 8px;
		width: 28px;
		height: 28px;
		cursor: pointer;
	}
	.pback,
	.maint {
		position: fixed;
		inset: 0;
		z-index: 95;
		display: grid;
		place-items: center;
		background: rgba(6, 10, 14, 0.6);
		padding: 16px;
	}
	.maint {
		z-index: 99;
		background: var(--bg, #f3f1ec);
	}
	.pop,
	.mbox {
		max-width: 440px;
		width: 100%;
		padding: 24px;
		border-radius: 16px;
		background: var(--card, #fff);
		color: var(--ink, #222);
		text-align: center;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
	}
	.pi,
	.mi {
		font-size: 2.2rem;
	}
	.pop p,
	.mbox p {
		font-size: 1.05rem;
		white-space: pre-wrap;
	}
	.pbtns {
		display: flex;
		gap: 8px;
		justify-content: center;
	}
</style>
