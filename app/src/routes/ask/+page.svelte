<script lang="ts">
	import { tick } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';

	type Msg = { role: 'user' | 'assistant'; content: string };
	let messages = $state<Msg[]>([]);
	let input = $state('');
	let busy = $state(false);
	let error = $state('');
	let scroller: HTMLDivElement | undefined = $state();

	const suggestions = [
		'How does riichi work?',
		'What’s a good opening discard?',
		'How is a Taiwanese hand scored?',
		'When should I call pung vs stay concealed?'
	];

	async function send(text?: string) {
		const q = (text ?? input).trim();
		if (!q || busy) return;
		error = '';
		messages = [...messages, { role: 'user', content: q }];
		input = '';
		busy = true;
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight });
		try {
			const r = await fetch('/api/ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messages })
			});
			const d = (await r.json()) as { reply?: string; error?: string };
			if (!r.ok) throw new Error(d.error ?? 'Something went wrong.');
			messages = [...messages, { role: 'assistant', content: d.reply || '(no answer)' }];
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
			await tick();
			scroller?.scrollTo({ top: scroller.scrollHeight });
		}
	}
</script>

<svelte:head><title>Ask the table · {APP_NAME}</title></svelte:head>

<main class="wrap">
	<p class="kicker">Ask the table</p>
	<h1>Mahjong questions, answered</h1>
	<p class="lede">Rules, scoring, etiquette, strategy — ask anything about Taiwanese, Riichi or Bombay.</p>

	<div class="chat" bind:this={scroller}>
		{#each messages as m, i (i)}
			<div class="msg {m.role}">{m.content}</div>
		{/each}
		{#if busy}<div class="msg assistant typing">Thinking…</div>{/if}
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
	<p class="fine">Answers are AI-generated and can be wrong — double-check anything important against the rules pages.</p>
</main>

<style>
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
