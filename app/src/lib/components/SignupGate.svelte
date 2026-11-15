<script lang="ts">
	import { account, register, signIn } from '#lib/online/account.svelte.ts';

	let {
		next = '/online',
		label = 'Play online',
		title = 'Create your free player'
	}: { next?: string; label?: string; title?: string } = $props();

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

	// step 2: the code we emailed
	let step = $state<'details' | 'code'>('details');
	let code = $state('');
	let sentTo = $state('');
	let devCode = $state('');

	async function submit() {
		error = '';
		if (!contact.trim() || !username.trim()) {
			error = 'Enter your email and a username.';
			return;
		}
		busy = true;
		try {
			const r = await register(contact.trim(), username.trim(), skill);
			if (r.needCode) {
				step = 'code';
				sentTo = r.sentTo ?? contact.trim();
				devCode = r.devCode ?? '';
				code = '';
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function confirm() {
		error = '';
		if (code.replace(/\D/g, '').length !== 6) {
			error = 'Enter the 6-digit code from the email.';
			return;
		}
		busy = true;
		try {
			await register(contact.trim(), username.trim(), skill, code.trim());
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function resend() {
		code = '';
		await submit();
	}
</script>

<section class="gate">
	<p class="kicker">{label}</p>
	<h2>{title}</h2>
	<p class="sub">One player per person. No password: we email you a 6-digit code. Signed up before? Use the same email and username.</p>

	{#if account.google}
		<button type="button" class="google" onclick={() => signIn(next)}>
			<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
				<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
				<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
				<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
				<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
			</svg>
			Continue with Google
		</button>
		<p class="or"><span>or use any email (Outlook, Yahoo, iCloud…)</span></p>
	{/if}

	{#if step === 'code'}
		<div class="code-step">
			<p class="sent">We emailed a 6-digit code to <b>{sentTo}</b>. Check spam if you don't see it.</p>
			{#if devCode}<p class="fine">Test mode code: {devCode}</p>{/if}
			<label>
				<span>Code</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="code"
					bind:value={code}
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength="6"
					placeholder="123456"
					autofocus
					onkeydown={(e) => e.key === 'Enter' && confirm()}
				/>
			</label>
			{#if error}<p class="err">{error}</p>{/if}
			<button class="btn primary big" disabled={busy} onclick={confirm}>{busy ? 'Checking…' : 'Confirm'}</button>
			<p class="links">
				<button type="button" class="link" disabled={busy} onclick={resend}>Send a new code</button>
				·
				<button type="button" class="link" onclick={() => ((step = 'details'), (error = ''))}>Change email</button>
			</p>
		</div>
	{:else}
	<label>
		<span>Email</span>
		<input bind:value={contact} type="email" placeholder="you@email.com" autocomplete="email" onkeydown={(e) => e.key === 'Enter' && submit()} />
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

	<button class="btn primary big" disabled={busy} onclick={submit}>{busy ? 'Sending code…' : label}</button>
	{/if}


	<p class="fine">We use your email to keep your games on any device and to keep it one player per person. We won't post anything or share it.</p>
</section>

<style>
	.code-step {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sent {
		margin: 6px 0 0;
		color: var(--ink-2);
	}
	.code {
		font-size: 1.6rem;
		letter-spacing: 0.4em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.links {
		margin: 0;
		text-align: center;
		color: var(--ink-2);
		font-size: 0.88rem;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		color: var(--pop);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.google {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 12px;
		margin: 14px 0 4px;
		border-radius: 999px;
		border: 1px solid #dadce0;
		background: #fff;
		color: #1f1f1f;
		font: 600 0.98rem var(--font);
		cursor: pointer;
	}
	.google:hover {
		background: #f6f8fc;
	}
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
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 10px 0 2px;
		color: var(--ink-2);
		font-size: 0.82rem;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--line);
	}
	.fine {
		margin: 4px 0 0;
		font-size: 0.78rem;
		color: var(--ink-2);
	}
</style>
