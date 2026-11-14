// End-to-end test against a running game server:
//   cd server && npm run dev        (in one terminal)
//   GAME_SERVER=http://127.0.0.1:8787 npx vitest run online   (in another)
import { describe, expect, it } from 'vitest';
import { botAction } from '../engine/bots';
import { pendingSeats } from '../engine/game';
import type { GameState } from '../engine/types';
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol';

const SERVER = process.env.GAME_SERVER;

class TestClient {
	ws!: WebSocket;
	room: RoomInfo | null = null;
	game: GameState | null = null;
	seat: number | null = null;
	errors: string[] = [];
	states = 0;
	autoplay = false;
	readyFor = 0;
	actedOn = '';
	checks: string[] = [];

	constructor(
		public pid: string,
		public name: string
	) {}

	connect(code: string) {
		const url = SERVER!.replace(/^http/, 'ws') + `/ws/table/${code}?pid=${this.pid}&name=${this.name}`;
		this.ws = new WebSocket(url);
		this.ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
		return new Promise<void>((res, rej) => {
			this.ws.onopen = () => res();
			this.ws.onerror = () => rej(new Error('ws error'));
		});
	}

	send(m: ClientMsg) {
		this.ws.send(JSON.stringify(m));
	}

	onMessage(m: ServerMsg) {
		if (m.type === 'error') this.errors.push(m.message);
		if (m.type !== 'state') return;
		this.states++;
		this.room = m.room;
		this.game = m.game;
		this.seat = m.seat;
		const g = m.game;
		if (!g || this.seat === null) return;
		// the fairness rule: nobody else's tiles, no wall order, no seed
		if (g.phase !== 'ended' && g.phase !== 'gameover') {
			g.players.forEach((p, i) => {
				if (i !== this.seat && p.hand.some((t) => t.k !== 'x')) this.checks.push(`saw seat ${i}'s hand`);
			});
		}
		if (g.wall.some((t) => t.k !== 'x')) this.checks.push('saw the wall');
		if (g.rng !== 0 || g.opts.seed !== 0) this.checks.push('saw the seed');
		if (!this.autoplay) return;
		if (g.phase === 'ended') {
			if (this.readyFor === g.handNo) return;
			this.readyFor = g.handNo;
			return this.send({ type: 'ready' });
		}
		if (pendingSeats(g).includes(this.seat)) {
			// at most one move per game update (like the real table screen)
			const key = `${g.seq}:${g.phase}:${pendingSeats(g).join(',')}`;
			if (this.actedOn === key) return;
			this.actedOn = key;
			// decide from the redacted view, exactly like a real browser would
			this.send({ type: 'action', action: botAction(g, this.seat), seq: g.seq });
		}
	}

	waitFor(pred: () => boolean, ms = 10000) {
		return new Promise<void>((res, rej) => {
			const t0 = Date.now();
			const tick = () => {
				if (pred()) return res();
				if (Date.now() - t0 > ms) return rej(new Error('timeout'));
				setTimeout(tick, 50);
			};
			tick();
		});
	}
}

describe.skipIf(!SERVER)('online table (needs a running server)', () => {
	it('two people and two bots play a hand through the server', async () => {
		const host = new TestClient('test-host-' + Date.now(), 'Ana');
		const guest = new TestClient('test-guest-' + Date.now(), 'Ben');

		const res = await fetch(`${SERVER}/api/tables`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ settings: { variant: 'riichi', rounds: 1, botLevel: 'intermediate' }, playerId: host.pid })
		});
		const { code } = (await res.json()) as { code: string };
		expect(code).toMatch(/^[A-Z0-9]{6}$/);

		await host.connect(code);
		await guest.connect(code);
		await guest.waitFor(() => guest.room?.seats.filter(Boolean).length === 2);
		expect(host.room!.youAreHost).toBe(true);
		expect(guest.room!.youAreHost).toBe(false);

		// only the host may start
		guest.send({ type: 'start' });
		await guest.waitFor(() => guest.errors.length > 0);
		expect(guest.errors[0]).toMatch(/host/i);

		host.autoplay = guest.autoplay = true;
		host.send({ type: 'start' });
		await host.waitFor(() => host.room?.status === 'playing');
		expect(host.room!.seats.filter((s) => s?.isBot).length).toBe(2);

		// guest drops mid-game and comes back to the same seat
		await guest.waitFor(() => (guest.game?.log.length ?? 0) > 6, 20000);
		const seatBefore = guest.seat;
		guest.ws.close();
		await new Promise((r) => setTimeout(r, 300));
		await guest.connect(code);
		await guest.waitFor(() => guest.seat !== null);
		expect(guest.seat).toBe(seatBefore);

		// play until the first hand is over and the next one starts
		try {
			await host.waitFor(() => (host.game?.handNo ?? 1) >= 2 || host.game?.phase === 'gameover', 60000);
		} catch (e) {
			const g = host.game!;
			console.log(
				JSON.stringify(
					{
						phase: g.phase,
						hand: g.handNo,
						turn: g.turn,
						wall: g.wall.length,
						pending: pendingSeats(g),
						hostSeat: host.seat,
						guestSeat: guest.seat,
						claim: g.claim && { from: g.claim.from, options: g.claim.options, responses: g.claim.responses },
						deadline: host.room?.deadline ? host.room.deadline - Date.now() : null,
						seats: host.room?.seats,
						log: g.log.slice(-6).map((l) => l.text),
						hostStates: host.states,
						errors: [host.errors, guest.errors]
					},
					null,
					1
				)
			);
			throw e;
		}
		const scores = host.game!.players.map((p) => p.score);
		expect(scores.reduce((a, b) => a + b, 0) + host.game!.sticks * 1000).toBe(100000);

		expect(host.checks).toEqual([]);
		expect(guest.checks).toEqual([]);
		expect(host.errors).toEqual([]);
		host.ws.close();
		guest.ws.close();
	}, 180000);
});
