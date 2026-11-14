// Accounts + security check. Run a local server with the test login first:
//   PORT=8080 ACCOUNTS_FAKE_LOGIN=1 node server/dist/node.mjs
// then: node server/scripts/accounts-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WS = require('ws');
const U = 'http://127.0.0.1:8080';
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };

async function login(name) {
  const r = await fetch(`${U}/auth/test-login?name=${name}&next=/`, { redirect: 'manual' });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const me = async (cookie) => (await fetch(`${U}/api/me`, { headers: cookie ? { cookie } : {} })).json();
function connect(code, pid, name, cookie) {
  return new Promise((res) => {
    const ws = new WS(`${U.replace('http', 'ws')}/ws/table/${code}?pid=${pid}&name=${name}`, cookie ? { headers: { cookie } } : {});
    const out = { ws, state: null, error: null, closeCode: null };
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state') out.state = m; if (m.type === 'error') out.error = m.message; });
    ws.on('close', (c) => { out.closeCode = c; });
    setTimeout(() => res(out), 700);
  });
}

// 1. a guest creates a table and sits as host
const guestPid = 'guest-browser-' + Date.now();
const anon = await me(null);
check('accounts switched on, nobody signed in yet', anon.enabled === true && anon.user === null);
const { code } = await (await fetch(`${U}/api/tables`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { variant: 'riichi' }, playerId: guestPid }) })).json();
const g1 = await connect(code, guestPid, 'Guesty');
check('guest is seated as host', g1.state?.seat === 0 && g1.state?.room.youAreHost === true);
g1.ws.close();

// 2. same browser signs in: seat + host move to the account
const cookie = await login('Shama');
const signed = await me(cookie);
check('signed in as Shama', signed.user?.name === 'Shama', JSON.stringify(signed.user));
const a1 = await connect(code, guestPid, 'Guesty', cookie);
const mySeat = a1.state?.room.seats[0];
check('guest seat moved to the account', a1.state?.seat === 0 && mySeat?.name === 'Shama' && mySeat?.isYou === true);
check('host role moved to the account', a1.state?.room.youAreHost === true);

// 3. attack: a guest claims the account's id
const fake = await connect(code, 'account-1', 'Impostor');
const sawAccountSeat = fake.state?.seat === 0 || fake.state?.room.youAreHost === true;
check('guest cannot claim an account id', !sawAccountSeat && (fake.error !== null || fake.state?.seat !== 0), `seat=${fake.state?.seat} error=${fake.error}`);
fake.ws.close();

// 4. attack: another signed-in user names the victim's account as their "old guest id"
const cookie2 = await login('Mallory');
const m1 = await connect(code, 'account-1', 'Mallory', cookie2);
check('signed-in user cannot steal an account seat', m1.state?.seat !== 0 && m1.state?.room.youAreHost !== true, `seat=${m1.state?.seat}`);
check('the real owner still holds seat 1 as host', (await connect(code, 'x-ignored-x', 'Shama', cookie)).state?.room.youAreHost === true);
m1.ws.close();

// 5. sign out
await fetch(`${U}/api/logout`, { method: 'POST', headers: { cookie } });
check('signed out', (await me(cookie)).user === null);
a1.ws.close();
console.log(results.join('\n'));
process.exit(0);
