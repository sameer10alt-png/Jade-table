<script lang="ts">
	import type { Player } from '#lib/engine/types.ts';
	import { WIND_NAMES, WIND_SHORT } from '#lib/engine/tiles.ts';
	import Tile from './Tile.svelte';
	import FriendIcon from './FriendIcon.svelte';
	import Avatar from './Avatar.svelte';
	import type { Profile } from '#lib/online/profile.ts';
	import type { SeatFriend } from '#lib/online/friends.svelte.ts';

	// Opponents get as little space as possible: their hidden tiles are only a number,
	// so we show a count badge and their called sets, never rows of tile backs.
	let {
		player,
		wind,
		dealer,
		active,
		layout,
		side = 'left',
		reveal = false,
		scoreLabel,
		friend = null,
		onAddFriend,
		hideBots = false,
		profile = null
	}: {
		player: Player;
		wind: number;
		dealer: boolean;
		active: boolean;
		layout: 'rail' | 'top' | 'card';
		side?: 'left' | 'right';
		reveal?: boolean;
		scoreLabel: string;
		/** online, signed in: your friendship with this player (null = nothing to show) */
		friend?: SeatFriend;
		onAddFriend?: () => void;
		/** online tables: don't reveal which seats are bots (they play as named "people") */
		hideBots?: boolean;
		/** online: picture and record shown on the seat (tap the name for the card) */
		profile?: Profile | null;
	} = $props();
	let showCard = $state(false);
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const sinceLabel = $derived(profile?.since ? `${MONTHS[Number(profile.since.slice(5, 7)) - 1]} ${profile.since.slice(0, 4)}` : null);
	const winPct = $derived(profile && profile.hands ? Math.round((profile.wins / profile.hands) * 100) : null);

	const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
	const isBot = $derived(!!player.bot && !hideBots);
	const level = $derived(isBot ? LEVEL[player.bot!] : profile?.hands ? `${profile.hands} hands · ${winPct}% wins` : 'Player');
</script>

{#if layout !== 'rail'}
	<div class="top" class:card={layout === 'card'} class:active>
		<div class="row">
			<span class="wind" class:dealer title={dealer ? 'Dealer' : (WIND_NAMES[wind] ?? 'Seat not decided yet')}>{WIND_SHORT[wind] ?? '·'}</span>
			<div class="who">
				<span class="nameline">{#if profile}<button class="pbtn" onclick={() => (showCard = !showCard)} aria-label="Show {player.name}'s profile"><Avatar name={player.name} picture={profile.picture} size={22} /></button>{/if}<span class="name">{player.name}{isBot ? ' (Bot)' : ''}{dealer ? ' · Dealer' : ''}</span><FriendIcon state={friend} onAdd={onAddFriend} /></span>
				<span class="lvl">{level}</span>
				{#if layout === 'card'}
					<span class="inhand">{player.hand.length} in hand · {player.flowers.length} {player.flowers.length === 1 ? 'flower' : 'flowers'}</span>
				{/if}
			</div>
			{#if player.riichi}<span class="riichi">Riichi</span>{/if}
			<span class="score">{scoreLabel}</span>
			<span class="count" title="Tiles in hand">{player.hand.length}</span>
		</div>
		<div class="sets">
			{#if reveal}
				<span class="group">{#each player.hand as t (t.id)}<Tile tile={t} size="sm" />{/each}</span>
			{/if}
			{#each player.melds as m, i (i)}
				<span class="group">
					{#each m.tiles as t, j (t.id)}
						<Tile tile={m.concealed && m.type === 'kong' && (j === 0 || j === 3) ? null : t} size={layout === 'card' ? 'lg' : 'md'} glow={t.id === m.claimed} />
					{/each}
				</span>
			{/each}
			{#if player.flowers.length}
				<span class="group">{#each player.flowers as t (t.id)}<Tile tile={t} size="sm" />{/each}</span>
			{/if}
		</div>
	</div>
{:else}
	<div class="rail {side}" class:active>
		<span class="wind" class:dealer title={dealer ? 'Dealer' : (WIND_NAMES[wind] ?? 'Seat not decided yet')}>{WIND_SHORT[wind] ?? '·'}</span>
		<span class="count" title="Tiles in hand">{player.hand.length}</span>
		<FriendIcon state={friend} onAdd={onAddFriend} />
		{#if player.riichi}<span class="riichi dot" title="Riichi">R</span>{/if}
		<div class="rsets">
			{#each player.melds as m, i (i)}
				<span class="rgroup">
					{#each m.tiles as t, j (t.id)}
						<span class="rot"><span class="in"><Tile tile={m.concealed && m.type === 'kong' && (j === 0 || j === 3) ? null : t} size="sm" glow={t.id === m.claimed} /></span></span>
					{/each}
				</span>
			{/each}
			{#if player.flowers.length}
				<span class="rgroup">{#each player.flowers as t (t.id)}<span class="rot"><span class="in"><Tile tile={t} size="sm" /></span></span>{/each}</span>
			{/if}
		</div>
		<span class="vlabel">
			{#if profile}<button class="pbtn" onclick={() => (showCard = !showCard)} aria-label="Show {player.name}'s profile"><Avatar name={player.name} picture={profile.picture} size={22} /></button>{/if}
			<b>{player.name}{isBot ? ' (Bot)' : ''}</b>
			<em>{level}</em>
			<i>{scoreLabel}</i>
		</span>
	</div>
{/if}

{#if showCard && profile}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="pback" onclick={() => (showCard = false)}>
		<div class="pcard" role="dialog" tabindex="-1" aria-label="{player.name}'s profile" onclick={(e) => e.stopPropagation()}>
			<Avatar name={player.name} picture={profile.picture} size={64} />
			<b class="pname">{player.name}</b>
			{#if sinceLabel}<span class="psince">Playing since {sinceLabel}</span>{/if}
			<div class="pstats">
				<span><b>{profile.hands}</b>hands</span>
				<span><b>{profile.wins}</b>wins</span>
				<span><b>{winPct ?? 0}%</b>win rate</span>
			</div>
			<button class="btn" onclick={() => (showCard = false)}>Close</button>
		</div>
	</div>
{/if}

<style>
	.pbtn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		border-radius: 50%;
	}
	.pbtn:focus-visible {
		outline: 2px solid var(--accent);
	}
	.pback {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, 0.35);
	}
	.pcard {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		min-width: 230px;
		padding: 20px;
		border-radius: 16px;
		background: var(--card, #fff);
		color: var(--ink, #222);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
	}
	.pname {
		font-size: 1.15rem;
	}
	.psince {
		font-size: 0.8rem;
		color: var(--ink-2, #666);
	}
	.pstats {
		display: flex;
		gap: 16px;
		margin: 6px 0;
	}
	.pstats span {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 0.75rem;
		color: var(--ink-2, #666);
	}
	.pstats b {
		font-size: 1.1rem;
		color: var(--ink, #222);
	}
	.wind {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		flex: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.12);
		font-weight: 800;
		font-size: 0.72rem;
	}
	.wind.dealer {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.count {
		display: grid;
		place-items: center;
		min-width: 26px;
		height: 26px;
		font-size: 0.85rem !important;
		padding: 0 5px;
		border-radius: 6px;
		background: var(--t-face);
		color: var(--t-red);
		font-weight: 800;
		font-size: 0.75rem;
		box-shadow: 0 2px 0 var(--t-edge);
	}
	.riichi {
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--t-red);
		color: white;
	}
	.riichi.dot {
		padding: 2px 5px;
	}

	/* across: one slim box */
	.top {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.14);
		transition: box-shadow 200ms;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		line-height: 1.15;
	}
	.nameline {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
	}
	.name {
		font-weight: 700;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lvl,
	.vlabel em {
		font-style: normal;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--felt-ink-2);
	}
	.score {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-size: 0.85rem;
	}
	.sets {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
		min-height: 0;
	}
	.sets:empty {
		display: none;
	}
	/* laptop: three cards across the top, sets aligned left */
	.card {
		height: 100%;
		padding: 12px 14px;
		gap: 10px;
	}
	.card .sets {
		justify-content: flex-start;
		padding-top: 10px;
		border-top: 1px solid var(--felt-line);
		min-height: calc(var(--tile-lg) * 1.4 + 10px);
	}
	.card .sets:empty {
		display: flex;
	}
	.card .name {
		font-size: 1rem;
	}
	.card .wind {
		width: 36px;
		height: 36px;
		font-size: 0.95rem;
	}
	.inhand {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--felt-ink);
		margin-top: 2px;
	}
	.group {
		display: inline-flex;
		gap: 1px;
	}

	/* left / right: thin vertical rails along the screen edges */
	.rail {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		border-radius: 12px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.14);
		min-height: 0;
		overflow: hidden;
		transition: box-shadow 200ms;
	}
	.rsets {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
	}
	/* a tile lying on its side: as wide as the rail allows */
	.rail {
		--tile-sm: var(--rt, 30px);
	}
	.rot {
		position: relative;
		flex: none;
		width: calc(var(--tile-sm) * 1.333 + 2px);
		height: calc(var(--tile-sm) + 4px);
	}
	.rot .in {
		position: absolute;
		left: 50%;
		top: 50%;
		line-height: 0;
		transform: translate(-50%, -50%) rotate(90deg);
	}
	.rail.right .rot .in {
		transform: translate(-50%, -50%) rotate(-90deg);
	}
	.rgroup {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.vlabel {
		margin-top: auto;
		writing-mode: vertical-rl;
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 0.75rem;
		white-space: nowrap;
	}
	.rail.left .vlabel {
		transform: rotate(180deg);
	}
	.vlabel b {
		font-weight: 700;
	}
	.vlabel i {
		font-style: normal;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.active {
		box-shadow: 0 0 0 2px var(--accent);
	}
</style>
