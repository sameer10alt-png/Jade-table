<script lang="ts">
	// Original tile artwork, drawn procedurally. viewBox 60 x 80.
	let { k, red = false }: { k: string; red?: boolean } = $props();

	const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
	const FLOWERS = ['梅', '蘭', '菊', '竹'];
	const SEASONS = ['春', '夏', '秋', '冬'];
	const WINDS: Record<string, [string, string]> = { we: ['東', 'E'], ws: ['南', 'S'], ww: ['西', 'W'], wn: ['北', 'N'] };

	const DOTS: Record<number, [number, number][]> = {
		1: [[30, 42]],
		2: [[30, 24], [30, 60]],
		3: [[16, 20], [30, 42], [44, 64]],
		4: [[18, 24], [42, 24], [18, 60], [42, 60]],
		5: [[17, 22], [43, 22], [30, 42], [17, 62], [43, 62]],
		6: [[19, 18], [41, 18], [19, 42], [41, 42], [19, 66], [41, 66]],
		7: [[14, 14], [30, 22], [46, 30], [19, 48], [41, 48], [19, 66], [41, 66]],
		8: [[19, 13], [41, 13], [19, 32], [41, 32], [19, 51], [41, 51], [19, 70], [41, 70]],
		9: [[15, 18], [30, 18], [45, 18], [15, 42], [30, 42], [45, 42], [15, 66], [30, 66], [45, 66]]
	};
	const DOT_R: Record<number, number> = { 1: 20, 2: 10, 3: 8, 4: 9, 5: 8, 6: 8, 7: 7, 8: 7, 9: 6.5 };
	function dotColor(n: number, i: number): string {
		if (red && n === 5) return 'var(--t-red)';
		if (n === 1) return 'var(--t-red)';
		if (n === 3) return ['var(--t-blue)', 'var(--t-red)', 'var(--t-green)'][i];
		if (n === 5) return i === 2 ? 'var(--t-red)' : i % 3 === 0 ? 'var(--t-blue)' : 'var(--t-green)';
		if (n === 7) return i < 3 ? 'var(--t-green)' : 'var(--t-red)';
		if (n === 6) return i < 2 ? 'var(--t-green)' : 'var(--t-red)';
		if (n === 9) return i < 3 ? 'var(--t-blue)' : i < 6 ? 'var(--t-red)' : 'var(--t-green)';
		return i % 2 ? 'var(--t-green)' : 'var(--t-blue)';
	}

	// bamboo stick centres (x, y) — each stick ~22 tall
	const STICKS: Record<number, [number, number][]> = {
		2: [[30, 24], [30, 58]],
		3: [[30, 24], [19, 58], [41, 58]],
		4: [[19, 24], [41, 24], [19, 58], [41, 58]],
		5: [[16, 24], [44, 24], [30, 41], [16, 58], [44, 58]],
		6: [[16, 24], [30, 24], [44, 24], [16, 58], [30, 58], [44, 58]],
		7: [[30, 16], [16, 41], [30, 41], [44, 41], [16, 64], [30, 64], [44, 64]],
		8: [[12, 24], [24, 24], [36, 24], [48, 24], [12, 58], [24, 58], [36, 58], [48, 58]],
		9: [[16, 16], [30, 16], [44, 16], [16, 41], [30, 41], [44, 41], [16, 64], [30, 64], [44, 64]]
	};
	function stickColor(n: number, i: number) {
		if (red && n === 5) return 'var(--t-red)';
		if ((n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1)) return 'var(--t-red)';
		return 'var(--t-green)';
	}
	const suit = $derived(/^[bcp][1-9]$/.test(k) ? k[0] : null);
	const n = $derived(suit ? Number(k[1]) : 0);
	const stickH = $derived(n >= 7 ? 18 : 24);
	const numColor = $derived(
		red && n === 5 ? 'var(--t-red)' : suit === 'p' ? 'var(--t-blue)' : suit === 'c' ? 'var(--t-red)' : 'var(--t-green)'
	);
</script>

<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" class="face" aria-hidden="true">
	{#if suit}
		<!-- big Arabic number on top, the picture below -->
		<text x="30" y="23" text-anchor="middle" class="num" font-size="25" fill={numColor}>{n}</text>
	{/if}

	{#if suit === 'p'}
		<g transform="translate(6.6 20) scale(0.78)">
			{#each DOTS[n] as [x, y], i}
				<circle cx={x} cy={y} r={DOT_R[n]} fill={dotColor(n, i)} />
				<circle cx={x} cy={y} r={DOT_R[n] * 0.62} fill="var(--t-face)" />
				<circle cx={x} cy={y} r={DOT_R[n] * 0.32} fill={dotColor(n, i)} />
				{#if n === 1}
					<circle cx={x} cy={y} r={DOT_R[n] * 0.85} fill="none" stroke="var(--t-blue)" stroke-width="1.6" />
				{/if}
			{/each}
		</g>
	{:else if suit === 'b'}
		<g transform="translate(6.6 20) scale(0.78)">
			{#if n === 1}
				<!-- a stylised bamboo shoot -->
				<path d="M30 70 C 28 55, 32 40, 30 14" stroke="var(--t-green)" stroke-width="6" fill="none" stroke-linecap="round" />
				<path d="M30 30 q 12 -8 18 -2 q -10 2 -18 8z M30 46 q -12 -8 -18 -2 q 10 2 18 8z M30 58 q 12 -6 16 0 q -9 0 -16 6z" fill="var(--t-green)" />
				<circle cx="30" cy="14" r="4" fill="var(--t-red)" />
				<path d="M26 38 h8 M27 52 h6 M26 24 h8" stroke="var(--t-face)" stroke-width="1.4" />
			{:else}
				{#each STICKS[n] as [x, y], i}
					<rect x={x - 4.6} y={y - stickH / 2} width="9.2" height={stickH} rx="3.5" fill={stickColor(n, i)} />
					<rect x={x - 5.6} y={y - 1.2} width="11.2" height="2.4" rx="1.2" fill={stickColor(n, i)} />
					<line x1={x} y1={y - stickH / 2 + 3} x2={x} y2={y + stickH / 2 - 3} stroke="var(--t-face)" stroke-width="1" opacity="0.55" />
				{/each}
			{/if}
		</g>
	{:else if suit === 'c'}
		<text x="30" y="46" text-anchor="middle" class="cjk" font-size="19" fill="var(--t-ink)">{NUMERALS[n - 1]}</text>
		<text x="30" y="77" text-anchor="middle" class="cjk" font-size="28" fill="var(--t-red)">萬</text>
	{:else if WINDS[k]}
		<text x="30" y="28" text-anchor="middle" class="num" font-size="30" fill="var(--t-ink)">{WINDS[k][1]}</text>
		<text x="30" y="72" text-anchor="middle" class="cjk" font-size="38" fill="var(--t-ink)">{WINDS[k][0]}</text>
	{:else if k === 'dr'}
		<text x="30" y="55" text-anchor="middle" class="cjk" font-size="46" fill="var(--t-red)">中</text>
		<text x="30" y="76" text-anchor="middle" class="label" font-size="10.5" fill="var(--t-red)">RED</text>
	{:else if k === 'dg'}
		<text x="30" y="55" text-anchor="middle" class="cjk" font-size="46" fill="var(--t-green)">發</text>
		<text x="30" y="76" text-anchor="middle" class="label" font-size="10.5" fill="var(--t-green)">GREEN</text>
	{:else if k === 'dw'}
		<rect x="11" y="6" width="38" height="54" rx="3" fill="none" stroke="var(--t-blue)" stroke-width="4" />
		<rect x="18" y="13" width="24" height="40" rx="2" fill="none" stroke="var(--t-blue)" stroke-width="2" />
		<text x="30" y="76" text-anchor="middle" class="label" font-size="10.5" fill="var(--t-blue)">WHITE</text>
	{:else if k[0] === 'f' || k[0] === 's'}
		{@const i = Number(k[1]) - 1}
		<text x="30" y="25" text-anchor="middle" class="num" font-size="26" fill="var(--t-blue)">{i + 1}</text>
		<text x="30" y="60" text-anchor="middle" class="cjk" font-size="34" fill={k[0] === 'f' ? 'var(--t-red)' : 'var(--t-green)'}>
			{k[0] === 'f' ? FLOWERS[i] : SEASONS[i]}
		</text>
		<text x="30" y="77" text-anchor="middle" class="label" font-size="8" fill={k[0] === 'f' ? 'var(--t-red)' : 'var(--t-green)'}>
			{k[0] === 'f' ? 'FLOWER' : 'SEASON'}
		</text>
	{:else if k === 'jk'}
		<path d="M30 4 L37.5 26 L59 26 L42 39.5 L49 62 L30 48 L11 62 L18 39.5 L1 26 L22.5 26 Z" fill="var(--t-gold)" stroke="var(--t-red)" stroke-width="1.5" />
		<text x="30" y="76" text-anchor="middle" class="label" font-size="10.5" fill="var(--t-red)">JOKER</text>
	{/if}
</svg>

<style>
	.face {
		width: 100%;
		height: 100%;
		display: block;
	}
	.num {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 800;
	}
	.label {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 800;
		letter-spacing: 0.5px;
	}
	.cjk {
		font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', 'Microsoft YaHei', serif;
		font-weight: 700;
	}
</style>
