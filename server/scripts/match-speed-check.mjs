// Quick match speed: alone with nobody online, two real players, restart restore, profiles.
// Run against a fresh local server: ACCOUNTS_FAKE_LOGIN=1 PGLITE_DIR=/tmp/x PORT=8080 node dist/node.mjs
const U = process.env.SERVER ?? 'http://127.0.0.1:8080';
let fails = 0;
const check = (name, ok, info = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
	if (!ok) fails++;
};
const post = async (path, body) => (await fetch(U + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const gid = (p) => `guest-${p}-${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. alone, nobody else online: bots join within ~3s and the table starts by ~4s
const solo = gid('solo');
let s = await post('/api/quick/join', { variant: 'riichi', playerId: solo, name: 'Solo' });
check('alone: table starts within 4 s', s.startsInMs <= 3_600, String(s.startsInMs));
await sleep(2_000);
s = await post('/api/quick/status', { playerId: solo });
check('alone: players are joining after 2 s', s.state === 'waiting' && s.joined.length >= 2, JSON.stringify(s.joined));
check('filled seats have a picture or initials field', s.joined.every((j) => 'picture' in j && j.name));
const names2s = s.joined.map((j) => j.name);
await sleep(2_000);
s = await post('/api/quick/status', { playerId: solo });
check('alone: matched by 4 s', s.state === 'matched', JSON.stringify(s));
const soloCode = s.code;

// 2. the joined names stay put (nobody "leaves")
// (checked via a restore below, plus same seed → same names)

// 3. two real players: start ~3 s after the second arrives, and they see each other
const a = gid('a'), b = gid('b');
await post('/api/quick/join', { variant: 'international', playerId: a, name: 'Ann' });
await sleep(500);
const sb = await post('/api/quick/join', { variant: 'international', playerId: b, name: 'Bob' });
check('two players: B sees A at the table', sb.joined.some((j) => j.name === 'Ann'), JSON.stringify(sb.joined));
check('two players: starts within ~3 s', sb.startsInMs <= 3_600, String(sb.startsInMs));
await sleep(3_800);
const ma = await post('/api/quick/status', { playerId: a });
const mb = await post('/api/quick/status', { playerId: b });
check('two players: same table', ma.state === 'matched' && ma.code === mb.code, `${ma.code} ${mb.code}`);

// 4. restore after a server restart: rejoin with the original start time keeps timer and names
const r = gid('r');
const first = await post('/api/quick/join', { variant: 'taiwanese', playerId: r, name: 'Rae' });
await post('/api/quick/leave', { playerId: r }); // simulates the server forgetting us
const again = await post('/api/quick/join', { variant: 'taiwanese', playerId: r, name: 'Rae', since: first.since });
check('restore: same start time', again.since === first.since, `${first.since} ${again.since}`);
await post('/api/quick/leave', { playerId: r });

// 5. profiles for a quick table: bots have pictures/records, matching the waiting names
await sleep(16_000); // the table starts by itself after the arrival grace
const pr = await (await fetch(`${U}/api/tables/${soloCode}/profiles`)).json();
const bots = pr.profiles.filter((p) => p && p.hands > 0);
check('profiles: 3 filled seats with a record', bots.length === 3, JSON.stringify(pr.profiles));
check('profiles: names match those shown while waiting', names2s.every((n) => bots.some((p) => p.name === n)), names2s.join(','));
check('profiles: win rate is believable', bots.every((p) => p.wins / p.hands > 0.1 && p.wins / p.hands < 0.4));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
