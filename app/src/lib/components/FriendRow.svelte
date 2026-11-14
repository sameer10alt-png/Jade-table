<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Friend } from '#lib/online/friends.svelte.ts';

	let { friend, children }: { friend: Friend; children?: Snippet } = $props();
	const status = $derived(friend.atTable ? 'At a table' : friend.online ? 'Online' : 'Offline');
</script>

<li class="row">
	<span class="avatar">
		{#if friend.picture}<img src={friend.picture} alt="" referrerpolicy="no-referrer" />{:else}{friend.name.slice(0, 1).toUpperCase()}{/if}
		<span class="dot" class:on={friend.online || friend.atTable} class:table={friend.atTable}></span>
	</span>
	<span class="who">
		<b>{friend.name}</b>
		<small>{status}</small>
	</span>
	<span class="actions">{@render children?.()}</span>
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.avatar {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--felt);
		color: var(--felt-ink);
		font-weight: 800;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--card);
		background: var(--line);
	}
	.dot.on {
		background: var(--good);
	}
	.dot.table {
		background: var(--accent);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.who b {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		color: var(--ink-2);
	}
	.actions {
		display: flex;
		gap: 6px;
		flex: none;
	}
</style>
