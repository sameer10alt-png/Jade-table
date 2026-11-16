// Admin watch / take seat / instant win. Needs a signed-in admin cookie file (curl -c format) in COOKIE_FILE.
import fs from 'node:fs';
import WebSocket from 'ws';
const U = 'http://127.0.0.1:8080';
const cookie = fs.readFileSync(process.env.COOKIE_FILE, 'utf8').split('\n').filter((l) => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))).map((l) => l.split('\t')).filter((p) => p.length >= 7).map((p) => `${p[5]}=${p[6]}`).join('; ');
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${i ? `  (${i})` : ''}`); if (!ok) fails++; };
const post = async (p, b, auth) => (await fetch(U + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { cookie } : {}) }, body: JSON.stringify(b) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function quick(pid, auth) {
	let s = await (await post('/api/quick/join', { variant: 'riichi', playerId: pid, name: 'G' }, auth)).json();
	while (s.state !== 'matched') { await sleep(400); s = await (await post('/api/quick/status', { playerId: pid }, auth)).json(); }
	return s.code;
}
// a guest's table: guest + 3 bots
const gpid = `guest-g-${Math.random().toString(36).slice(2, 10)}`;
const A = await quick(gpid, false);
const gws = new WebSocket(`${U.replace('http', 'ws')}/ws/table/${A}?pid=${gpid}&name=G`);
await sleep(2500);
let r = await post(`/api/admin/tables/${A}/win`, { seat: 1, points: 500 }, true);
check('instant win refused with a real player at the table', r.status === 400, (await r.json()).error);
// watch shows every hand
const watch = new WebSocket(`${U.replace('http', 'ws')}/ws/table/${A}?watch=1`, { headers: { cookie } });
const view = await new Promise((res) => watch.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state' && m.game) res(m); }));
check('watching sees every hand', view.game.players.every((p) => p.hand.every((t) => t.k !== 'x')));
const noAuth = new WebSocket(`${U.replace('http', 'ws')}/ws/table/${A}?watch=1`);
const refused = await new Promise((res) => noAuth.on('close', (c, why) => res(String(why))));
check('non-admins can’t watch', /Admins only/.test(refused), refused);
// take a bot's seat
const botSeat = view.room.seats.findIndex((s) => s && s.isBot);
r = await post(`/api/admin/tables/${A}/take`, { seat: botSeat }, true);
check('admin takes a bot seat', r.ok, JSON.stringify(await r.json()));
const tables = await (await fetch(`${U}/api/admin/tables`, { headers: { cookie } })).json();
const t = tables.tables.find((x) => x.code === A);
check('that seat is now a person', t.seats[botSeat].person === true, JSON.stringify(t.seats));
watch.close(); gws.close();
// admin alone with bots: instant win works
const B = await quick('ignored', true);
const aws = new WebSocket(`${U.replace('http', 'ws')}/ws/table/${B}`, { headers: { cookie } });
await sleep(2500);
r = await post(`/api/admin/tables/${B}/win`, { seat: 2, points: 777 }, true);
check('instant win works when everyone else is a bot', r.ok, JSON.stringify(await r.json()));
const w2 = new WebSocket(`${U.replace('http', 'ws')}/ws/table/${B}?watch=1`, { headers: { cookie } });
const v2 = await new Promise((res) => w2.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state' && m.game) res(m); }));
check('hand ended with the chosen winner', v2.game.phase === 'ended' && v2.game.result.wins[0].seat === 2 && v2.game.result.wins[0].total === 777, `${v2.game.phase}`);
const bots = await (await fetch(`${U}/api/admin/bots`, { headers: { cookie } })).json();
check('forced hand not counted in bot records', !bots.bots.some((b) => v2.game.players.some((p) => p.name === b.name && b.wins > 0 && b.hands === 1 && p === v2.game.players[2])), JSON.stringify(bots.bots));
aws.close(); w2.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
