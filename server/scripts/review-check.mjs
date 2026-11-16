// Online "Review my play": a guest plays a quick-match hand (always throwing the drawn tile);
// the server grades each discard and serves them only once the hand is over, only to that player.
const U = process.env.SERVER ?? 'http://127.0.0.1:8080';
let fails = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? `  (${info})` : ''}`); if (!ok) fails++; };
const post = async (p, b) => (await fetch(U + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
const pid = `guest-rev-${Math.random().toString(36).slice(2, 10)}`;
let s = await post('/api/quick/join', { variant: 'international', playerId: pid, name: 'Rev' });
while (s.state !== 'matched') { await new Promise((r) => setTimeout(r, 500)); s = await post('/api/quick/status', { playerId: pid }); }
const code = s.code;
const ws = new WebSocket(`${U.replace(/^http/, 'ws')}/ws/table/${code}?pid=${pid}&name=Rev`);
let midChecked = false, ended = null;
await new Promise((resolve, reject) => {
	const to = setTimeout(() => reject(new Error('hand never ended')), 240_000);
	ws.onmessage = async (ev) => {
		const m = JSON.parse(ev.data);
		if (m.type !== 'state' || !m.game) return;
		const g = m.game, me = m.seat;
		if (g.phase === 'ended' || g.phase === 'gameover') { clearTimeout(to); ended = g; resolve(); return; }
		if (g.phase === 'turn' && g.turn === me && g.drawn) {
			if (!midChecked && g.players[me].discards.length >= 2) {
				midChecked = true;
				const mid = await (await fetch(`${U}/api/tables/${code}/review?player=${pid}`)).json();
				check('nothing served while the hand is still on', mid.moves.length === 0, String(mid.moves.length));
			}
			ws.send(JSON.stringify({ type: 'action', action: { t: 'discard', tile: g.drawn.id }, seq: g.seq }));
		} else if (g.phase === 'claim') ws.send(JSON.stringify({ type: 'action', action: { t: 'pass' }, seq: g.seq }));
	};
});
const rv = await (await fetch(`${U}/api/tables/${code}/review?player=${pid}`)).json();
check('graded discards served after the hand', rv.moves.length > 0, String(rv.moves.length));
const m0 = rv.moves[0] ?? {};
check('each move has hand, grade and note', Array.isArray(m0.hand) && m0.hand.length >= 13 && !!m0.grade && !!m0.reason, JSON.stringify(m0).slice(0, 160));
const other = await (await fetch(`${U}/api/tables/${code}/review?player=guest-someone-else1`)).json();
check('another id sees none of your moves', other.moves.length === 0);
const acc = await (await fetch(`${U}/api/tables/${code}/review?player=account-1`)).json();
check('an account id cannot be borrowed by a guest', acc.moves.length === 0);
const dr = await fetch(`${U}/api/ask/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ log: 'Move 1: x' }) });
check('Dragon review needs sign-in or a key', dr.status === 401 || dr.status === 503, String(dr.status));
ws.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
