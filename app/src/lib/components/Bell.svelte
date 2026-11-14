<script lang="ts">
	// The bell in the header: everything that happened to you in the last 30 days, newest first.
	// Opening it marks everything read.
	import { page } from '$app/state';
	import {
		describeNote,
		goToTable,
		markNotesRead,
		notifications,
		notify,
		refreshNotify,
		respondFriend,
		timeAgo,
		type Note
	} from '#lib/online/friends.svelte.ts';

	let open = $state(false);
	let notes = $state<Note[] | null>(null);
	let box = $state<HTMLElement>();
	const onTable = $derived(page.route.id === '/online/[code]' || page.route.id === '/table');

	async function toggle() {
		open = !open;
		if (!open) return;
		try {
			notes = await notifications();
			if (notes.some((n) => !n.read)) {
				await markNotesRead();
				notify.unread = 0;
			}
		} catch {
			notes = [];
		}
	}

	async function act(n: Note) {
		const what = describeNote(n).action;
		if (what === 'accept' && n.code) {
			try {
				await respondFriend(n.code, true);
			} catch {
				/* already answered */
			}
			notes = await notifications().catch(() => notes);
			refreshNotify();
		} else if (n.table) {
			goToTable(n.table, onTable, n.name);
		}
	}

	// close when tapping outside or pressing Escape, and when the page changes.
	// composedPath, not contains(): the tapped element may already be re-rendered away.
	function outside(e: MouseEvent) {
		if (open && box && !e.composedPath().includes(box)) open = false;
	}
	$effect(() => {
		void page.url.pathname;
		open = false;
	});
	const LABEL = { accept: 'Accept', join: 'Join', open: 'Open' };
</script>

<svelte:window onclick={outside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="bellbox" bind:this={box}>
	<button class="bell" class:on={open} onclick={toggle} aria-label={notify.unread ? `Notifications, ${notify.unread} new` : 'Notifications'} aria-expanded={open}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
		{#if notify.unread}<span class="badge">{notify.unread > 9 ? '9+' : notify.unread}</span>{/if}
	</button>

	{#if open}
		<div class="panel" role="dialog" aria-label="Notifications">
			<div class="head">
				<b>Notifications</b>
			</div>
			{#if notes === null}
				<p class="empty">Loading…</p>
			{:else if !notes.length}
				<p class="empty">Nothing yet. Friend requests, invites and people joining your tables show up here.</p>
			{:else}
				<ul>
					{#each notes as n (n.id)}
						{@const d = describeNote(n)}
						<li class:unread={!n.read}>
							<span class="avatar">
								{#if n.picture}<img src={n.picture} alt="" referrerpolicy="no-referrer" />{:else}{n.name.slice(0, 1).toUpperCase()}{/if}
							</span>
							<span class="text">
								<span><b>{n.name}</b> {d.rest}</span>
								<small>{timeAgo(n.createdAt)}</small>
							</span>
							{#if d.action}<button class="go" onclick={() => act(n)}>{LABEL[d.action]}</button>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.bellbox {
		position: relative;
	}
	.bell {
		position: relative;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		margin-left: 2px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}
	.bell:hover,
	.bell.on {
		background: var(--bg-2);
		color: var(--ink);
	}
	svg {
		width: 21px;
		height: 21px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.badge {
		position: absolute;
		top: 2px;
		right: 0;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--t-red);
		color: #fff;
		font-size: 0.68rem;
		font-weight: 800;
		line-height: 18px;
		text-align: center;
	}
	.panel {
		position: fixed;
		top: 62px;
		right: max(10px, calc((100vw - 1180px) / 2));
		z-index: 50;
		width: min(380px, calc(100vw - 20px));
		max-height: min(70vh, 560px);
		overflow: auto;
		border-radius: 16px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.2);
	}
	.head {
		position: sticky;
		top: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
		background: var(--card);
		border-bottom: 1px solid var(--line);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 6px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 8px;
		border-radius: 12px;
	}
	li.unread {
		background: var(--bg-2);
	}
	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--felt);
		color: var(--felt-ink);
		font-weight: 800;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-size: 0.9rem;
		line-height: 1.3;
	}
	small {
		color: var(--ink-2);
		font-size: 0.75rem;
	}
	.go {
		flex: none;
		padding: 6px 12px;
		border-radius: 999px;
		border: 0;
		background: var(--accent);
		color: var(--accent-ink);
		font: 800 0.8rem var(--font);
		cursor: pointer;
	}
	.empty {
		margin: 0;
		padding: 18px 16px;
		color: var(--ink-2);
		font-size: 0.9rem;
	}
</style>
