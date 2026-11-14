// Messages between the browser and the game server, plus the one rule that keeps online play
// fair: a player is only ever sent what they are allowed to see.
import type { Action, BotLevel, GameState, VariantId } from '../engine/types';
import type { Tile } from '../engine/tiles';

export interface TableSettings {
	variant: VariantId;
	rounds: number;
	/** one level for every bot, or 'mixed' = beginner, intermediate and expert */
	botLevel: BotLevel | 'mixed';
	minimum: boolean;
	redFives: boolean;
}

export interface SeatInfo {
	name: string;
	isBot: boolean;
	connected: boolean;
	isYou: boolean;
	isHost: boolean;
	/** has pressed "Next hand" */
	ready: boolean;
}

export interface RoomInfo {
	code: string;
	status: 'lobby' | 'playing';
	settings: TableSettings;
	/** seats in game order; null = empty (a bot takes it when the game starts) */
	seats: (SeatInfo | null)[];
	youAreHost: boolean;
	/** when the current human decision is auto-played (ms since epoch) */
	deadline: number | null;
	/** made by quick match: starts by itself once the matched players arrive */
	quick?: boolean;
}

export type ClientMsg =
	| { type: 'start' }
	/** `seq`: the game update this move was based on (lets the server drop stale duplicates) */
	| { type: 'action'; action: Action; seq?: number }
	| { type: 'ready' }
	| { type: 'restart' }
	| { type: 'ping' };

export type ServerMsg =
	| { type: 'state'; room: RoomInfo; game: GameState | null; seat: number | null }
	| { type: 'error'; message: string }
	| { type: 'pong' };

/** Characters that can't be confused when read aloud or typed (no 0/O, 1/I/L). */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeTableCode(random: () => number = Math.random): string {
	let code = '';
	for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
	return code;
}

export function isTableCode(code: string): boolean {
	return new RegExp(`^[${CODE_CHARS}]{6}$`).test(code);
}

/**
 * The view of the game one seat may see. Hidden: other players' hands, the wall order,
 * the RNG seed (it would let you predict the wall), what others drew, and what others
 * chose in a claim window before it resolves.
 */
export function redactFor(g: GameState, seat: number | null): GameState {
	const v: GameState = structuredClone(g);
	let n = 0;
	const hidden = (): Tile => ({ id: -1000 - n++, k: 'x' });
	v.rng = 0;
	v.opts = { ...v.opts, seed: 0 };
	v.wall = v.wall.map(hidden);
	v.deadWall = v.deadWall.map(hidden);
	const handsPublic = g.phase === 'ended' || g.phase === 'gameover';
	v.players.forEach((p, i) => {
		if (i !== seat && !handsPublic) p.hand = p.hand.map(hidden);
	});
	if (g.drawn && g.turn !== seat) v.drawn = hidden();
	if (v.claim) {
		v.claim.options = v.claim.options.map((o, i) => (i === seat ? o : o ? [] : null));
		v.claim.responses = v.claim.responses.map((r, i) => (i === seat || r === null ? r : 'pass'));
	}
	if (v.passing) v.passing.chosen = v.passing.chosen.map((c, i) => (i === seat || c === null ? c : []));
	return v;
}
