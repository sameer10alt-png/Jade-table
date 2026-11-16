<script lang="ts">
	import { APP_NAME, LEGAL_UPDATED, SUPPORT_EMAIL } from '#lib/brand.ts';
</script>

<svelte:head><title>Privacy policy · {APP_NAME}</title></svelte:head>

<main class="wrap legal">
	<p class="kicker">Privacy policy</p>
	<h1>Your privacy at {APP_NAME}</h1>
	<p class="muted">Last updated {LEGAL_UPDATED}</p>

	<p>
		{APP_NAME} is a free mahjong game. This page explains what we collect, why, and what you can do about it. In short:
		we keep only what the game needs to work, we don't sell anything, and we don't show ads.
	</p>

	<h2>If you play as a guest</h2>
	<ul>
		<li>
			Your browser keeps a <b>random player id</b>, the <b>name you type</b>, your <b>settings</b> and any <b>game against bots</b> in
			its own storage. Games against bots never leave your device.
		</li>
		<li>
			At online tables, our server receives that random id and your name, and keeps the table's game (moves, scores and the game log) so the game can continue if you reconnect.
		</li>
	</ul>

	<h2>If you sign in with Google</h2>
	<ul>
		<li>
			Google tells us your <b>name</b>, your <b>email address</b> (if Google has verified it), your <b>profile picture</b> and a Google
			account number that identifies you to us. We ask for nothing else: we can't read your Gmail, contacts, files or anything else in
			your Google account.
		</li>
		<li>
			We never see or store your Google password. We store a <b>sign-in session</b> so you stay signed in: your browser holds a random
			code in a cookie, and our database keeps only a scrambled fingerprint (hash) of it.
		</li>
		<li>You can change the name other players see on your account page.</li>
		<li>At an online table, the other players can see your name, your profile picture and your hand record (hands played and won).</li>
	</ul>

	<h2>If you sign in with email</h2>
	<ul>
		<li>
			We store your <b>email address</b>, the <b>username</b> you pick and your skill level. To check the email is yours, we send it a
			6-digit code that works for 10 minutes; we keep only a scrambled fingerprint of the code and delete it once used.
		</li>
		<li>We only email you sign-in codes. No newsletters or marketing.</li>
	</ul>

	<h2>Cookies</h2>
	<p>
		We use cookies that keep you signed in and protect the Google sign-in step. We also use Microsoft Clarity analytics, which sets its
		own cookies to tell visits apart and to see how long people play. No advertising cookies.
	</p>

	<h2>Analytics</h2>
	<p>
		We use <b>Microsoft Clarity</b> to see how the site is used: how long people play, which pages they visit, where they click and
		scroll, and recordings of sessions that help us find bugs and confusing screens. Clarity masks text you type. It sees your device,
		browser and rough location, and we tag sessions with the game and mode you play. We use this only to improve {APP_NAME}. Microsoft's
		privacy statement covers how it handles this data.
	</p>

	<h2>What we do not do</h2>
	<ul>
		<li>We don't sell or rent your information.</li>
		<li>We don't show ads or use ad trackers.</li>
		<li>We don't use your information for anything other than running and improving the game.</li>
	</ul>

	<h2>Who else handles your data</h2>
	<ul>
		<li><b>Railway</b> hosts our servers and database (in the United States).</li>
		<li><b>Google</b> handles sign-in, if you choose to use it.</li>
		<li><b>Resend</b> delivers the sign-in code emails.</li>
		<li><b>Microsoft Clarity</b> provides usage analytics and session recordings.</li>
		<li><b>Google Fonts</b> supplies the site's fonts, so Google's font servers see your IP address when a page loads.</li>
	</ul>

	<h2>How long we keep it</h2>
	<ul>
		<li>Online tables are deleted a few days after they were last used.</li>
		<li>Sign-in sessions expire after 60 days, or when you sign out.</li>
		<li>Your account stays until you ask us to delete it.</li>
	</ul>

	<h2>Your choices</h2>
	<ul>
		<li>Play without an account: everything works as a guest.</li>
		<li>Sign out at any time from your account page.</li>
		<li>
			To get a copy of your data or have your account deleted, email <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>. We'll do it
			within 30 days.
		</li>
		<li>You can also remove {APP_NAME}'s access in your Google account settings, under "Third-party apps & services".</li>
	</ul>

	<h2>Children</h2>
	<p>{APP_NAME} is not aimed at children under 13, and we don't knowingly collect their information.</p>

	<h2>Changes</h2>
	<p>If we change this policy, we'll update the date at the top. For a change that matters, we'll say so on the site.</p>

	<h2>Contact</h2>
	<p>Questions about privacy: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a></p>
</main>

<style>
	.legal {
		max-width: 760px;
		padding-top: 32px;
		line-height: 1.6;
	}
	h1 {
		margin: 4px 0;
		font-size: clamp(1.8rem, 4vw, 2.4rem);
	}
	h2 {
		margin: 28px 0 6px;
		font-size: 1.25rem;
	}
	.muted {
		color: var(--ink-2);
	}
	ul {
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
