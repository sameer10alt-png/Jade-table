<script lang="ts">
	// Offline table: runs the game in the browser against local bots and saves it locally.
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import GameTable from '#lib/components/GameTable.svelte';
	import GameReview from '#lib/components/GameReview.svelte';
	import type { GameReviewData, MoveReview } from '#lib/components/GameReview.svelte';
	import { botAction, reviewDiscard } from '#lib/engine/bots.ts';
	import { applyAction, legal, newGame, pendingSeats } from '#lib/engine/game.ts';
	import type { Action, GameState } from '#lib/engine/types.ts';
	import { clearGame, DEFAULT_PREFS, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from '#lib/storage.ts';

	const ME = 0;
	let game = $state.raw<GameState | null>(null);
	let prefs = $state<Prefs>(DEFAULT_PREFS);
	let error = $state('');
	/** let the expert bot play your seat (watch mode) */
	let autoplay = $state(false);

	// ---- play review (chess.com-style): record each of my discards, grade them at the end ----
	let myDiscards: { state: GameState; tile: number; handNo: number }[] = [];
	let discardCount = $state(0);
	let showReview = $state(false);
	let reviewData = $state<GameReviewData | null>(null);

	const RANK: Record<string, number> = { blunder: 0, mistake: 1, amazing: 2, great: 3, inaccuracy: 4, good: 5, best: 6 };

	function buildReview(): GameReviewData {
		const counts = { amazing: 0, great: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
		const notable: MoveReview[] = [];
		for (const d of myDiscards) {
			const r = reviewDiscard(d.state, ME, d.tile);
			if (!r) continue;
			counts[r.grade]++;
			if (r.grade !== 'best' && r.grade !== 'good')
				notable.push({ handNo: d.handNo, chosenK: r.chosenK, bestK: r.bestK, grade: r.grade, reason: r.reason });
		}
		const total = counts.amazing + counts.great + counts.best + counts.good + counts.inaccuracy + counts.mistake + counts.blunder;
		const goodMoves = counts.amazing + counts.great + counts.best + counts.good;
		const accuracy = total ? Math.round((goodMoves / total) * 100) : 100;
		// highlights (brilliant/great) first, then worst mistakes
		notable.sort((a, b) => RANK[a.grade] - RANK[b.grade]);

		// one-line verdict
		let verdict: string;
		if (counts.blunder >= 3) verdict = 'Rough one — too many tiles into live hands.';
		else if (counts.blunder || counts.mistake >= 3) verdict = 'Mixed game — some costly discards to clean up.';
		else if (counts.amazing) verdict = 'Brilliant game — great reads under pressure.';
		else if (accuracy >= 90) verdict = 'Sharp game — you played near-expert.';
		else if (accuracy >= 75) verdict = 'Solid game — a few spots to tighten.';
		else verdict = 'Keep at it — focus on efficient, safe discards.';

		const tips: string[] = [];
		if (counts.blunder) tips.push('Safety first when someone’s close: watch for players who’ve stopped discarding middle tiles, and switch to tiles they’ve already thrown.');
		if (counts.mistake >= 2) tips.push('Keep tiles that work together — let go of lone honours and terminals early instead of breaking a near-complete shape.');
		if (notable.some((m) => /outs|improved/.test(m.reason))) tips.push('Count your outs — keep the shape that leaves the most tiles to draw toward a win.');
		if (!tips.length) tips.push(accuracy >= 90 ? 'You matched the expert most of the time. Bump the bots up a level.' : 'Push your efficient discards and you’ll climb fast.');

		return { total, counts, accuracy, verdict, notable: notable.slice(0, 8), tips: tips.slice(0, 2) };
	}

	function openReview() {
		reviewData = buildReview();
		showReview = true;
	}

	// pop the review up automatically once the whole game is over
	let reviewedGame = false;
	$effect(() => {
		if (game?.phase === 'gameover' && discardCount && !reviewedGame) {
			reviewedGame = true;
			openReview();
		}
		if (game && game.phase !== 'gameover') reviewedGame = false;
	});

	let prefsLoaded = false;
	$effect(() => {
		// remember settings changed from the table menu
		const p = { ...prefs };
		if (prefsLoaded) savePrefs(p);
	});

	onMount(() => {
		prefs = loadPrefs();
		prefsLoaded = true;
		const g = loadGame();
		if (!g) goto('/');
		else game = g;
	});

	function act(seat: number, action: Action) {
		if (!game) return;
		try {
			// record my own discards (with the pre-move state) so we can grade them later
			if (seat === ME && action.t === 'discard' && legal(game, ME).discard?.includes(action.tile)) {
				myDiscards.push({ state: structuredClone(game), tile: action.tile, handNo: game.handNo });
				discardCount = myDiscards.length;
			}
			game = applyAction(game, seat, action);
			error = '';
		} catch (e) {
			error = (e as Error).message;
			console.error(e);
		}
	}

	// ---- driving the bots ----
	const DELAY = { slow: 1100, normal: 650, fast: 250 };
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const g = game;
		if (!g) return;
		saveGame(g);
		clearTimeout(timer);
		const auto = autoplay;
		const bots = pendingSeats(g).filter((s) => s !== ME || auto);
		const riichiAuto =
			!auto && g.phase === 'turn' && g.turn === ME && g.players[ME].riichi && g.drawn && !legal(g, ME).tsumo;
		if (riichiAuto) {
			const id = g.drawn!.id;
			timer = setTimeout(() => act(ME, { t: 'discard', tile: id }), 700);
		} else if (g.phase === 'ended' && auto) {
			timer = setTimeout(() => act(ME, { t: 'next' }), 4000);
		} else if (bots.length) {
			const base = DELAY[prefs.speed];
			const wait = g.phase === 'claim' ? Math.min(250, base) : g.phase === 'passing' ? 200 : base;
			timer = setTimeout(() => {
				const cur = game;
				if (!cur) return;
				const seat = pendingSeats(cur).find((s) => s !== ME || autoplay);
				if (seat !== undefined) act(seat, botAction(cur, seat));
			}, wait);
		}
		return () => clearTimeout(timer);
	});

	function playAgain() {
		if (!game) return;
		myDiscards = [];
		discardCount = 0;
		showReview = false;
		game = newGame({ ...game.opts, seed: Math.floor(Math.random() * 2 ** 31) });
	}

	function quit() {
		clearGame();
		goto('/');
	}
</script>

{#if game}
	<GameTable
		{game}
		seat={ME}
		bind:hints={prefs.hints}
		bind:speed={prefs.speed}
		{error}
		bind:autoplay
		allowAutoplay
		onAction={(a) => act(ME, a)}
		onNext={() => act(ME, { t: 'next' })}
		onLeave={() => goto('/')}
		onQuit={quit}
		onPlayAgain={playAgain}
	/>
	{#if (game.phase === 'ended' || game.phase === 'gameover') && discardCount}
		<button class="review-fab" onclick={openReview}>Review my play</button>
	{/if}
	{#if showReview && reviewData}
		<GameReview data={reviewData} onClose={() => (showReview = false)} />
	{/if}
{/if}

<style>
	.review-fab {
		position: fixed;
		left: 50%;
		bottom: 18px;
		transform: translateX(-50%);
		z-index: 55;
		font: 600 0.95rem var(--font);
		color: var(--accent-ink);
		background: var(--accent);
		border: none;
		border-radius: 999px;
		padding: 11px 20px;
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}
	.review-fab:active {
		transform: translateX(-50%) translateY(1px);
	}
</style>
