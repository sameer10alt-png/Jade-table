import { describe, expect, test } from 'vitest';
import { dailyBonus, handJade, ITEMS, luckyState, skinVars } from './shop';

const at = (h: number, m = 0) => Date.UTC(2026, 10, 17, h, m);

describe('Jade', () => {
	test('hand rewards', () => {
		expect(handJade('loss', false, false)).toBe(5);
		expect(handJade('win', false, false)).toBe(25);
		expect(handJade('win', true, false)).toBe(30);
		expect(handJade('win', true, true)).toBe(60);
	});
	test('daily bonus grows with the streak and caps', () => {
		expect(dailyBonus(1)).toBe(50);
		expect(dailyBonus(3)).toBe(70);
		expect(dailyBonus(30)).toBe(100);
	});
	test('lucky hours', () => {
		expect(luckyState(at(0, 30)).active).toBe(true);
		expect(luckyState(at(0, 30)).endsAt).toBe(at(1));
		expect(luckyState(at(18, 5)).active).toBe(true);
		const off = luckyState(at(9));
		expect(off.active).toBe(false);
		expect(off.nextAt).toBe(at(18));
		// an admin-started one
		const a = luckyState(at(9), at(9, 45));
		expect(a.active).toBe(true);
		expect(a.endsAt).toBe(at(9, 45));
	});
	test('skins', () => {
		expect(skinVars({ back: 'back-jade', felt: 'felt-slate' })).toEqual({});
		expect(skinVars({ back: 'back-ruby' })['--t-back']).toBe('#b3262d');
		expect(skinVars({ felt: 'felt-green' })['--felt']).toBe('#1f6b4a');
		expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
	});
});
