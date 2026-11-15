<script lang="ts">
	// Sign in or create a player: Google, or any email / phone (Outlook, Yahoo, iCloud…).
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/brand.ts';
	import SignupGate from '#lib/components/SignupGate.svelte';
	import { account, loadAccount } from '#lib/online/account.svelte.ts';

	// only same-site paths, so the link can't send people elsewhere
	const raw = page.url.searchParams.get('next') ?? '/';
	const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

	onMount(() => {
		loadAccount();
	});
	$effect(() => {
		if (account.user) goto(next, { replaceState: true }).catch(() => goto('/', { replaceState: true }));
	});
</script>

<svelte:head><title>Sign in · {APP_NAME}</title></svelte:head>

<main class="wrap">
	{#if account.loaded && !account.user}
		<SignupGate {next} label="Sign in" title="Sign in or create your player" />
	{/if}
</main>
