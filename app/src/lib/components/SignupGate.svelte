<script lang="ts">
	import { account, register, signIn } from '#lib/online/account.svelte.ts';

	let { next = '/online', label = 'Play online' }: { next?: string; label?: string } = $props();

	let contact = $state('');
	let username = $state('');
	let skill = $state('intermediate');
	let busy = $state(false);
	let error = $state('');

	const SKILLS = [
		{ id: 'beginner', label: 'Beginner', note: 'New or learning' },
		{ id: 'intermediate', label: 'Intermediate', note: 'Play regularly' },
		{ id: 'advanced', label: 'Advanced', note: 'Strong player' }
	];

	async function submit() {
		error = '';
		if (!contact.trim() || !username.trim()) {
			error = 'Enter your email or phone and a username.';
			return;
		}
		busy = true;
		try {
			await register(contact.trim(), username.trim(), skill);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<section class="gate">
	<p class="kicker">{label}</p>
	<h2>Create your free player</h2>
	<p class="sub">One player per person. Add an email or phone and pick a username — no password, takes a few seconds.</p>

	<label>
		<span>Email or phone</span>
		<input bind:value={contact} placeholder="you@email.com or +66 8 1234 5678" autocomplete="email" onkeydown={(e) => e.key === 'Enter' && submit()} />
	</label>
	<label>
		<span>Username</span>
		<input bind:value={username} maxlength="16" placeholder="e.g. Shama" onkeydown={(e) => e.key === 'Enter' && submit()} />
	</label>

	<div class="skill">
		<span class="skill-h">How well do you play? <small>(so games are fair)</small></span>
		<div class="skill-opts">
			{#each SKILLS as s (s.id)}
				<button type="button" class="skill-opt" class:on={skill === s.id} onclick={() => (skill = s.id)}>
					<b>{s.label}</b><small>{s.note}</small>
				</button>
			{/each}
		</div>
	</div>

	{#if error}<p class="err">{error}</p>{/if}

	<button class="btn primary big" disabled={busy} onclick={submit}>{busy ? 'One moment…' : label}</button>

	{#if account.google}
		<p class="or">or <button class="linkish" onclick={() => signIn(next)}>sign in with Google</button></p>
	{/if}

	<p class="fine">We use this to keep your games on any device and to keep it one player per person. We won't post anything or share it.</p>
</section>

<style>
	.gate {
		max-width: 440px;
		margin: 32px auto;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 26px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.gate h2 {
		margin: 0;
		font-size: clamp(1.4rem, 3.5vw, 1.9rem);
	}
	.sub {
		margin: -6px 0 4px;
		color: var(--ink-2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	input {
		font: 500 1rem var(--font);
		padding: 11px 13px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
	}
	.skill {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.skill-h {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.skill-h small {
		color: var(--ink-2);
		font-weight: 500;
	}
	.skill-opts {
		display: flex;
		gap: 8px;
	}
	.skill-opt {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 6px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--ink);
		cursor: pointer;
		text-align: center;
		transition: all 0.12s;
	}
	.skill-opt small {
		color: var(--ink-2);
		font-size: 0.72rem;
	}
	.skill-opt.on {
		border-color: var(--pop);
		background: color-mix(in srgb, var(--pop) 10%, transparent);
	}
	.skill-opt.on small {
		color: var(--ink);
	}
	.big {
		padding: 14px;
		font-size: 1.05rem;
	}
	.err {
		margin: 0;
		padding: 10px 14px;
		border-radius: 10px;
		background: #fbe3df;
		color: #7a1f14;
	}
	.or {
		margin: 0;
		text-align: center;
		color: var(--ink-2);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
	.fine {
		margin: 4px 0 0;
		font-size: 0.78rem;
		color: var(--ink-2);
	}
</style>
