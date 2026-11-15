// Email sign-in with codes, against a local server (ACCOUNTS_FAKE_LOGIN=1 returns the code as devCode).
const U = process.env.URL ?? 'http://localhost:8080';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
async function reg(body, cookie) {
	const r = await fetch(`${U}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
	return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const me = async (cookie) => (await (await fetch(`${U}/api/me`, { headers: { cookie } })).json()).user;
const id = Date.now();
const email = `p${id}@outlook.com`;
const name = `P${String(id).slice(-6)}`;

ok((await reg({ contact: '+66 81 234 5678', username: name })).status === 400, 'phone numbers are refused');
ok((await reg({ contact: 'not-an-email', username: name })).status === 400, 'bad email refused');

const s1 = await reg({ contact: email, username: name, skill: 'beginner' });
ok(s1.status === 200 && s1.data.needCode && /^\d{6}$/.test(s1.data.devCode), 'step 1 sends a 6-digit code');
ok(!s1.cookie, 'no session before the code');

ok((await reg({ contact: email, username: name })).status === 429, 'asking again right away is refused');

const wrong = String((Number(s1.data.devCode) + 1) % 1e6).padStart(6, '0');
const bad = await reg({ contact: email, username: name, code: wrong });
ok(bad.status === 400 && !bad.cookie, 'wrong code refused');

const good = await reg({ contact: email, username: name, skill: 'beginner', code: s1.data.devCode });
ok(good.status === 200 && good.cookie, 'right code signs in');
ok((await me(good.cookie))?.name === name, '/api/me shows the new player');

const reuse = await reg({ contact: email, username: name, code: s1.data.devCode });
ok(reuse.status === 400, 'a code works only once');

ok((await reg({ contact: email, username: 'Someone' })).status === 409, 'returning email with a different username is refused');

const other = `q${id}@outlook.com`;
ok((await reg({ contact: other, username: name })).status === 409, 'username already taken by someone else');

// five wrong tries lock the code
const s2 = await reg({ contact: other, username: `Q${String(id).slice(-6)}` });
for (let i = 0; i < 5; i++) await reg({ contact: other, username: `Q${String(id).slice(-6)}`, code: '000000' === s2.data.devCode ? '111111' : '000000' });
const locked = await reg({ contact: other, username: `Q${String(id).slice(-6)}`, code: s2.data.devCode });
ok(locked.status === 400 && /Too many/.test(locked.data.error), 'locked after 5 wrong tries, even with the right code');

process.exit(fails ? 1 : 0);
