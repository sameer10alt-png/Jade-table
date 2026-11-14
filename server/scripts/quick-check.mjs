// Quick match check. Run a local server with the test login first:
//   PORT=8080 ACCOUNTS_FAKE_LOGIN=1 node server/dist/node.mjs
// then: node server/scripts/quick-check.mjs
import { createRequire } from 'node:module';
const WS = createRequire(import.meta.url)('ws');
const U = process.env.SERVER || 'http://127.0.0.1:8080';
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
const run = Date.now().toString(36);
const gid = (n) => `guest-${run}-${n}`.slice(0, 40);
const post = async (path, body, cookie) => {
  const r = await fetch(U + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  return r.json();
};
const sit = (code, pid, cookie) =>
  new Promise((res) => {
    const ws = new WS(`${U.replace('http', 'ws')}/ws/table/${code}?pid=${pid}&name=x`, cookie ? { headers: { cookie } } : {});
    const c = { ws, last: null };
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type === 'state') {
        c.last = m;
        res(c);
      }
    });
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// four guests for Riichi → one table, all four seated
const four = [1, 2, 3, 4].map(gid);
for (const [i, p] of four.entries()) await post('/api/quick/join', { variant: 'riichi', playerId: p, name: `Q${i + 1}` });
const st = await Promise.all(four.map((p) => post('/api/quick/status', { playerId: p })));
const code = st[0].code;
check('4 waiting for the same game get one table', st.every((s) => s.state === 'matched' && s.code === code), JSON.stringify(st.map((s) => s.state)));

// it starts by itself once everyone has arrived
const conns = [];
for (const p of four) conns.push(await sit(code, p));
await wait(400);
const last = conns[3].last;
check('the table says it is a quick match', last.room.quick === true);
const info = await (await fetch(`${U}/api/tables/${code}`)).json();
check('starts by itself when all four arrive (no host needed)', info.status === 'playing', info.status);
check('no bots at a full table', last.room.seats.every((s) => s && !s.isBot) || info.players === 4);
conns.forEach((c) => c.ws.close());

// games don't mix: a Taiwanese player is not put with Bombay players
const a = gid('ta'), b = gid('bo');
await post('/api/quick/join', { variant: 'taiwanese', playerId: a, name: 'Tai' });
const sb = await post('/api/quick/join', { variant: 'bombay', playerId: b, name: 'Bom' });
check('each game has its own line', sb.state === 'waiting' && sb.waiting === 1, JSON.stringify(sb));
check('waiting shows when the table starts', sb.startsInMs > 20_000 && sb.startsInMs <= 24_000, String(sb.startsInMs));
const counts = (await (await fetch(`${U}/api/quick/counts`)).json()).waiting;
check('counts per game for the Online page', counts.taiwanese >= 1 && counts.bombay >= 1, JSON.stringify(counts));

// "start now": seated at once, bots fill the rest
const now = await post('/api/quick/now', { playerId: b });
check('"start now" seats you straight away', now.state === 'matched', JSON.stringify(now));
const solo = await sit(now.code, b);
await wait(400);
const soloInfo = await (await fetch(`${U}/api/tables/${now.code}`)).json();
check('...and bots fill the empty seats', soloInfo.status === 'playing' && solo.last.room.seats.filter((s) => s?.isBot).length === 3);
solo.ws.close();

// leaving the line
await post('/api/quick/leave', { playerId: a });
check('leaving takes you out of the line', (await post('/api/quick/status', { playerId: a })).state === 'none');

// guests and accounts share one pool
const login = await fetch(`${U}/auth/test-login?name=Quick${run}`, { redirect: 'manual' });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const mixed = [gid('m1'), gid('m2'), gid('m3')];
await post('/api/quick/join', { variant: 'taiwanese', playerId: 'guest-ignored-123' }, cookie);
for (const p of mixed) await post('/api/quick/join', { variant: 'taiwanese', playerId: p, name: 'G' });
const acc = await post('/api/quick/status', { playerId: 'guest-ignored-123' }, cookie);
const g1 = await post('/api/quick/status', { playerId: mixed[0] });
check('an account and three guests are matched together', acc.state === 'matched' && acc.code === g1.code);

// safety
check('a guest cannot queue as an account', (await post('/api/quick/join', { variant: 'riichi', playerId: 'account-1' })).error === 'Bad request');
check('unknown game refused', !!(await post('/api/quick/join', { variant: 'poker', playerId: gid('x') })).error);

console.log(out.join('\n'));
setTimeout(() => process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0), 100);
