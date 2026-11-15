// Player profiles shown at online tables: a picture and a record.
// Real players: their account picture (Google) or initials, and their real hand record.
// Filled seats (bots at quick-match tables): a made-up profile that looks like a player's.
import type { BotLevel } from '../engine/types';

export interface Profile {
	name: string;
	/** an image URL, `gen:<seed>` for a drawn avatar, or null for initials */
	picture: string | null;
	hands: number;
	wins: number;
	/** 'YYYY-MM' the player joined */
	since: string | null;
}

/** small seeded random generator, so the same seed always gives the same profile */
export function seeded(seed: string) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}

const HANDS: Record<BotLevel, [number, number]> = { beginner: [12, 140], intermediate: [90, 650], expert: [320, 1600] };
const WIN_RATE: Record<BotLevel, [number, number]> = { beginner: [0.16, 0.24], intermediate: [0.23, 0.3], expert: [0.28, 0.37] };

/** a believable profile for a filled seat */
export function fillProfile(name: string, level: BotLevel, seed: string, now = new Date()): Profile {
	const r = seeded(seed + name);
	const pick = ([a, b]: [number, number]) => a + r() * (b - a);
	const hands = Math.round(pick(HANDS[level]));
	const wins = Math.round(hands * pick(WIN_RATE[level]));
	const back = 1 + Math.floor(r() * 4); // joined 1-4 months ago
	const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
	const since = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	const picture = r() < 0.6 ? `gen:${Math.floor(r() * 1e9)}` : null;
	return { name, picture, hands, wins, since };
}

const SKIN = ['#f6d3b3', '#eabf98', '#d6a275', '#b07a4f', '#8a5a36', '#5e3b22'];
const HAIR = ['#1d1a18', '#3b2416', '#6b4423', '#a8743a', '#d9b46a', '#8c8c8c', '#7a2b2b', '#2c3e66'];
const BG = ['#f2c4c4', '#c9e4d6', '#c8d8f2', '#f2e2b8', '#dccff2', '#f2d2b8', '#bfe3e8', '#e8e8e8'];
const SHIRT = ['#2f6f4e', '#7a3045', '#2c4a7a', '#b5652b', '#5a4a8a', '#3d3d3d', '#a83232', '#1f7a7a'];

/** a simple drawn face for `gen:<seed>` pictures, as an SVG data URL */
export function drawnAvatar(seed: string): string {
	const r = seeded(seed);
	const p = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
	const skin = p(SKIN), hair = p(HAIR), bg = p(BG), shirt = p(SHIRT);
	const style = Math.floor(r() * 5);
	const glasses = r() < 0.25;
	const smile = r() < 0.7;
	const hairShape = [
		'M14 30 Q14 10 32 10 Q50 10 50 30 Q46 18 32 18 Q18 18 14 30Z', // short
		'M12 34 Q10 8 32 8 Q54 8 52 34 L52 46 Q48 30 46 22 Q32 26 18 22 Q16 30 12 46Z', // long
		'M15 28 Q16 12 32 12 Q48 12 49 28 Q40 20 32 21 Q24 20 15 28Z', // neat
		'M13 30 Q12 9 32 9 Q52 9 51 30 Q50 22 44 20 Q38 26 32 20 Q26 26 20 20 Q14 22 13 30Z', // curly fringe
		'M18 22 Q22 12 32 12 Q42 12 46 22 Q40 18 32 18 Q24 18 18 22Z' // very short
	][style];
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>` +
		`<path d="M10 64 Q12 46 32 46 Q52 46 54 64Z" fill="${shirt}"/>` +
		`<rect x="27" y="38" width="10" height="10" rx="3" fill="${skin}"/>` +
		`<ellipse cx="32" cy="30" rx="15" ry="17" fill="${skin}"/>` +
		`<path d="${hairShape}" fill="${hair}"/>` +
		`<circle cx="26" cy="30" r="1.8" fill="#222"/><circle cx="38" cy="30" r="1.8" fill="#222"/>` +
		(glasses ? `<g fill="none" stroke="#333" stroke-width="1.4"><circle cx="26" cy="30" r="4.5"/><circle cx="38" cy="30" r="4.5"/><path d="M30.5 30h3"/></g>` : '') +
		(smile ? `<path d="M27 37 Q32 41 37 37" fill="none" stroke="#7a3b2e" stroke-width="1.6" stroke-linecap="round"/>` : `<path d="M28 38h8" stroke="#7a3b2e" stroke-width="1.6" stroke-linecap="round"/>`) +
		`</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** what an <img> should show for a profile picture (null = use initials) */
export function pictureSrc(picture: string | null | undefined): string | null {
	if (!picture) return null;
	return picture.startsWith('gen:') ? drawnAvatar(picture.slice(4)) : picture;
}
