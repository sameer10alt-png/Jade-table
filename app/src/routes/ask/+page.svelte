<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { APP_NAME } from '#lib/brand.ts';
	import SignupGate from '#lib/components/SignupGate.svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';

	type Msg = { role: 'user' | 'assistant'; content: string; ms?: number };
	let messages = $state<Msg[]>([]);
	let input = $state('');
	let busy = $state(false);
	let error = $state('');
	let scroller: HTMLDivElement | undefined = $state();

	const suggestions = [
		'Which tiles should I throw first in the opening?',
		'How do I know when to stop attacking and fold?',
		'How do I count my outs before a discard?',
		'When should I call pung vs stay concealed?',
		'What waits are best to aim for?',
		'How is a Taiwanese hand scored?'
	];

	/** time spent waiting for the current answer (ms) */
	let elapsed = $state(0);
	const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

	onMount(() => {
		loadAccount().then(() => {
			// a strategy question from a practice report: fill it in, ready to send
			const q = page.url.searchParams.get('q');
			if (q && account.user) input = q.slice(0, 300);
		});
	});

	async function send(text?: string) {
		const q = (text ?? input).trim();
		if (!q || busy) return;
		error = '';
		messages = [...messages, { role: 'user', content: q }];
		input = '';
		busy = true;
		elapsed = 0;
		const t0 = performance.now();
		const tickTimer = setInterval(() => (elapsed = performance.now() - t0), 100);
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight });
		try {
			const r = await fetch('/api/ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) })
			});
			const d = (await r.json()) as { reply?: string; error?: string; needSignIn?: boolean };
			if (r.status === 401 && d.needSignIn) {
				account.user = null;
				messages = messages.slice(0, -1);
				input = q;
				return;
			}
			if (!r.ok) {
				messages = messages.slice(0, -1);
				input = q;
				throw new Error(d.error ?? 'Something went wrong.');
			}
			messages = [...messages, { role: 'assistant', content: d.reply || '(no answer)', ms: performance.now() - t0 }];
		} catch (e) {
			error = (e as Error).message;
		} finally {
			clearInterval(tickTimer);
			busy = false;
			await tick();
			scroller?.scrollTo({ top: scroller.scrollHeight });
		}
	}
</script>

<svelte:head><title>The Dragon · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Your mahjong coach</p>
	<h1>Ask the Dragon</h1>
	<p class="lede">Stuck on a discard, a scoring rule or when to fold? Ask in plain words and get a straight answer.</p>

	{#if account.loaded && !account.user}
		<div class="gate">
			<p class="gate-h">Sign up to talk to the Dragon</p>
			<p class="gate-sub">It's free. One account per person keeps the Dragon fast for everyone.</p>
			<SignupGate next="/ask" label="Start asking" />
		</div>
	{:else}
	<div class="chat" bind:this={scroller}>
		{#each messages as m, i (i)}
			<div class="msg {m.role}">{m.content}</div>
			{#if m.role === 'assistant' && m.ms !== undefined}<div class="took">Replied in {secs(m.ms)}</div>{/if}
		{/each}
		{#if busy}<div class="msg assistant typing">Thinking… {secs(elapsed)}</div>{/if}
		{#if !messages.length}
			<div class="empty">
				<p>Try one of these:</p>
				<div class="sugg">
					{#each suggestions as s (s)}<button onclick={() => send(s)}>{s}</button>{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if error}<p class="err">{error}</p>{/if}

	<form class="bar" onsubmit={(e) => { e.preventDefault(); send(); }}>
		<input bind:value={input} placeholder="Ask a mahjong question…" aria-label="Your question" />
		<button class="btn primary" disabled={busy || !input.trim()}>Ask</button>
	</form>
	{/if}
	<p class="fine">Answers are AI-generated and can be wrong — double-check anything important against the rules pages.</p>
</main>

<style>
	.took {
		align-self: flex-start;
		margin-top: -6px;
		font-size: 0.75rem;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.gate {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 20px;
	}
	.gate-h {
		font-weight: 700;
		margin: 0 0 4px;
	}
	.gate-sub {
		color: var(--ink-2);
		margin: 0 0 12px;
	}
	h1 {
		margin: 6px 0 8px;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
	}
	.kicker {
		margin-top: 32px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 620px;
		margin: 0 0 18px;
	}
	.chat {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 320px;
		max-height: 56vh;
		overflow: auto;
		padding: 16px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.msg {
		max-width: 80%;
		padding: 11px 14px;
		border-radius: 14px;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.msg.user {
		align-self: flex-end;
		background: var(--accent);
		color: var(--accent-ink);
		border-bottom-right-radius: 4px;
	}
	.msg.assistant {
		align-self: flex-start;
		background: var(--card);
		border: 1px solid var(--line);
		border-bottom-left-radius: 4px;
	}
	.typing {
		color: var(--ink-2);
		font-style: italic;
	}
	.empty {
		margin: auto;
		text-align: center;
		color: var(--ink-2);
	}
	.sugg {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		margin-top: 10px;
	}
	.sugg button {
		font: 500 0.9rem var(--font);
		padding: 9px 13px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
	}
	.sugg button:hover {
		border-color: var(--pop);
	}
	.bar {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
	.bar input {
		flex: 1;
		font: 500 1rem var(--font);
		padding: 12px 14px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--ink);
	}
	.bar .btn {
		padding: 12px 20px;
	}
	.err {
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
		margin-top: 12px;
	}
	.fine {
		margin-top: 10px;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
</style>
