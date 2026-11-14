// "Ask the table" — an LLM mahjong assistant. The API key lives only here, as a Railway env
// var (ASK_API_KEY); the browser never sees it. Works with any OpenAI-compatible chat API.
import type { IncomingMessage, ServerResponse } from 'node:http';

const KEY = process.env.ASK_API_KEY ?? '';
// Defaults to Google Gemini Flash via its OpenAI-compatible endpoint — set ASK_API_KEY to a
// Gemini key (aistudio.google.com/apikey) and nothing else. Override BASE/MODEL for any other provider.
const BASE = (process.env.ASK_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const MODEL = process.env.ASK_MODEL ?? 'gemini-flash-latest';

const SYSTEM = `You are the Jade Table mahjong assistant: a friendly, concise mahjong tutor.
Jade Table offers three variants: Taiwanese 16-tile (LRC house scoring, round minimums East 20 / South 22 / West 24 / North 26, flowers, big point hands), Japanese Riichi (yaku, dora, riichi, furiten), and Bombay Traditional (jokers, flowers, a Goulash passing round).
Help players with rules, scoring, etiquette, and strategy (efficiency, waits, defense, when to call). Prefer short, clear answers with a concrete example when useful. If asked which tile to keep or discard, explain the reasoning (shape, useful tiles, safety), not just the answer.
Stay on mahjong and this site. If asked something unrelated, say you only help with mahjong. Never claim to see the player's live hand unless they describe it.`;

/** true when an API key is configured */
export const assistantEnabled = () => !!KEY;

export async function handleAsk(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
	const json = (status: number, data: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		res.end(JSON.stringify(data));
		return true;
	};

	if (url.pathname === '/api/ask/status') return json(200, { enabled: assistantEnabled() });
	if (url.pathname !== '/api/ask' || req.method !== 'POST') return false;
	if (!KEY) return json(503, { error: 'The assistant is not set up yet.' });

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
	if (!clean.length) return json(400, { error: 'Ask a question first.' });

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
