// Microsoft Clarity: session recordings, heatmaps and how long people stay.
// Turned on by setting CLARITY_ID in Railway's variables (the server hands it to the page).
// Extra tags let you filter Clarity by game and by solo / online play.
type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global {
	interface Window {
		clarity?: ClarityFn;
	}
}

let started = false;

export async function startAnalytics() {
	if (started || typeof window === 'undefined') return;
	started = true;
	try {
		const { clarity } = (await (await fetch('/api/config')).json()) as { clarity: string | null };
		if (!clarity) return;
		// Clarity's standard loader
		const c: ClarityFn = window.clarity ?? (((...a: unknown[]) => (c.q = c.q ?? []).push(a)) as ClarityFn);
		window.clarity = c;
		const s = document.createElement('script');
		s.async = true;
		s.src = `https://www.clarity.ms/tag/${clarity}`;
		document.head.appendChild(s);
	} catch {
		/* analytics never break the site */
	}
}

/** a custom tag on this session, e.g. tag('game', 'riichi') */
export function tag(key: string, value: string) {
	try {
		window.clarity?.('set', key, value);
	} catch {
		/* ignore */
	}
}

/** a custom event, e.g. track('hand_finished') */
export function track(event: string) {
	try {
		window.clarity?.('event', event);
	} catch {
		/* ignore */
	}
}
