<script lang="ts">
	import { APP_NAME, LEGAL_UPDATED, SUPPORT_EMAIL } from '#lib/brand.ts';
</script>

<svelte:head><title>Terms of service · {APP_NAME}</title></svelte:head>

<main class="wrap legal">
	<p class="kicker">Terms of service</p>
	<h1>Playing at {APP_NAME}</h1>
	<p class="muted">Last updated {LEGAL_UPDATED}</p>

	<p>By using {APP_NAME} you agree to these terms. They're short, and written to be read.</p>

	<h2>Free to play, no gambling</h2>
	<p>
		{APP_NAME} is free. There is no real money, no prizes and no wagering. Points exist only inside the game. Don't use the game to
		gamble with other people.
	</p>

	<h2>Play fair and be kind</h2>
	<ul>
		<li>Don't cheat: no outside help, no multiple accounts at one table, no passing information to other players.</li>
		<li>Don't try to break, overload or get around the site's protections, or read information meant for other players.</li>
		<li>Use a name that isn't offensive or pretending to be someone else.</li>
		<li>Bots are always labelled as bots. Seats left empty, and players who drop out, are played by bots so a table never stalls.</li>
	</ul>

	<h2>Your account</h2>
	<ul>
		<li>Accounts are optional; guests can play everything.</li>
		<li>Keep your Google account secure. You're responsible for what happens at tables under your account.</li>
		<li>We may pause or remove an account that breaks these terms. You can ask us to delete your account at any time.</li>
	</ul>

	<h2>The service</h2>
	<ul>
		<li>
			{APP_NAME} is a project we're still building. We do our best to keep it running and fair, but it's provided "as is": games may
			occasionally be interrupted, and features may change.
		</li>
		<li>Online tables that nobody uses are deleted after a few days.</li>
	</ul>

	<h2>Our content</h2>
	<p>
		The game's code, tile artwork and text belong to {APP_NAME}. Mahjong itself belongs to everyone: the rules are traditional, and
		we wrote our own versions of them.
	</p>

	<h2>Privacy</h2>
	<p>How we handle your information is explained in our <a href="/privacy">privacy policy</a>.</p>

	<h2>Changes</h2>
	<p>We may update these terms. The date at the top shows the latest version. If you keep playing after a change, the new terms apply.</p>

	<h2>Contact</h2>
	<p>Questions: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a></p>
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
