// Points, progress and coach rules against a local server (ACCOUNTS_FAKE_LOGIN=1, ASK_API_KEY=x).
const U = process.env.URL ?? 'http://localhost:8080';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
async function login(name) {
  const r = await fetch(`${U}/auth/test-login?name=${name}&next=/`, { redirect: 'manual' });
  return r.headers.get('set-cookie').split(';')[0];
}
const post = (path, cookie, body) => fetch(`${U}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const get = async (path, cookie) => (await fetch(`${U}${path}`, { headers: cookie ? { cookie } : {} })).json();

const anon = await get('/api/progress');
ok(anon.enabled && !anon.signedIn, 'guest sees progress as signed out');
const c = await login('Points' + Date.now());
let p = await get('/api/progress', c);
ok(p.signedIn && p.rating === 1000 && p.rank === 'Circle', `new player (intermediate) starts at 1000 Circle (${p.rating} ${p.rank})`);
let r = await (await post('/api/progress/hand', c, { outcome: 'win', key: 'k1', opponents: ['expert', 'expert', 'expert'] })).json();
ok(r.delta > 0 && r.after === 1000 + r.delta, `win vs experts gains points (+${r.delta})`);
let r2 = await post('/api/progress/hand', c, { outcome: 'win', key: 'k2', opponents: ['expert', 'expert', 'expert'] });
ok(r2.status === 429, 'offline hands are rate-limited');
p = await get('/api/progress', c);
ok(p.wins === 1 && p.history.length === 1, 'win recorded in history');
ok((await post('/api/progress/hand', c, { outcome: 'cheat', key: 'z', opponents: [] })).status === 400, 'bad report refused');
ok((await post('/api/progress/diagnostic', c, { report: { overall: 70, level: 'Intermediate', variantName: 'Riichi', skills: [] } })).ok, 'diagnostic saved');
p = await get('/api/progress', c);
ok(p.diagnostics.length === 1 && p.diagnostics[0].report.overall === 70, 'diagnostic listed');
// coach rules
ok((await post('/api/ask', null, { messages: [{ role: 'user', content: 'How does riichi work?' }] })).status === 401, 'coach needs sign-in');
const s = await (await post('/api/ask', c, { messages: [{ role: 'user', content: 'asdfghjkl qwrtpsdfg' }] })).json();
ok(s.spam === true && /spam/.test(s.reply), 'spam gets the canned reply');
const cd = await post('/api/ask', c, { messages: [{ role: 'user', content: 'How does riichi work?' }] });
ok(cd.status !== 429, 'no cooldown: a real question goes straight through');
process.exit(fails ? 1 : 0);
