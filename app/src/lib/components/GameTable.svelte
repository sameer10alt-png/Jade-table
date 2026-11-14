<script lang="ts">
	// Draws a table and reports the viewer's moves. It does not run the game:
	// offline the /table page runs it with local bots, online the server runs it.
	import { APP_NAME } from '#lib/brand.ts';
	import Melds from '#lib/components/Melds.svelte';
	import Discards from '#lib/components/Discards.svelte';
	import DicePanel from '#lib/components/DicePanel.svelte';
	import TableMenu from '#lib/components/TableMenu.svelte';
	import Opponent from '#lib/components/Opponent.svelte';
	import Tile from '#lib/components/Tile.svelte';
	import { suggestDiscard } from '#lib/engine/bots.ts';
	import { legal, pendingSeats, seatWind, standings, VARIANTS } from '#lib/engine/game.ts';
	import { shantenOf, winningKinds } from '#lib/engine/hand.ts';
	import { kindName, sortTiles, WIND_NAMES, WIND_SHORT, type Tile as T } from '#lib/engine/tiles.ts';
	import type { Action, ClaimOption, GameState } from '#lib/engine/types.ts';
	import type { SeatFriend } from '#lib/online/friends.svelte.ts';

	let {
		game,
		seat,
		onAction,
		onNext,
		onLeave,
		onQuit,
		onPlayAgain,
		hints = $bindable(false),
		speed = $bindable(),
		online = false,
		error = '',
		autoplay = $bindable(false),
		allowAutoplay = false,
		nextLabel = 'Next hand',
		nextDisabled = false,
		tag = '',
		quitLabel = 'End this table',
		friends = [],
		onAddFriend,
		hideBots = false
	}: {
		game: GameState;
		/** the viewer's seat; they are always drawn at the bottom */
		seat: number;
		onAction: (a: Action) => void;
		onNext: () => void;
		onLeave: () => void;
		onQuit?: () => void;
		onPlayAgain?: () => void;
		hints?: boolean;
		/** offline only: bot speed (shown in Settings when set) */
		speed?: 'slow' | 'normal' | 'fast';
		online?: boolean;
		error?: string;
		autoplay?: boolean;
		allowAutoplay?: boolean;
		nextLabel?: string;
		nextDisabled?: boolean;
		/** small label in the header, e.g. the online table code */
		tag?: string;
		quitLabel?: string;
		/** online, signed in: your friendship with each seat, for the small add-friend icons */
		friends?: SeatFriend[];
		onAddFriend?: (seat: number) => void;
		/** online tables: play filled seats as named "people", hiding the bot tag */
		hideBots?: boolean;
	} = $props();

	const ME = $derived(seat);
	let selected = $state<number | null>(null);
	let riichiMode = $state(false);
	let passPick = $state<number[]>([]);
	let showLog = $state(false);

	// One move per game update: ignore further taps until the answer arrives (or an error does),
	// so a double-tap on a slow connection can't send the same move twice.
	let sentAt = $state<string | null>(null);
	const stateKey = $derived(`${game.seq}:${game.phase}:${pendingSeats(game).join(',')}`);
	$effect(() => {
		stateKey; // a new game update releases the lock
		sentAt = null;
	});
	$effect(() => {
		if (error) sentAt = null; // the move was refused: let the player try again
	});
	function send(a: Action) {
		if (sentAt === stateKey) return;
		sentAt = stateKey;
		onAction(a);
	}
	// Riichi defence depends on reading each player's discards, so default to that view there.
	let discardMode = $state<'order' | 'player'>('order');
	let discardFit = $state(false);
	let modeSetFor = '';
	$effect(() => {
		if (modeSetFor !== game.opts.variant) {
			modeSetFor = game.opts.variant;
			discardMode = game.opts.variant === 'riichi' ? 'player' : 'order';
		}
	});
	const v = $derived(game ? VARIANTS[game.opts.variant] : null);
	const me = $derived(game?.players[ME]);
	const L = $derived(game ? legal(game, ME) : null);
	const myTurn = $derived(!!game && game.phase === 'turn' && game.turn === ME);
	const hand = $derived(me ? sortTiles(me.hand.filter((t) => t.id !== (myTurn ? game!.drawn?.id : -1))) : []);
	const drawn = $derived(myTurn && game?.drawn && me?.hand.some((t) => t.id === game!.drawn!.id) ? game.drawn : null);
	const lastDiscardId = $derived.by(() => {
		if (!game) return null;
		if (game.claim) return game.claim.tile.id;
		const ev = [...game.log].reverse().find((e) => e.type === 'discard');
		return ev?.tile?.id ?? null;
	});

	// ---- hints ----
	const hint = $derived.by(() => {
		if (!game || !me || !v || !hints) return null;
		if (game.phase !== 'turn' && game.phase !== 'claim') return null;
		const suggestion = myTurn ? suggestDiscard(game, ME) : null;
		let base = me.hand;
		if (myTurn && suggestion !== null) base = me.hand.filter((t) => t.id !== suggestion);
		if (myTurn && suggestion === null) return null;
		const sh = shantenOf(base, me.melds.length, v.sets, v.shantenSpecials).shanten;
		const waits = sh === 0 ? winningKinds(base, me.melds.length, v.sets, v.special) : [];
		return { suggestion, sh, waits };
	});

	// reset local UI state when it is no longer relevant
	$effect(() => {
		if (!myTurn) {
			selected = null;
			riichiMode = false;
		}
		if (game?.phase !== 'passing') passPick = [];
	});

	// ---- human actions ----
	function clickTile(t: T) {
		if (!game || !L) return;
		if (game.phase === 'passing' && L.pass3) {
			if (t.k === 'jk') return;
			passPick = passPick.includes(t.id) ? passPick.filter((x) => x !== t.id) : passPick.length < 3 ? [...passPick, t.id] : passPick;
			return;
		}
		if (!myTurn) return;
		const allowed = riichiMode ? L.riichi : L.discard;
		if (!allowed.includes(t.id)) return;
		if (selected === t.id) discard(t.id);
		else selected = t.id;
	}

	function discard(id: number) {
		send({ t: 'discard', tile: id, riichi: riichiMode || undefined });
		selected = null;
		riichiMode = false;
	}

	function claim(o: ClaimOption) {
		send({ t: 'claim', option: o });
	}

	function tileEnabled(t: T) {
		if (!game || !L) return false;
		if (game.phase === 'passing') return L.pass3 && t.k !== 'jk';
		if (!myTurn) return false;
		return (riichiMode ? L.riichi : L.discard).includes(t.id);
	}

	// ---- labels ----
	const fmt = (n: number) => (v?.riichi ? n.toLocaleString() : n > 0 ? `+${n}` : String(n));
	const claimWord = (o: ClaimOption) => {
		if (o.type === 'win') return v?.riichi ? 'Ron' : 'Mahjong';
		if (o.type === 'pung') return v?.riichi ? 'Pon' : 'Pong';
		if (o.type === 'kong') return v?.riichi ? 'Kan' : 'Gong';
		return v?.riichi ? 'Chii' : v?.id === 'taiwanese' ? 'Sheung' : 'Chow';
	};
	const tileOf = (id: number) => me?.hand.find((t) => t.id === id);
	const statusText = $derived.by(() => {
		if (!game || !L) return '';
		if (game.phase === 'seating') return L.roll ? 'Roll the dice: the highest total sits East' : 'Waiting for the others to roll…';
		if (game.phase === 'wallbreak') return L.roll ? 'You are the dealer: roll to break the wall' : `${game.players[game.dealer].name} is breaking the wall…`;
		if (game.phase === 'passing') return L.pass3 ? `Goulash: choose 3 tiles to pass ${['right', 'across', 'left'][game.passing!.round]}` : 'Waiting for the others to pass…';
		if (game.phase === 'claim') {
			if (L.claims.length) return `${game.players[game.claim!.from].name} discarded ${kindName(game.claim!.tile.k)}`;
			return 'Waiting for calls…';
		}
		if (myTurn) return riichiMode ? 'Riichi: choose the tile to discard' : 'Your turn: tap a tile, tap again to discard';
		if (game.phase === 'turn') return `${game.players[game.turn].name} is thinking…`;
		return '';
	});
	// Hand layout: as big as the width allows (max 64px), rows balanced so a lone tile never
	// wraps by itself (17 tiles on a phone -> 9 + 8, on a wide screen -> one row).
	let handW = $state(0);
	// Laptops get their own layout: wide screens want opponents across the top, not rails.
	let innerW = $state(1200);
	const wide = $derived(innerW >= 1024);
	const tileW = $derived.by(() => {
		const w = handW || 600;
		const total = Math.max(1, hand.length + (drawn ? 1 : 0));
		// laptop: the whole hand in one row, as big as fits (max 96px)
		if (wide) return Math.max(40, Math.min(96, Math.floor((w + 4) / total) - 4));
		// phone: 9 per row
		return Math.max(34, Math.min(64, Math.floor(Math.min(w, 1240) / 9) - 5));
	});
	const handCols = $derived.by(() => {
		const total = hand.length + (drawn ? 1 : 0);
		const perRow = Math.max(1, Math.floor(((handW || 600) + 4) / (tileW + 4)));
		const rows = Math.max(1, Math.ceil(total / perRow));
		return Math.max(1, Math.ceil(total / rows));
	});
	// seats relative to the viewer: next player on the right, then across, then left
	const seats = $derived({ right: (ME + 1) % 4, top: (ME + 2) % 4, left: (ME + 3) % 4 });
	const WIND_CHARS = ['東', '南', '西', '北'];
	// Until the seating roll decides who is East, nobody has a wind (or the dealer badge) yet.
	const seated = $derived(game.phase !== 'seating');
	const windOf = (seat: number) => (seated ? seatWind(game, seat) : -1);
	const isDealer = (seat: number) => seated && game.dealer === seat;
	const turnLabel = $derived.by(() => {
		if (!game) return '';
		if (game.phase === 'claim') return 'Calls…';
		if (game.phase === 'passing') return 'Passing';
		if (game.phase === 'seating') return 'Rolling for seats';
		if (game.phase === 'wallbreak') return 'Breaking the wall';
		if (game.phase !== 'turn') return '';
		return game.turn === ME ? 'Your turn' : `${game.players[game.turn].name}'s turn`;
	});
</script>

<svelte:head><title>{v ? v.name : 'Table'} · {APP_NAME}</title></svelte:head>
<svelte:window bind:innerWidth={innerW} />

{#if game && v && me && L}
	<div class="table">
		<header class="hud">
			<button class="icon" onclick={() => (showLog = true)} aria-label="Menu">←</button>
			<div class="info">
				<strong>{WIND_NAMES[game.round]} round · Hand {game.handNo}{#if tag}<em class="tag">{tag}</em>{/if}</strong>
				<span>
					{v.name}
					{#if game.streak}· {v.riichi ? `Honba ${game.streak}` : `Streak ${game.streak}`}{/if}
					{#if game.sticks}· {v.riichi ? `Sticks ${game.sticks}` : `Kitty ${game.sticks}`}{/if}
				</span>
			</div>
			<span class="wall" title="Tiles left in the wall">Wall · <b>{Math.max(0, game.wall.length - v.reserve)}</b></span>
			<button class="icon" onclick={() => (showLog = !showLog)} aria-label="Menu">☰</button>
		</header>

		<div class="board" class:wide>
			{#if wide}
				<div class="cards">
					{#each [seats.left, seats.top, seats.right] as s (s)}
						<Opponent layout="card" player={game.players[s]} friend={friends[s] ?? null} onAddFriend={onAddFriend && (() => onAddFriend(s))} wind={windOf(s)} dealer={isDealer(s)} active={pendingSeats(game).includes(s)} scoreLabel={fmt(game.players[s].score)} reveal={game.phase === 'ended' || game.phase === 'gameover'} {hideBots} />
					{/each}
				</div>
			{:else}
			<div class="b-left">
				<Opponent layout="rail" side="left" player={game.players[seats.left]} friend={friends[seats.left] ?? null} onAddFriend={onAddFriend && (() => onAddFriend(seats.left))} wind={windOf(seats.left)} dealer={isDealer(seats.left)} active={pendingSeats(game).includes(seats.left)} scoreLabel={fmt(game.players[seats.left].score)} {hideBots} />
			</div>
			<div class="b-top">
				<Opponent layout="top" player={game.players[seats.top]} friend={friends[seats.top] ?? null} onAddFriend={onAddFriend && (() => onAddFriend(seats.top))} wind={windOf(seats.top)} dealer={isDealer(seats.top)} active={pendingSeats(game).includes(seats.top)} scoreLabel={fmt(game.players[seats.top].score)} reveal={game.phase === 'ended' || game.phase === 'gameover'} {hideBots} />
			</div>
			{/if}
			<div class="b-mid">
				{#if game.phase === 'seating' || game.phase === 'wallbreak'}
					<DicePanel {game} me={ME} />
				{:else}
				<Discards
					players={game.players}
					winds={[0, 1, 2, 3].map((s) => seatWind(game!, s))}
					order={[seats.top, seats.left, seats.right, ME]}
					lastId={lastDiscardId}
					emblem={WIND_CHARS[seatWind(game, ME)]}
					status={turnLabel}
					{myTurn}
					dora={game.dora}
					bind:mode={discardMode}
					bind:fit={discardFit}
				/>
				{/if}
			</div>
			{#if !wide}
			<div class="b-right">
				<Opponent layout="rail" side="right" player={game.players[seats.right]} friend={friends[seats.right] ?? null} onAddFriend={onAddFriend && (() => onAddFriend(seats.right))} wind={windOf(seats.right)} dealer={isDealer(seats.right)} active={pendingSeats(game).includes(seats.right)} scoreLabel={fmt(game.players[seats.right].score)} {hideBots} />
			</div>
			{/if}
		</div>

		<section class="mine" class:wide class:active={pendingSeats(game).includes(ME)}>
			<div class="me-row">
				<span class="wind" class:dealer={isDealer(ME)}>{WIND_SHORT[windOf(ME)] ?? '·'}</span>
				<strong>{me.name}</strong>
				{#if me.riichi}<span class="riichi">Riichi</span>{/if}
				<span class="score">{fmt(me.score)}</span>
				<div class="spacer"></div>
				<Melds melds={me.melds} flowers={me.flowers} size="sm" />
			</div>

			<div class="status">
				<span>{statusText}</span>
				{#if hint}
					<span class="hintbox">
						{#if hint.sh < 0}
							Complete hand!
						{:else if hint.sh === 0}
							Ready · waiting on
							{#each hint.waits as k (k)}<Tile tile={{ id: -1, k }} size="xs" />{/each}
						{:else}
							{hint.sh} {hint.sh === 1 ? 'tile' : 'tiles'} from ready
						{/if}
					</span>
				{/if}
			</div>

			<div class="hand" role="group" aria-label="Your hand" bind:clientWidth={handW} style="--hw: {tileW}px; grid-template-columns: repeat({handCols}, {tileW}px)">
				{#each hand as t (t.id)}
					<Tile
						tile={t}
						size="lg"
						selected={selected === t.id || passPick.includes(t.id)}
						hint={hint?.suggestion === t.id && myTurn}
						disabled={!tileEnabled(t)}
						dim={(myTurn || game.phase === 'passing') && !tileEnabled(t)}
						onclick={() => clickTile(t)}
					/>
				{/each}
				{#if drawn}
					<span class="fresh" title="Just drawn">
						<Tile
							tile={drawn}
							size="lg"
							selected={selected === drawn.id}
							fresh={selected !== drawn.id}
							hint={hint?.suggestion === drawn.id}
							disabled={!tileEnabled(drawn)}
							onclick={() => clickTile(drawn)}
						/>
					</span>
				{/if}
			</div>

			<div class="actions">
				{#if game.phase === 'claim' && L.claims.length}
					<span class="claimed"><Tile tile={game.claim!.tile} size="md" glow /></span>
					{#each L.claims as o, i (i)}
						<button class="btn {o.type === 'win' ? 'primary' : 'dark'}" onclick={() => claim(o)}>
							{claimWord(o)}
							{#if o.type === 'chow'}
								<span class="mini">{#each o.use as id (id)}{@const t = tileOf(id)}{#if t}<Tile tile={t} size="xs" />{/if}{/each}</span>
							{/if}
						</button>
					{/each}
					<button class="btn" onclick={() => send({ t: 'pass' })}>Pass</button>
				{:else if myTurn}
					{#if L.tsumo}
						<button class="btn primary" onclick={() => send({ t: 'tsumo' })}>{v.riichi ? 'Tsumo' : 'Mahjong'} · {L.tsumo.summary}</button>
					{/if}
					{#each L.kongs as k (k)}
						<button class="btn dark" onclick={() => send({ t: 'kong', kind: k })}>{v.riichi ? 'Kan' : 'Gong'} <Tile tile={{ id: -3, k }} size="xs" /></button>
					{/each}
					{#if L.riichi.length && !me.riichi}
						<button class="btn" class:primary={riichiMode} onclick={() => { riichiMode = !riichiMode; selected = null; }}>
							{riichiMode ? 'Cancel riichi' : 'Riichi'}
						</button>
					{/if}
					<button class="btn primary wide" disabled={selected === null} onclick={() => selected !== null && discard(selected)}>
						{riichiMode ? 'Riichi & discard' : selected === null ? 'Pick a tile' : 'Discard'}
					</button>
				{:else if L.roll}
					<button class="btn primary wide" onclick={() => send({ t: 'roll' })}>
						{game.phase === 'seating' ? 'Roll the dice' : 'Break the wall'}
					</button>
				{:else if game.phase === 'passing' && L.pass3}
					<button class="btn primary wide" disabled={passPick.length !== 3} onclick={() => { send({ t: 'pass3', tiles: passPick }); passPick = []; }}>
						Pass {passPick.length}/3
					</button>
				{:else}
					<button class="btn wide ghost" disabled>{turnLabel || 'Waiting…'}</button>
				{/if}
				{#if L.tsumoBlocked && myTurn}<span class="blocked">{L.tsumoBlocked}</span>{/if}
				{#if L.claimBlocked && game.phase === 'claim'}<span class="blocked">{L.claimBlocked}</span>{/if}
				{#if error}<span class="blocked">{error}</span>{/if}
			</div>
		</section>

		{#if showLog}
			<TableMenu
				{game}
				me={ME}
				{online}
				{fmt}
				{friends}
				{onAddFriend}
				onClose={() => (showLog = false)}
				onHome={onLeave}
				onLeaveForGood={onQuit}
				bind:discardMode
				bind:discardFit
				bind:hints
				bind:speed
				bind:autoplay
				{allowAutoplay}
			/>
		{/if}

		{#if game.phase === 'ended' && game.result}
			{@const r = game.result}
			<div class="overlay">
				<div class="modal">
					{#if r.type === 'draw'}
						<p class="kicker">Hand {game.handNo}</p>
						<h2>Drawn hand</h2>
						{#if r.tenpai?.length}<p>Ready: {r.tenpai.map((s) => game!.players[s].name).join(', ')}</p>{/if}
					{:else}
						{#each r.wins as w (w.seat)}
							<p class="kicker">{w.from === null ? 'Self-draw' : w.from === ME && me.name === 'You' ? 'Off your discard' : `Off ${game.players[w.from].name}'s discard`}</p>
							<h2>{game.players[w.seat].name === 'You' ? 'You win' : `${game.players[w.seat].name} wins`} · {w.summary}</h2>
							<div class="winhand">
								{#each w.hand as t (t.id)}<Tile tile={t} size="sm" />{/each}
								<span class="gap"></span>
								<Tile tile={w.tile} size="sm" glow />
							</div>
							<Melds melds={w.melds} flowers={w.flowers} size="sm" />
							<table class="lines">
								<tbody>
									{#each w.lines as l, i (i)}<tr><td>{l.name}</td><td>{l.value}</td></tr>{/each}
									<tr class="tot"><td>Total</td><td>{w.total.toLocaleString()}</td></tr>
								</tbody>
							</table>
						{/each}
						{#if r.uraIndicators?.length}
							<p class="ura">Ura dora indicators: {#each r.uraIndicators as t (t.id)}<Tile tile={t} size="xs" />{/each}</p>
						{/if}
					{/if}
					{#each r.notes as n, i (i)}<p class="note">{n}</p>{/each}
					<div class="deltas">
						{#each game.players as p, i (i)}
							<div class:me={i === ME}>
								<span>{p.name}</span>
								<strong class:up={r.deltas[i] > 0} class:down={r.deltas[i] < 0}>{r.deltas[i] > 0 ? '+' : ''}{r.deltas[i].toLocaleString()}</strong>
								<small>{fmt(p.score)}</small>
							</div>
						{/each}
					</div>
					<button class="btn primary big" disabled={nextDisabled} onclick={onNext}>{nextLabel}</button>
				</div>
			</div>
		{/if}

		{#if game.phase === 'gameover'}
			<div class="overlay">
				<div class="modal">
					<p class="kicker">Game over</p>
					<h2>{standings(game)[0].name === 'You' ? 'You take' : `${standings(game)[0].name} takes`} the table</h2>
					<ol class="standings">
						{#each standings(game) as s, i (s.seat)}
							<li class:me={s.seat === ME}><span>{i + 1}. {s.name}</span><strong>{fmt(s.score)}</strong></li>
						{/each}
					</ol>
					<div class="row">
						{#if onPlayAgain}<button class="btn primary" onclick={onPlayAgain}>Play again</button>{/if}
						<button class="btn" onclick={onQuit ?? onLeave}>Back to lobby</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.table {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: radial-gradient(140% 100% at 50% 0%, var(--felt) 0%, var(--felt-2) 100%);
		color: var(--felt-ink);
		overflow: hidden;
		/* your hand tiles scale with the screen: 9 per row on a phone, capped on desktop */
		--hw: clamp(34px, calc((min(100vw, 1100px) - 32px) / 9 - 5px), 64px);
		/* side rails: wide enough for a tile lying on its side */
		--rail: clamp(40px, 10vw, 70px);
		--rt: calc((var(--rail) - 12px) / 1.333);
	}
	.hud {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--felt-line);
	}
	.info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.2;
	}
	.tag {
		font-style: normal;
		margin-left: 8px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		letter-spacing: 0.1em;
	}
	.info strong {
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.info span {
		font-size: 0.72rem;
		color: var(--felt-ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.wall {
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--felt-ink-2);
		white-space: nowrap;
	}
	.wall b {
		color: var(--felt-ink);
		font-size: 0.95rem;
	}
	.icon {
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: 10px;
		border: 1px solid var(--felt-line);
		background: rgba(0, 0, 0, 0.15);
		color: var(--felt-ink);
		font-size: 1rem;
		cursor: pointer;
	}
	.board {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--rail) minmax(0, 1fr) var(--rail);
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-areas:
			'left top right'
			'left mid right';
		gap: 6px;
		padding: 6px 8px;
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
	}
	.board.wide {
		display: flex;
		flex-direction: column;
		max-width: 1800px;
		padding: 10px 16px;
		gap: 10px;
		/* bigger discards on a laptop */
		--dt: clamp(44px, 4.3vw, 84px);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.board.wide .b-mid {
		flex: 1;
	}
	.b-left {
		grid-area: left;
		min-height: 0;
	}
	.b-right {
		grid-area: right;
		min-height: 0;
	}
	.b-top {
		grid-area: top;
	}
	.b-mid {
		grid-area: mid;
		min-height: 0;
	}
	.mine {
		flex: none;
		padding: 6px 12px 10px;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.3));
		border-top: 1px solid var(--felt-line);
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
	}
	.mine.active {
		box-shadow: inset 0 3px 0 var(--pop);
	}
	.me-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		max-width: 1100px;
		flex-wrap: wrap;
	}
	.me-row .spacer {
		flex: 1;
	}
	.wind {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.12);
		font-weight: 800;
		font-size: 0.75rem;
	}
	.wind.dealer {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.riichi {
		font-size: 0.65rem;
		font-weight: 800;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--t-red);
		color: white;
	}
	.score {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font-size: 0.85rem;
	}
	.status {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 0.8rem;
		color: var(--felt-ink-2);
		min-height: 22px;
	}
	.hintbox {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.25);
		color: var(--felt-ink);
	}
	.hand {
		--tile-lg: var(--hw);
		display: grid;
		grid-template-columns: repeat(auto-fill, var(--hw));
		justify-content: center;
		gap: 6px 4px;
		width: 100%;
		max-width: 1240px;
		padding-top: 10px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		align-items: center;
		width: 100%;
		max-width: 1100px;
	}
	.actions .btn {
		min-height: 46px;
		flex: 1 1 auto;
	}
	.actions .wide {
		flex: 1 1 100%;
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	/* laptop: status on the left, a compact action button on the right */
	.mine.wide {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'me me'
			'status actions'
			'hand hand';
		align-items: center;
		column-gap: 16px;
		padding: 8px 16px 14px;
	}
	.mine.wide .me-row {
		grid-area: me;
		max-width: none;
	}
	.mine.wide .status {
		grid-area: status;
		justify-content: flex-start;
	}
	.mine.wide .actions {
		grid-area: actions;
		max-width: none;
		width: auto;
		justify-content: flex-end;
	}
	.mine.wide .actions .wide {
		flex: 0 0 auto;
		min-width: 240px;
	}
	.mine.wide .hand {
		grid-area: hand;
		max-width: none;
	}
	.actions .ghost {
		background: rgba(0, 0, 0, 0.2);
		border-color: var(--felt-line);
		color: var(--felt-ink-2);
		opacity: 1;
	}
	.claimed {
		flex: none;
	}
	.mini {
		display: inline-flex;
		gap: 1px;
	}
	.blocked {
		font-size: 0.8rem;
		color: #ffd2c8;
		max-width: 420px;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: grid;
		place-items: center;
		padding: 16px;
		z-index: 40;
	}
	.modal {
		background: var(--card);
		color: var(--ink);
		border-radius: 20px;
		padding: 24px;
		width: min(560px, 100%);
		max-height: 92dvh;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.modal h2 {
		margin: 0;
	}
	.winhand {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		align-items: flex-end;
	}
	.lines {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.lines td {
		padding: 6px 4px;
		border-bottom: 1px solid var(--line);
	}
	.lines td:last-child {
		text-align: right;
		font-weight: 700;
		white-space: nowrap;
	}
	.lines .tot td {
		border-bottom: none;
		font-size: 1rem;
	}
	.ura {
		display: flex;
		gap: 4px;
		align-items: center;
		font-size: 0.85rem;
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.deltas {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.deltas div {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		border-radius: 10px;
		background: var(--bg-2);
		font-size: 0.8rem;
		min-width: 0;
	}
	.deltas div.me {
		outline: 2px solid var(--accent);
	}
	.deltas strong {
		font-size: 1rem;
	}
	.up {
		color: var(--good);
	}
	.down {
		color: var(--danger);
	}
	.big {
		padding: 14px;
		margin-top: 6px;
	}
	.standings {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.standings li {
		display: flex;
		justify-content: space-between;
		padding: 10px 14px;
		border-radius: 10px;
		background: var(--bg-2);
	}
	.standings li.me {
		outline: 2px solid var(--accent);
	}
	.row {
		display: flex;
		gap: 8px;
	}

</style>
