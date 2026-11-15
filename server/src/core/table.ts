// The game-table logic, independent of where it is hosted.
//
// A host (Cloudflare Durable Object, or a plain Node.js server on Railway) only has to provide
// three things: who is connected, how to save the table, and how to wake us up later.
// Everything that matters for fairness lives here and is shared by every host:
// the server runs the same engine as the browser, validates every move, drives the bots,
// and sends each player only what they may see (redactFor).
import { botAction } from '../../../app/src/lib/engine/bots';
import { applyAction, BOT_NAMES, legal, newGame, pendingSeats, VARIANTS } from '../../../app/src/lib/engine/game';
import type { Action, BotLevel, GameState } from '../../../app/src/lib/engine/types';
import { fillProfile, type Profile } from '../../../app/src/lib/online/profile';
import {
	redactFor,
	type ClientMsg,
	type RoomInfo,
	type ServerMsg,
	type TableSettings
} from '../../../app/src/lib/online/protocol';

export interface Seat {
	playerId: string;
	name: string;
}

export interface Room {
	code: string;
	settings: TableSettings;
	hostId: string;
	status: 'lobby' | 'playing';
	/** people only; empty seats are filled by bots when the game starts */
	seats: (Seat | null)[];
	game: GameState | null;
	/** players who pressed "Next hand" */
	ready: string[];
	deadline: number | null;
	deadlineKey: string;
	/** when each disconnected player left (for the reconnect grace period) */
	gone: Record<string, number>;
	created: number;
	/** last time anything happened (used to clean up abandoned tables) */
	touched?: number;
	/** made by quick match: seats are pre-filled and the game starts by itself */
	quick?: boolean;
	/** human-looking names to use for the bot seats (quick match), so filled seats read as people */
	fillNames?: string[];
	/** made-up profiles for the filled seats, by name (quick match), and by seat once the game starts */
	fillProfiles?: Profile[];
	botProfiles?: (Profile | null)[];
	/** last hand that was rated, so each hand counts once */
	ratedKey?: string;
}

/** One open connection to a player's browser. */
export interface Conn {
	pid: string;
	send(msg: ServerMsg): void;
}

/** What a hosting platform must provide. */
export interface Host {
	/** open connections, optionally only those of one player */
	connections(pid?: string): Conn[];
	save(room: Room): Promise<void>;
	/** run TableCore.alarm() at this time (null = cancel) */
	setAlarm(at: number | null): Promise<void>;
	/** a hand just finished (once per hand): the host can rate it */
	handEnded?(room: Room): Promise<void> | void;
}

// how long a person gets before the server plays for them
// online only (people and filled seats); solo play against the computer has no clock
const LIMIT: Record<string, number> = { claim: 15_000, turn: 30_000, passing: 30_000, ended: 45_000, seating: 15_000, wallbreak: 15_000 };
// a dropped connection (e.g. a page refresh) gets this long before a bot covers the seat
const GRACE = 10_000;
// how long bots "think", so people can follow what happened
const BOT_DELAY: Record<string, number> = { claim: 500, turn: 1000, passing: 600, seating: 800, wallbreak: 1000 };
// Humans don't play on a metronome: mostly a natural pause, now and then a longer think.
// Gives bots a believable, varied cadence so filled seats feel like real players.
function humanDelay(base: number): number {
	// about a second a move, now and then a longer think
	const mult = Math.random() < 0.1 ? 1.4 + Math.random() * 0.6 : 0.85 + Math.random() * 0.35;
	return Math.round(base * mult);
}
const LEVELS: BotLevel[] = ['beginner', 'intermediate', 'expert'];

export function cleanSettings(raw: Partial<TableSettings> | undefined): TableSettings | null {
	if (!raw || !raw.variant || !VARIANTS[raw.variant]) return null;
	return {
		variant: raw.variant,
		rounds: [1, 2, 4].includes(Number(raw.rounds)) ? Number(raw.rounds) : 1,
		botLevel: raw.botLevel === 'mixed' || LEVELS.includes(raw.botLevel as BotLevel) ? (raw.botLevel as BotLevel | 'mixed') : 'intermediate',
		minimum: raw.minimum !== false,
		redFives: raw.redFives !== false
	};
}

export const cleanName = (s: string | null) => (s ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16) || 'Guest';
export const validPid = (s: string | null | undefined): s is string => !!s && /^[\w-]{8,64}$/.test(s);

export type JoinResult = { ok: true } | { ok: false; message: string; code: number };

export class TableCore {
	constructor(
		public room: Room | null,
		private host: Host
	) {}

	// ---- table lifecycle ----

	async init(code: string, settings: TableSettings, hostId: string): Promise<boolean> {
		if (this.room) return false; // code already taken
		this.room = {
			code,
			settings,
			hostId,
			status: 'lobby',
			seats: [null, null, null, null],
			game: null,
			ready: [],
			deadline: null,
			deadlineKey: '',
			gone: {},
			created: Date.now(),
			touched: Date.now()
		};
		await this.host.save(this.room);
		return true;
	}

	summary() {
		const r = this.room;
		if (!r) return null;
		return { code: r.code, status: r.status, settings: r.settings, players: r.seats.filter(Boolean).length };
	}

	/**
	 * Seat a player (or recognise a returning one) before their connection is accepted.
	 * `previousPid`: a guest id this player used before signing in. Their guest seat (and host
	 * role) move to their account, so signing in mid-game loses nothing.
	 */
	join(pid: string | null, rawName: string | null, previousPid?: string | null): JoinResult {
		const r = this.room;
		if (!r) return { ok: false, message: 'No such table', code: 4004 };
		if (!validPid(pid)) return { ok: false, message: 'Bad player id', code: 4000 };
		if (previousPid && validPid(previousPid) && previousPid !== pid && !r.seats.some((s) => s?.playerId === pid)) {
			for (const s of r.seats) if (s?.playerId === previousPid) s.playerId = pid;
			if (r.hostId === previousPid) r.hostId = pid;
			r.ready = r.ready.map((x) => (x === previousPid ? pid : x));
			if (r.gone) delete r.gone[previousPid];
		}
		const name = cleanName(rawName);
		let seat = r.seats.findIndex((s) => s?.playerId === pid);
		if (seat < 0) {
			if (r.status !== 'lobby') return { ok: false, message: 'This table has already started', code: 4009 };
			seat = r.seats.findIndex((s) => s === null);
			if (seat < 0) return { ok: false, message: 'This table is full', code: 4009 };
			r.seats[seat] = { playerId: pid, name };
		} else if (r.status === 'lobby') {
			r.seats[seat]!.name = name;
		}
		r.gone ??= {};
		delete r.gone[pid];
		return { ok: true };
	}

	/** A quick-match table: the matched players are seated straight away (first one hosts, so
	 * they can offer "play again"). Each gets the usual grace period to arrive. */
	async initQuick(code: string, settings: TableSettings, players: { pid: string; name: string }[], fillNames: string[] = [], fillProfiles: Profile[] = []) {
		if (!(await this.init(code, settings, players[0].pid))) return false;
		const r = this.room!;
		const now = Date.now();
		players.slice(0, 4).forEach((p, i) => {
			r.seats[i] = { playerId: p.pid, name: cleanName(p.name) };
			r.gone[p.pid] = now;
		});
		r.quick = true;
		r.fillNames = fillNames.map(cleanName).filter(Boolean);
		r.fillProfiles = fillProfiles;
		await this.host.save(r);
		return true;
	}

	/** Start a quick-match table once everyone matched has arrived (or when `force`, after a wait). */
	async quickStart(force = false): Promise<boolean> {
		const r = this.room;
		if (!r?.quick || r.status !== 'lobby') return false;
		const people = r.seats.filter(Boolean);
		if (!force && !people.every((s) => this.isConnected(s!.playerId))) return false;
		// anyone not here yet gets a fresh grace period from the start
		const now = Date.now();
		for (const s of people) if (!this.isConnected(s!.playerId)) r.gone[s!.playerId] = now;
		this.startGame();
		await this.changed();
		return true;
	}

	/** Call after the host has registered the new connection. */
	async connected() {
		if (await this.quickStart()) return;
		await this.changed();
	}

	/** Call after the host has removed a closed connection. */
	async disconnected(pid: string) {
		const r = this.room;
		if (r && !this.isConnected(pid)) (r.gone ??= {})[pid] = Date.now();
		// A disconnected player is covered by a bot once their grace period ends.
		await this.changed();
	}

	async message(pid: string, raw: string, reply: (m: ServerMsg) => void) {
		const r = this.room;
		if (!r) return;
		let msg: ClientMsg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return reply({ type: 'error', message: 'Bad message' });
		}
		const seat = r.seats.findIndex((s) => s?.playerId === pid);

		switch (msg.type) {
			case 'ping':
				return reply({ type: 'pong' });
			case 'start':
			case 'restart': {
				if (pid !== r.hostId) return reply({ type: 'error', message: 'Only the host can start the game' });
				if (msg.type === 'start' && r.status !== 'lobby') return;
				if (msg.type === 'restart' && r.game?.phase !== 'gameover') return;
				this.startGame();
				return this.changed();
			}
			case 'action': {
				const g = r.game;
				if (!g || seat < 0) return reply({ type: 'error', message: 'You are not seated at this game' });
				if (msg.action?.t === 'next') return; // hands advance through "ready"
				try {
					r.game = applyAction(g, seat, msg.action);
				} catch (e) {
					// A move based on an older update that is no longer valid is a duplicate sent
					// while the network was slow (e.g. a double tap): drop it quietly.
					if (typeof msg.seq === 'number' && msg.seq < g.seq) return;
					return reply({ type: 'error', message: (e as Error).message });
				}
				return this.changed();
			}
			case 'ready': {
				// ignore repeats: a client that keeps sending "ready" must not cause any work
				if (r.game?.phase !== 'ended' || r.ready.includes(pid)) return;
				r.ready.push(pid);
				if (this.allReady()) {
					r.game = applyAction(r.game, 0, { t: 'next' });
					r.ready = [];
				}
				return this.changed();
			}
		}
	}

	// ---- game flow ----

	startGame() {
		const r = this.room!;
		let botIndex = 0;
		const taken = new Set(r.seats.filter(Boolean).map((s) => s!.name));
		const levelFor = (n: number): BotLevel => (r.settings.botLevel === 'mixed' ? LEVELS[n % 3] : r.settings.botLevel);
		const names = r.fillNames?.length ? r.fillNames : BOT_NAMES; // human-looking names for quick match
		const seats = r.seats.map((s) => {
			if (s) return { name: s.name, bot: null };
			const level = levelFor(botIndex);
			let bot = names[botIndex++ % names.length];
			while (taken.has(bot)) bot = names[botIndex++ % names.length] + ' ' + botIndex;
			taken.add(bot);
			return { name: bot, bot: level };
		});
		const lvl = levelFor(0);
		r.game = newGame({
			variant: r.settings.variant,
			bots: [lvl, lvl, lvl],
			rounds: r.settings.rounds,
			playerName: '',
			minimum: r.settings.minimum,
			redFives: r.settings.redFives,
			seed: (Math.random() * 2 ** 31) | 0,
			seats
		});
		// a profile for each filled seat: the one shown while waiting (quick match), or a new one
		r.botProfiles = seats.map((s, i) =>
			s.bot ? (r.fillProfiles?.find((p) => p.name === s.name) ?? fillProfile(s.name, s.bot, `${r.code}:${i}`)) : null
		);
		r.status = 'playing';
		r.ready = [];
		r.deadlineKey = '';
	}

	/** the profile of a filled seat (null if it is a person's or the game hasn't started) */
	botProfile(seat: number): Profile | null {
		return this.room?.botProfiles?.[seat] ?? null;
	}

	isConnected(pid: string) {
		return this.host.connections(pid).length > 0;
	}

	/** seats the server plays: bots, and people who have been disconnected for longer than GRACE */
	isAuto(seat: number) {
		const s = this.room!.seats[seat];
		if (!s) return true;
		if (this.isConnected(s.playerId)) return false;
		return Date.now() - (this.room!.gone?.[s.playerId] ?? 0) >= GRACE;
	}

	/** a person who just dropped and may come back: wake up when their grace period ends */
	graceEnds(seat: number): number | null {
		const s = this.room!.seats[seat];
		if (!s || this.isConnected(s.playerId)) return null;
		const t = (this.room!.gone?.[s.playerId] ?? 0) + GRACE;
		return t > Date.now() ? t : null;
	}

	/** in riichi your discard is forced, so the server makes it for you */
	riichiAuto(g: GameState, seat: number) {
		return g.phase === 'turn' && g.turn === seat && !!g.players[seat].riichi && !!g.drawn && !legal(g, seat).tsumo;
	}

	allReady() {
		const r = this.room!;
		return r.seats.every((s) => !s || !this.isConnected(s.playerId) || r.ready.includes(s.playerId));
	}

	/** Decide when the next automatic move happens and ask the host to wake us then. */
	async schedule() {
		const r = this.room!;
		const g = r.game;
		const nobodyHere = r.seats.every((s) => !s || !this.isConnected(s.playerId));
		// No one connected: park the table. Nothing runs until someone returns.
		if (!g || r.status !== 'playing' || g.phase === 'gameover' || nobodyHere) {
			r.deadline = null;
			await this.host.setAlarm(null);
			return;
		}
		const now = Date.now();
		let at: number | null;
		if (g.phase === 'ended') {
			const key = `ended:${g.handNo}`;
			if (r.deadlineKey !== key) {
				r.deadlineKey = key;
				r.deadline = now + LIMIT.ended;
			}
			at = this.allReady() ? now + 300 : r.deadline;
		} else {
			const pending = pendingSeats(g);
			const key = `${g.seq}:${g.phase}:${pending.join(',')}`;
			if (r.deadlineKey !== key) {
				r.deadlineKey = key;
				const people = pending.filter((s) => !this.isAuto(s));
				r.deadline = people.length ? now + LIMIT[g.phase] : null;
			}
			if (pending.some((s) => this.isAuto(s))) at = now + humanDelay(BOT_DELAY[g.phase]);
			else if (pending.some((s) => this.riichiAuto(g, s))) at = now + 900;
			else at = r.deadline;
			for (const s of pending) {
				const t = this.graceEnds(s);
				if (t && (at === null || t < at)) at = t;
			}
		}
		await this.host.setAlarm(at);
	}

	/** The host calls this when the alarm set by schedule() fires. */
	async alarm() {
		const r = this.room;
		const g = r?.game;
		if (!r || !g || r.status !== 'playing') return;
		const now = Date.now();
		const expired = r.deadline !== null && now >= r.deadline - 50;
		try {
			if (g.phase === 'ended') {
				if (this.allReady() || expired) {
					r.game = applyAction(g, 0, { t: 'next' });
					r.ready = [];
				}
			} else {
				const pending = pendingSeats(g);
				let seat = pending.find((s) => this.isAuto(s));
				let action: Action | null = seat !== undefined ? botAction(g, seat) : null;
				if (!action) {
					seat = pending.find((s) => this.riichiAuto(g, s));
					if (seat !== undefined) action = { t: 'discard', tile: g.drawn!.id };
				}
				if (!action && expired && pending.length) {
					// time ran out: pass on calls, otherwise let the bot logic make the move
					seat = pending[0];
					action = g.phase === 'claim' ? { t: 'pass' } : botAction(g, seat);
				}
				if (action && seat !== undefined) r.game = applyAction(g, seat, action);
			}
		} catch (e) {
			console.error('auto move failed', e);
		}
		await this.changed();
	}

	// ---- plumbing ----

	async changed() {
		if (!this.room) return;
		this.room.touched = Date.now();
		const g = this.room.game;
		if (g?.phase === 'ended' && g.result) {
			const key = `${g.opts.seed}:${g.handNo}`;
			if (this.room.ratedKey !== key) {
				this.room.ratedKey = key;
				try {
					await this.host.handEnded?.(this.room);
				} catch (e) {
					console.error('rating failed', e);
				}
			}
		}
		await this.schedule();
		await this.host.save(this.room);
		this.broadcast();
	}

	roomInfo(pid: string): RoomInfo {
		const r = this.room!;
		return {
			code: r.code,
			status: r.status,
			settings: r.settings,
			youAreHost: pid === r.hostId,
			deadline: r.deadline,
			quick: !!r.quick,
			seats: r.seats.map((s, i) => {
				if (s)
					return {
						name: s.name,
						isBot: false,
						connected: this.isConnected(s.playerId),
						isYou: s.playerId === pid,
						isHost: s.playerId === r.hostId,
						ready: r.ready.includes(s.playerId)
					};
				if (r.game)
					return { name: r.game.players[i].name, isBot: true, connected: true, isYou: false, isHost: false, ready: true };
				return null;
			})
		};
	}

	/** Send every connection its own view of the table. */
	broadcast() {
		const r = this.room;
		if (!r) return;
		for (const c of this.host.connections()) {
			const seat = r.seats.findIndex((s) => s?.playerId === c.pid);
			c.send({
				type: 'state',
				room: this.roomInfo(c.pid),
				seat: seat >= 0 ? seat : null,
				game: r.game ? redactFor(r.game, seat >= 0 ? seat : null) : null
			});
		}
	}
}
