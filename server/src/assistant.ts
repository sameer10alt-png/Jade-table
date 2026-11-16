// "Ask the table" — an LLM mahjong assistant. The API key lives only here, as a Railway env
// var (ASK_API_KEY); the browser never sees it. Works with any OpenAI-compatible chat API.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountsEnabled, currentUser } from './accounts';
import { siteSettings } from './admin';

/** questions per account per day (protects the monthly bill) */
const DAILY_LIMIT = 80;
const daily = new Map<number, { day: string; n: number }>();

export const SPAM_REPLY =
	"That message looks like spam, so I didn't pass it to the Dragon. Ask a real mahjong question, for example: “When should I fold?” or “How is a Taiwanese hand scored?”";

export const CHAT_REPLY =
	"I only answer mahjong questions. Try something like: “Which tile should I discard?” or “How do I score a Pung of dragons?”";

/** mahjong words: a short message with one of these is a real question, not chatter */
const MAHJONG_WORD =
	/(mahjong|mah|jong|tile|tiles|pung|pong|kong|chow|chi|pon|kan|riichi|ron|tsumo|yaku|dora|han|fu|fan|fold|discard|wait|tenpai|ready|win|hand|score|scoring|point|dragon|wind|flower|season|bamboo|bam|dot|dots|circle|character|crack|joker|honou?r|terminal|pair|eye|meld|dealer|east|south|west|north|mcr|taiwan|taiwanese|bombay|international|furiten|mangan|limit|rule|rules|how|what|why|when|which|can|should|is|does|do)/i;
/** pure filler that never needs the AI */
const FILLER = /^(ha|he|hi|lol|lmao|rofl|boo+|ok(ay)?|k|yes|yeah|ye|yep|no|nope|nah|hmm+|wow|cool|nice|thanks?|thank you|ty|bye|hello|hey|sup|yo|test|testing|bruh|idk|what)[\s!.?]*$/i;

/** Cheap checks so junk never reaches (or costs) the AI. Returns a reason, or null if fine. */
export function spamReason(text: string, previous: string[]): string | null {
	const t = text.trim();
	const letters = t.replace(/[^\p{L}\p{M}]/gu, '');
	if (letters.length < 2) return 'empty';
	if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|xyz|io|ly|gg)\b)/i.test(t)) return 'link';
	if (/(.)\1{5,}/u.test(t)) return 'repeated characters';
	if (/\b(\w{2,})(\s+\1\b){3,}/iu.test(t)) return 'repeated words';
	if (/[bcdfghjklmnpqrstvwxz]{7,}/i.test(t)) return 'keyboard mash';
	if (t.split(/\s+/).some((w) => w.length > 40)) return 'long word';
	if (letters.length / t.replace(/\s/g, '').length < 0.45) return 'symbols';
	const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
	if (previous.filter((p) => norm(p) === norm(t)).length >= 1) return 'duplicate';
	if (FILLER.test(t) || /^(ha|he|hi)+[\s!.?]*$/i.test(t)) return 'chatter';
	if (t.split(/\s+/).length <= 3 && !t.includes('?') && !MAHJONG_WORD.test(t)) return 'chatter';
	return null;
}

const KEY = process.env.ASK_API_KEY ?? '';
// Defaults to Google Gemini Flash via its OpenAI-compatible endpoint — set ASK_API_KEY to a
// Gemini key (aistudio.google.com/apikey) and nothing else. Override BASE/MODEL for any other provider.
const BASE = (process.env.ASK_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const MODEL = process.env.ASK_MODEL ?? 'gemini-flash-latest'; // auto-follows Google's newest Flash

const SYSTEM = `You are the Dragon, Pung Table's mahjong coach: a friendly, concise mahjong tutor. If asked who you are, say you are the Dragon.
Pung Table offers four variants: International Mahjong (classic Western rules: 20 for Mahjong, points for pungs/kongs (2/4 exposed simple/terminal-honour, double when concealed, kong = 4x pung), flowers and seasons 4 each, value pairs 2, then doubles (dragon or own/prevalent wind pung, own flower/season, concealed hand, no chows, half flush 1, full flush 3, all four flowers/seasons 3), rounded up to 2, limit 1,000 for hands like thirteen orphans, nine gates, big three dragons, four winds, all honours; everyone pays the winner, East pays and collects double, East keeps the deal on a win or wall game, no minimum), Taiwanese 16-tile (LRC house scoring, round minimums East 20 / South 22 / West 24 / North 26, flowers, big point hands), Japanese Riichi (yaku, dora, riichi, furiten), and Bombay Traditional (jokers, flowers, a Goulash passing round).
Help players with rules, scoring, etiquette, and strategy (efficiency, waits, defense, when to call). Prefer short, clear answers with a concrete example when useful. If asked which tile to keep or discard, explain the reasoning (shape, useful tiles, safety), not just the answer.
Stay on mahjong and this site. If asked something unrelated, say you only help with mahjong. Never claim to see the player's live hand unless they describe it.`;

const REVIEW_SYSTEM = `You are the Dragon, Pung Table's mahjong coach. You are reviewing one finished game played by the user.
You get a log of each of their discards: the hand they held, what they threw, an engine grade (amazing, great, best, good, inaccuracy, mistake, blunder), the engine's preferred tile when different, and a short engine note, plus each hand's result.
Trust the engine grades and notes for what was right or wrong; your job is to explain them in plain words and find the patterns.
Reply with JSON only, in this shape:
{"summary": "2 sentences on how the game went overall",
 "good": ["up to 3 specific things they did well, naming the hand, move and tiles"],
 "bad": ["up to 3 specific mistakes, naming the hand, move and tiles, and what to do instead and why"],
 "focus": "one concrete thing to work on next game"}
Be direct and encouraging, no filler. Name tiles the way the log does. If the log has very few moves, say so briefly and keep the lists short.`;

/** questions and reviews asked today, across everyone (for the admin overview) */
export function dragonUsedToday() {
	const today = new Date().toISOString().slice(0, 10);
	let n = 0;
	for (const d of daily.values()) if (d.day === today) n += d.n;
	return n;
}

/** true when an API key is configured */
export const assistantEnabled = () => !!KEY;

export async function handleAsk(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	const json = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};

	if (url.pathname === '/api/ask/status')
		return json(200, { enabled: assistantEnabled() && siteSettings().dragon, needsAccount: true });
	if (!siteSettings().dragon && req.method === 'POST') return json(503, { error: 'The Dragon is resting right now. Try again later.' });
	if (url.pathname === '/api/ask/review' && req.method === 'POST') return review(req, json);
	if (url.pathname !== '/api/ask' || req.method !== 'POST') return false;
	if (!KEY) return json(503, { error: 'The assistant is not set up yet.' });
	// signed-in players only
	const user = accountsEnabled() ? await currentUser(req) : null;
	if (!user) return json(401, { error: 'Sign up or sign in to talk to the Dragon.', needSignIn: true });
	const today = new Date().toISOString().slice(0, 10);
	const d = daily.get(user.id);
	const used = d?.day === today ? d.n : 0;
	if (used >= DAILY_LIMIT) return json(429, { error: 'You have reached today’s question limit. Come back tomorrow.' });

	let body = '';
	for await (const c of req) {
		body += c;
		if (body.length > 20000) return json(413, { error: 'That is too long.' });
	}
	let data: { messages?: { role?: string; content?: string }[] };
	try {
		data = JSON.parse(body || '{}');
	} catch {
		return json(400, { error: 'Bad request.' });
	}
	const clean = (Array.isArray(data.messages) ? data.messages : [])
		.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
		.slice(-12)
		.map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 2000) }));
	if (!clean.length || clean[clean.length - 1].role !== 'user') return json(400, { error: 'Ask a question first.' });
	// every message is checked: spam gets a fixed reply and never reaches the AI
	const q = clean[clean.length - 1].content;
	const earlier = clean.slice(0, -1).filter((m) => m.role === 'user').slice(-3).map((m) => m.content);
	const spam = spamReason(q, earlier);
	if (spam) return json(200, { reply: spam === 'chatter' ? CHAT_REPLY : SPAM_REPLY, spam: true });
	daily.set(user.id, { day: today, n: used + 1 });

	try {
		const r = await fetch(`${BASE}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
			body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, ...clean], max_tokens: 2000 })
		});
		if (!r.ok) {
			console.error('ask upstream', r.status, (await r.text()).slice(0, 200));
			return json(502, { error: 'The assistant is unavailable right now.' });
		}
		const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
		return json(200, { reply: j?.choices?.[0]?.message?.content ?? '' });
	} catch (e) {
		console.error('ask failed', (e as Error).message);
		return json(502, { error: 'The assistant is unavailable right now.' });
	}
}

/** "Review with the Dragon": read the game log and say what was good and what to fix */
async function review(req: IncomingMessage, json: (status: number, data: unknown) => boolean): Promise<boolean> {
	if (!KEY) return json(503, { error: 'The Dragon is not set up yet.' });
	const user = accountsEnabled() ? await currentUser(req) : null;
	if (!user) return json(401, { error: 'Sign in to get a review from the Dragon.', needSignIn: true });
	const today = new Date().toISOString().slice(0, 10);
	const d = daily.get(user.id);
	const used = d?.day === today ? d.n : 0;
	if (used >= DAILY_LIMIT) return json(429, { error: 'You have reached today’s Dragon limit. Come back tomorrow.' });

	let body = '';
	for await (const c of req) {
		body += c;
		if (body.length > 20000) return json(413, { error: 'That game log is too long.' });
	}
	let data: { log?: string };
	try {
		data = JSON.parse(body || '{}');
	} catch {
		return json(400, { error: 'Bad request.' });
	}
	const log = typeof data.log === 'string' ? data.log.slice(0, 16000) : '';
	if (!/Move \d+:/.test(log)) return json(400, { error: 'Play a few moves first, then ask for a review.' });
	daily.set(user.id, { day: today, n: used + 1 });

	try {
		const r = await fetch(`${BASE}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{ role: 'system', content: REVIEW_SYSTEM },
					{ role: 'user', content: log }
				],
				response_format: { type: 'json_object' },
				max_tokens: 2500
			})
		});
		if (!r.ok) {
			console.error('review upstream', r.status, (await r.text()).slice(0, 200));
			return json(502, { error: 'The Dragon is unavailable right now.' });
		}
		const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
		const raw = j?.choices?.[0]?.message?.content ?? '';
		const parsed = parseReview(raw);
		if (!parsed) return json(502, { error: 'The Dragon got muddled. Try again.' });
		return json(200, parsed);
	} catch (e) {
		console.error('review failed', (e as Error).message);
		return json(502, { error: 'The Dragon is unavailable right now.' });
	}
}

export function parseReview(raw: string) {
	const m = raw.match(/\{[\s\S]*\}/);
	if (!m) return null;
	try {
		const o = JSON.parse(m[0]) as { summary?: unknown; good?: unknown; bad?: unknown; focus?: unknown };
		const list = (x: unknown) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.trim()).slice(0, 4).map((s) => String(s).slice(0, 600)) : []);
		const summary = typeof o.summary === 'string' ? o.summary.slice(0, 800) : '';
		if (!summary) return null;
		return { summary, good: list(o.good), bad: list(o.bad), focus: typeof o.focus === 'string' ? o.focus.slice(0, 400) : '' };
	} catch {
		return null;
	}
}
