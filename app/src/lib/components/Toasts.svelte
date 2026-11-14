<script lang="ts">
	// Pop-ups for new notifications (friend requests, accepts, invites, someone joining your
	// table). They show on every screen, the game table included, while the site is open.
	// Each pops up once: what you've seen is remembered in this browser.
	import { page } from '$app/state';
	import { describeNote, goToTable, notify, refreshNotify, respondFriend, type Note } from '#lib/online/friends.svelte.ts';

	type Toast = { key: string; note: Note } | { key: string; text: string };
	let toasts = $state<Toast[]>([]);
	const SEEN = 'jt_seen_notes';

	function loadSeen(): string[] {
		try {
			return JSON.parse(localStorage.getItem(SEEN) ?? '[]');
		} catch {
			return [];
		}
	}
	function saveSeen(list: string[]) {
		try {
			localStorage.setItem(SEEN, JSON.stringify(list.slice(-100)));
		} catch {
			/* private mode: pop-ups may repeat after a reload, that's all */
		}
	}

	const onTable = $derived(page.route.id === '/online/[code]' || page.route.id === '/table');
	const tableHere = $derived(page.route.id === '/online/[code]' ? (page.params.code ?? '').toUpperCase() : '');

	$effect(() => {
		const notes = notify.latest;
		const seen = loadSeen();
		const fresh: Toast[] = [];
		for (const n of notes) {
			const key = `n:${n.id}`;
			if (seen.includes(key)) continue;
			seen.push(key);
			// nothing to say: already answered, or about the table you're sitting at
			if ((n.kind === 'friend_request' || n.kind === 'invite') && !n.active) continue;
			if (n.table && n.table === tableHere) continue;
			fresh.push({ key, note: n });
		}
		if (!fresh.length) return;
		saveSeen(seen);
		toasts = [...toasts, ...fresh.reverse()].slice(-3);
		for (const t of fresh) setTimeout(() => close(t.key), 'note' in t && t.note.kind === 'invite' ? 30_000 : 15_000);
	});

	function close(key: string) {
		toasts = toasts.filter((t) => t.key !== key);
	}

	async function act(t: { key: string; note: Note }) {
		const n = t.note;
		const what = describeNote(n).action;
		if (what === 'accept' && n.code) {
			close(t.key);
			try {
				await respondFriend(n.code, true);
				const done = { key: `done:${t.key}`, text: `You and ${n.name} are now friends` };
				toasts = [...toasts, done];
				setTimeout(() => close(done.key), 3000);
			} catch {
				/* already answered elsewhere */
			}
			refreshNotify();
		} else if ((what === 'join' || what === 'open') && n.table) {
			if (goToTable(n.table, onTable, n.name)) close(t.key);
		}
	}

	const LABEL = { accept: 'Accept', join: 'Join', open: 'Open' };
</script>

{#if toasts.length}
	<div class="stack" role="status" aria-live="polite">
		{#each toasts as t (t.key)}
			<div class="toast">
				{#if 'text' in t}
					<span class="text">✓ {t.text}</span>
				{:else}
					{@const d = describeNote(t.note)}
					<span class="avatar">
						{#if t.note.picture}<img src={t.note.picture} alt="" referrerpolicy="no-referrer" />{:else}{t.note.name.slice(0, 1).toUpperCase()}{/if}
					</span>
					<span class="text"><b>{t.note.name}</b> {d.rest}</span>
					{#if d.action}<button class="go" onclick={() => act(t)}>{LABEL[d.action]}</button>{/if}
					<button class="x" aria-label="Close" title="Close (it stays in the bell)" onclick={() => close(t.key)}>×</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.stack {
		position: fixed;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(440px, calc(100vw - 20px));
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 10px 10px 12px;
		border-radius: 14px;
		background: var(--t-face);
		color: #1d1a12;
		border: 2px solid var(--accent);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
		animation: drop 0.25s ease-out;
	}
	@keyframes drop {
		from {
			transform: translateY(-12px);
			opacity: 0;
		}
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
		font-size: 0.92rem;
		line-height: 1.25;
	}
	.go {
		flex: none;
		padding: 8px 14px;
		border-radius: 999px;
		border: 0;
		background: var(--accent);
		color: var(--accent-ink);
		font: 800 0.85rem var(--font);
		cursor: pointer;
	}
	.x {
		flex: none;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: #5b5446;
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
	}
	.x:hover {
		background: rgba(0, 0, 0, 0.06);
	}
</style>
