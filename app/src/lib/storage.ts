import type { GameState } from './engine/types';

const KEY = 'jt.game.v1';
const PREFS = 'jt.prefs.v1';

export function saveGame(s: GameState) {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		/* storage unavailable */
	}
}

export function loadGame(): GameState | null {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as GameState) : null;
	} catch {
		return null;
	}
}

export function clearGame() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
}

export interface Prefs {
	name: string;
	hints: boolean;
	speed: 'slow' | 'normal' | 'fast';
	autoPass: boolean;
}

export const DEFAULT_PREFS: Prefs = { name: 'You', hints: false, speed: 'normal', autoPass: false };

export function loadPrefs(): Prefs {
	try {
		return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

export function savePrefs(p: Prefs) {
	try {
		localStorage.setItem(PREFS, JSON.stringify(p));
	} catch {
		/* ignore */
	}
}
