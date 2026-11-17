// Jade: the coins players earn by playing, and the shop they spend them in.
// Shared by the server (prices, earning rules) and the browser (previews, skins).

export type ItemKind = 'back' | 'felt' | 'token';
export interface ShopItem {
	id: string;
	kind: ItemKind;
	name: string;
	price: number;
	/** two colours for a gradient (backs and felts) */
	colors?: [string, string];
	/** tokens: how many you get */
	qty?: number;
	blurb?: string;
}

export const ITEMS: ShopItem[] = [
	{ id: 'back-jade', kind: 'back', name: 'Jade', price: 0, colors: ['#1e7a58', '#14563f'] },
	{ id: 'back-ruby', kind: 'back', name: 'Ruby', price: 300, colors: ['#b3262d', '#7a1519'] },
	{ id: 'back-sapphire', kind: 'back', name: 'Sapphire', price: 300, colors: ['#1f4f9c', '#13306a'] },
	{ id: 'back-midnight', kind: 'back', name: 'Midnight', price: 500, colors: ['#2e3242', '#121420'] },
	{ id: 'back-sakura', kind: 'back', name: 'Sakura', price: 600, colors: ['#e48aa6', '#b85677'] },
	{ id: 'back-gold', kind: 'back', name: 'Imperial Gold', price: 1500, colors: ['#e0b13a', '#9a6e12'] },

	{ id: 'felt-slate', kind: 'felt', name: 'Slate', price: 0, colors: ['#2b303b', '#191d25'] },
	{ id: 'felt-green', kind: 'felt', name: 'Classic Green', price: 400, colors: ['#1f6b4a', '#0f3d29'] },
	{ id: 'felt-navy', kind: 'felt', name: 'Navy', price: 400, colors: ['#1d3557', '#0d1b30'] },
	{ id: 'felt-burgundy', kind: 'felt', name: 'Burgundy', price: 600, colors: ['#6b1f2e', '#3a0d17'] },
	{ id: 'felt-teal', kind: 'felt', name: 'Lagoon', price: 600, colors: ['#116466', '#073638'] },
	{ id: 'felt-royal', kind: 'felt', name: 'Royal Purple', price: 1000, colors: ['#4b2a7a', '#26123f'] },

	{ id: 'dragon-3', kind: 'token', name: '3 Dragon tokens', price: 150, qty: 3, blurb: 'Extra Dragon questions or game reviews after your daily ones run out.' },
	{ id: 'dragon-10', kind: 'token', name: '10 Dragon tokens', price: 400, qty: 10, blurb: 'Best value. Never get cut off by the Dragon.' }
];
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);
export const DEFAULT_EQUIPPED: Record<'back' | 'felt', string> = { back: 'back-jade', felt: 'felt-slate' };

// ---- earning ----
export const EARN = {
	hand: 5, // every finished hand
	win: 20, // on top, when you win it
	people: 5, // on top, at a table with other real players
	firstWin: 50, // your first win each day
	dailyBase: 50, // daily bonus
	dailyStep: 10, // +10 per day in a row
	dailyMax: 100
};
export const dailyBonus = (streak: number) => Math.min(EARN.dailyMax, EARN.dailyBase + EARN.dailyStep * Math.max(0, streak - 1));

/** Lucky Hours (UTC): double Jade. 00:00 UTC = 7pm New York, 18:00 UTC = 7pm London. */
export const LUCKY_HOURS_UTC = [0, 18];

/** the scheduled Lucky Hour around `now`, combined with one an admin started */
export function luckyState(now: number, adminUntil = 0): { active: boolean; endsAt: number | null; nextAt: number } {
	const hourStart = (t: number) => t - (t % 3_600_000);
	const inSchedule = LUCKY_HOURS_UTC.includes(new Date(now).getUTCHours());
	const scheduledEnd = inSchedule ? hourStart(now) + 3_600_000 : null;
	const adminOn = adminUntil > now;
	const endsAt = adminOn || scheduledEnd ? Math.max(adminOn ? adminUntil : 0, scheduledEnd ?? 0) : null;
	let next = hourStart(now) + 3_600_000;
	while (!LUCKY_HOURS_UTC.includes(new Date(next).getUTCHours())) next += 3_600_000;
	return { active: endsAt !== null, endsAt, nextAt: next };
}

/** Jade for one hand */
export function handJade(outcome: string, withPeople: boolean, lucky: boolean) {
	let n = EARN.hand + (outcome === 'win' ? EARN.win : 0) + (withPeople ? EARN.people : 0);
	if (lucky) n *= 2;
	return n;
}

/** CSS variables for the equipped skins */
export function skinVars(equipped: Partial<Record<'back' | 'felt', string>>): Record<string, string> {
	const out: Record<string, string> = {};
	const back = itemById(equipped.back ?? '');
	if (back?.colors && back.id !== DEFAULT_EQUIPPED.back) {
		out['--t-back'] = back.colors[0];
		out['--t-back-2'] = back.colors[1];
		out['--t-edge'] = back.colors[0];
	}
	const felt = itemById(equipped.felt ?? '');
	if (felt?.colors && felt.id !== DEFAULT_EQUIPPED.felt) {
		out['--felt'] = felt.colors[0];
		out['--felt-2'] = felt.colors[1];
	}
	return out;
}
