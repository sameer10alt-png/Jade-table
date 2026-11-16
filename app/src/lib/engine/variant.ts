import type { SpecialShape } from './hand';
import type { Tile, WallOptions } from './tiles';
import type { GameState, Meld, ScoreLine, VariantId } from './types';

export interface WinContext {
	state: GameState;
	seat: number;
	/** concealed tiles including the winning tile */
	concealed: Tile[];
	melds: Meld[];
	flowers: Tile[];
	winTile: Tile;
	selfDraw: boolean;
	from: number | null;
	robbingKong: boolean;
	afterKong: boolean;
	lastTile: boolean;
	firstGoAround: boolean;
	seatWind: number;
	roundWind: number;
	isDealer: boolean;
}

export interface Scored {
	valid: boolean;
	/** why a complete-shaped hand still can't be declared (no yaku, below minimum) */
	reason?: string;
	lines: ScoreLine[];
	total: number;
	summary: string;
	/** Riichi: base points used for payment */
	basic?: number;
}

export interface WinSettle {
	seat: number;
	from: number | null;
	scored: Scored;
}

export interface Settlement {
	deltas: number[];
	notes: string[];
	/** the pot (riichi sticks / drawn-hand kitty) was paid out; the game resets it */
	potTaken?: boolean;
}

export interface DrawSettlement extends Settlement {
	dealerKeeps: boolean;
	tenpai?: number[];
	/** amount added to the pot */
	potAdd?: number;
}

export interface Variant {
	id: VariantId;
	name: string;
	tagline: string;
	handSize: 13 | 16;
	sets: 4 | 5;
	wall: WallOptions;
	/** tiles left in the wall when the hand ends drawn */
	reserve: number;
	allowChow: boolean;
	multipleWinners: boolean;
	startScore: number;
	riichi: boolean;
	goulash: boolean;
	special?: SpecialShape;
	/** variants whose wins are a list of named hands: can these tiles be declared? (melds included) */
	complete?: (concealed: Tile[], melds: Meld[]) => boolean;
	/** named-hand variants: tiles still missing for the nearest hand (0 = complete), and how many hands are that close */
	distance?: (concealed: Tile[], melds: Meld[], seatWind: number) => { missing: number; targets: number };
	/** the same for every possible discard from a 14-tile hand, in one go */
	discardDistances?: (concealed: Tile[], melds: Meld[], seatWind: number) => Map<string, { missing: number; targets: number }>;
	shantenSpecials: { pairs?: boolean; orphans?: boolean };
	/** Riichi honba: the counter also grows on drawn hands */
	streakOnDraw: boolean;
	/** game ends when someone drops below zero */
	bustOut: boolean;
	/** the deal passes after every hand, even when the dealer wins (MCR) */
	rotateDealer?: boolean;
	/** hands below a points minimum can't be declared (Taiwanese round minimum, MCR 8 fan) */
	minimumHand?: boolean;
	scoreWin(ctx: WinContext): Scored;
	settleWin(state: GameState, wins: WinSettle[]): Settlement;
	settleDraw(state: GameState): DrawSettlement;
	/** the scoring table shown on the rules page */
	scoringTable: { name: string; value: string; note?: string }[];
	rulesSummary: string[];
}
