// Friends check. Run a local server with the test login first:
//   PORT=8080 ACCOUNTS_FAKE_LOGIN=1 node server/dist/node.mjs
// then: node server/scripts/friends-check.mjs
import { createRequire } from 'node:module';
const WS = createRequire(import.meta.url)('ws');
const U = process.env.SERVER || 'http://127.0.0.1:8080';
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
const run = Date.now().toString(36);
async function login(name) {
  const r = await fetch(`${U}/auth/test-login?name=${name}${run}`, { redirect: 'manual' });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const api = async (cookie, path, body) => {
  const r = await fetch(U + path, body ? { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: cookie ? { cookie } : {} });
  return { status: r.status, data: await r.json() };
};
async function sitAt(cookie, code) {
  const ws = new WS(`${U.replace('http', 'ws')}/ws/table/${code}?pid=guest-${Math.random().toString(36).slice(2, 12)}&name=x`, { headers: { cookie } });
  const st = await new Promise((r) => ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state') r(m); }));
  return { ws, st };
}
const newTable = async (cookie) => (await api(cookie, '/api/tables', { settings: { variant: 'taiwanese' }, playerId: 'guest-unused-1234' })).data.code;

const shama = await login('Shama'), sameer = await login('Sameer'), stranger = await login('Strngr');
const S = (await api(shama, '/api/friends')).data, M = (await api(sameer, '/api/friends')).data, X = (await api(stranger, '/api/friends')).data;
check('everyone gets a friend code', /^[A-Z0-9]{6}$/.test(S.myCode) && S.myCode !== M.myCode, `${S.myCode} / ${M.myCode}`);
check('guests cannot use friends', (await api(null, '/api/friends')).status === 401);
check('cannot add yourself', (await api(shama, '/api/friends/request', { code: S.myCode })).status === 400);
check('unknown code is refused', (await api(shama, '/api/friends/request', { code: 'ZZZZZZ' })).status === 404);

check('Sameer sends Shama a request', (await api(sameer, '/api/friends/request', { code: S.myCode })).data.status === 'requested');
const s1 = (await api(shama, '/api/friends')).data;
check('Shama sees the incoming request', s1.incoming.some((f) => f.code === M.myCode) && s1.friends.length === 0);
check('Shama has a badge for it', (await api(shama, '/api/notify')).data.unread === 1);
check('Sameer cannot accept his own request', (await api(sameer, '/api/friends/respond', { code: S.myCode, accept: true })).status === 400);
await api(shama, '/api/friends/respond', { code: M.myCode, accept: true });
check('accepted: friends on both sides', (await api(shama, '/api/friends')).data.friends.some((f) => f.code === M.myCode) && (await api(sameer, '/api/friends')).data.friends.some((f) => f.code === S.myCode));
check('friend list shows no email addresses', !JSON.stringify(await api(shama, '/api/friends')).includes('@'));

const table = await newTable(shama);
const host = await sitAt(shama, table);
check('Shama invites Sameer to her table', (await api(shama, '/api/friends/invite', { code: M.myCode, table })).status === 200);
const inv = (await api(sameer, '/api/friends')).data.invites;
check('Sameer sees the invite', inv.length === 1 && inv[0].code === table && inv[0].variantName === 'Taiwanese Mahjong', JSON.stringify(inv[0] && { from: inv[0].from.name }));
check("invite counts in Sameer's badge", (await api(sameer, '/api/notify')).data.invites === 1);
check('Shama shows as "at a table"', (await api(sameer, '/api/friends')).data.friends.find((f) => f.code === S.myCode)?.atTable === true);

const strangerTable = await newTable(stranger);
const sx = await sitAt(stranger, strangerTable);
check('a stranger cannot invite Shama', (await api(stranger, '/api/friends/invite', { code: S.myCode, table: strangerTable })).status === 403);
check("cannot invite to a table you're not at", (await api(shama, '/api/friends/invite', { code: M.myCode, table: strangerTable })).status === 403);

const guest = await sitAt(sameer, table);
check('Sameer joins via the invite', guest.st.seat === 1);
check('invite disappears once he is seated', (await api(sameer, '/api/friends')).data.invites.length === 0);
host.ws.send(JSON.stringify({ type: 'start' }));
await new Promise((r) => setTimeout(r, 500));
check('cannot invite to a table that has started', (await api(shama, '/api/friends/invite', { code: M.myCode, table })).status === 400);

await api(shama, '/api/friends/remove', { code: M.myCode });
const after = (await api(shama, '/api/friends')).data;
check('unfriend works', after.friends.length === 0);
check('he now shows as "played with you recently"', after.suggestions.some((f) => f.code === M.myCode));

// adding someone you're playing with, by seat number (codes and account ids never go out)
const rel = (c, t) => api(c, `/api/friends/table/${t}`);
const r0 = (await rel(shama, table)).data.seats;
check('at the table: Sameer can be added, me and bots show nothing', r0[0] === null && r0[1] === 'none' && r0[2] === null, JSON.stringify(r0));
check('table relations leak no codes', !JSON.stringify(r0).includes(M.myCode));
check("a stranger can't look at Shama's table", (await rel(stranger, table)).status === 403);
check("a stranger can't add from Shama's table", (await api(stranger, '/api/friends/add-seat', { table, seat: 1 })).status === 403);
check('bots cannot be added', (await api(shama, '/api/friends/add-seat', { table, seat: 2 })).status === 400);
check('Shama taps add on Sameer: a request', (await api(shama, '/api/friends/add-seat', { table, seat: 1 })).data.status === 'requested');
check('Sameer sees "wants to be your friend"', (await rel(sameer, table)).data.seats[0] === 'incoming');
check('Sameer taps it back: friends', (await api(sameer, '/api/friends/add-seat', { table, seat: 0 })).data.status === 'friends');
check('Shama now sees "friend" on his seat', (await rel(shama, table)).data.seats[1] === 'friend');
const g2 = new WS(`${U.replace('http', 'ws')}/ws/table/${strangerTable}?pid=guest-${Math.random().toString(36).slice(2, 12)}&name=Guesty`);
await new Promise((r) => g2.on('message', r));
check('guests cannot be added', (await api(stranger, '/api/friends/add-seat', { table: strangerTable, seat: 1 })).status === 400);
g2.close();
await api(shama, '/api/friends/remove', { code: M.myCode });

// "add me" links: the visitor accepts (works for brand-new users); a new link retires the old one
const link = (await api(shama, '/api/friends')).data.myLink;
check('link token is separate from the friend code', /^[\w-]{12}$/.test(link) && link !== S.myCode);
check('a visitor sees who sent the link (no sign-in needed)', (await api(null, `/api/friends/who/${link}`)).data.name?.startsWith('Shama'));
const newbie = await login('Newbie');
check('new user accepts the link: friends', (await api(newbie, '/api/friends/link', { token: link })).data.status === 'friends');
check('Shama (who sent it) needs no second approval', (await api(shama, '/api/friends')).data.friends.some((f) => f.name.startsWith('Newbie')));
check('the friend code alone cannot make instant friends', (await api(stranger, '/api/friends/link', { token: S.myCode })).status === 404);
const fresh = (await api(shama, '/api/friends/new-link', {})).data.myLink;
check('"make a new link" retires the old one', fresh !== link && (await api(null, `/api/friends/who/${link}`)).status === 404 && (await api(stranger, '/api/friends/link', { token: link })).status === 404);

// the bell: saved notifications for requests, accepts, invites and someone sitting down
const na = await login('NoteA'), nb = await login('NoteB');
const NB = (await api(nb, '/api/friends')).data;
await api(na, '/api/friends/request', { code: NB.myCode });
const n1 = (await api(nb, '/api/notify')).data;
check('bell: request arrives as an unread note', n1.unread === 1 && n1.latest[0]?.kind === 'friend_request' && n1.latest[0].active === true);
check('bell: notes carry no account ids or emails', !JSON.stringify(n1).includes('fromId') && !JSON.stringify(n1).includes('@'));
const NA = (await api(na, '/api/friends')).data;
await api(nb, '/api/friends/respond', { code: NA.myCode, accept: true });
check('bell: the sender hears it was accepted', (await api(na, '/api/notify')).data.latest.some((n) => n.kind === 'friend_accepted'));
check('bell: an answered request is no longer actionable', (await api(nb, '/api/notifications')).data.notes.find((n) => n.kind === 'friend_request')?.active === false);
await api(nb, '/api/notifications/read', {});
check('bell: opening it clears the count', (await api(nb, '/api/notify')).data.unread === 0);
const nt = await newTable(na);
const nh = await sitAt(na, nt);
await api(na, '/api/friends/invite', { code: NB.myCode, table: nt });
check('bell: invite note with a Join', (await api(nb, '/api/notify')).data.latest.some((n) => n.kind === 'invite' && n.table === nt && n.active));
const ng = await sitAt(nb, nt);
check('bell: host hears someone sat down', (await api(na, '/api/notify')).data.latest.some((n) => n.kind === 'joined' && n.table === nt && n.name.startsWith('NoteB')));
check('bell: invite no longer joinable once seated', (await api(nb, '/api/notifications')).data.notes.find((n) => n.kind === 'invite')?.active === false);
ng.ws.close();
await new Promise((r) => setTimeout(r, 200));
const ng2 = await sitAt(nb, nt);
check('bell: coming back to your seat is not "sat down" again', (await api(na, '/api/notifications')).data.notes.filter((n) => n.kind === 'joined').length === 1);
check('bell: guests get nothing', (await api(null, '/api/notifications')).status === 401);
nh.ws.close(); ng2.ws.close();

host.ws.close(); guest.ws.close(); sx.ws.close();
console.log(out.join('\n'));
setTimeout(() => process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0), 100);
