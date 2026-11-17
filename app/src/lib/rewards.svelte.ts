// Jade balance, owned items, equipped skins and Lucky Hour state for the signed-in player.
import { DEFAULT_EQUIPPED, skinVars, type ShopItem } from './shop';

export interface Lucky {
	active: boolean;
	endsAt: number | null;
	nextAt: number;
}
export const rewards = $state({
	enabled: false,
	signedIn: false,
	jade: 0,
	tokens: 0,
	equipped: { ...DEFAULT_EQUIPPED } as Record<string, string>,
	owned: [] as string[],
	daily: { claimed: true, streak: 0, amount: 0 },
	firstWinDone: false,
	lucky: null as Lucky | null,
	/** the last "+N Jade" to pop up */
	gain: null as { n: number; at: number; lucky: boolean } | null
});

const SKIN_KEY = 'pt.skins';
const SKIN_VARS = ['--t-back', '--t-back-2', '--t-edge', '--felt', '--felt-2'];

export function applySkins(equipped: Record<string, string>) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement.style;
	for (const v of SKIN_VARS) root.removeProperty(v);
	for (const [k, v] of Object.entries(skinVars(equipped))) root.setProperty(k, v);
	try {
		localStorage.setItem(SKIN_KEY, JSON.stringify(equipped));
	} catch {
		/* private mode */
	}
}
/** put last session's skins on straight away, before the server answers */
export function restoreSkins() {
	try {
		const s = JSON.parse(localStorage.getItem(SKIN_KEY) ?? 'null');
		if (s && typeof s === 'object') applySkins(s);
	} catch {
		/* ignore */
	}
}

let known: number | null = null;
function take(d: Record<string, unknown>, quiet = false) {
	rewards.enabled = !!d.enabled || rewards.enabled;
	if ('signedIn' in d) rewards.signedIn = !!d.signedIn;
	if (d.lucky) rewards.lucky = d.lucky as Lucky;
	if (typeof d.jade !== 'number') return;
	if (!quiet && known !== null && d.jade > known) rewards.gain = { n: d.jade - known, at: Date.now(), lucky: !!rewards.lucky?.active };
	known = d.jade;
	rewards.jade = d.jade;
	rewards.tokens = Number(d.tokens ?? 0);
	rewards.equipped = (d.equipped as Record<string, string>) ?? { ...DEFAULT_EQUIPPED };
	rewards.owned = (d.owned as string[]) ?? [];
	rewards.daily = (d.daily as typeof rewards.daily) ?? rewards.daily;
	rewards.firstWinDone = !!d.firstWinDone;
	applySkins(rewards.equipped);
}

export async function refreshRewards() {
	try {
		const r = await fetch('/api/rewards');
		if (r.ok) take(await r.json());
	} catch {
		/* offline */
	}
}

async function post(path: string, body: unknown = {}): Promise<{ ok: boolean; error?: string; earned?: number }> {
	try {
		const r = await fetch(`/api/rewards/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const d = await r.json().catch(() => ({}));
		if (!r.ok) return { ok: false, error: d.error ?? 'Something went wrong' };
		take(d, path !== 'daily');
		return { ok: true, earned: d.earned };
	} catch {
		return { ok: false, error: 'You seem to be offline' };
	}
}
export const claimDaily = () => post('daily');
export const buyItem = (item: ShopItem) => post('buy', { item: item.id });
export const equipItem = (item: ShopItem) => post('equip', { item: item.id });

let timer: ReturnType<typeof setInterval> | null = null;
export function startRewards() {
	restoreSkins();
	refreshRewards();
	if (timer) return;
	timer = setInterval(() => {
		if (document.visibilityState === 'visible') refreshRewards();
	}, 30_000);
}
export function stopRewards() {
	if (timer) clearInterval(timer);
	timer = null;
	known = null;
	rewards.signedIn = false;
	applySkins({});
}
