<script lang="ts">
	import { pictureSrc } from '#lib/online/profile.ts';

	// A round player picture: their photo, a drawn avatar, or their initial on a color.
	let { name, picture = null, size = 32 }: { name: string; picture?: string | null; size?: number } = $props();
	const src = $derived(pictureSrc(picture));
	const COLORS = ['#b5452b', '#2f6f4e', '#2c4a7a', '#7a3045', '#5a4a8a', '#a8743a', '#1f7a7a', '#6b4423'];
	const color = $derived(COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]);
	let broken = $state(false);
</script>

{#if src && !broken}
	<img class="av" {src} alt="" width={size} height={size} style:width="{size}px" style:height="{size}px" referrerpolicy="no-referrer" onerror={() => (broken = true)} />
{:else}
	<span class="av init" style:width="{size}px" style:height="{size}px" style:background={color} style:font-size="{size * 0.45}px">{(name[0] ?? '?').toUpperCase()}</span>
{/if}

<style>
	.av {
		display: inline-grid;
		place-items: center;
		flex: none;
		border-radius: 50%;
		object-fit: cover;
		background: #ddd;
	}
	.init {
		color: #fff;
		font-weight: 800;
	}
</style>
