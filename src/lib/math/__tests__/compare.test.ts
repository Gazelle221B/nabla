import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { EPSILON, approximatelyZero } from '../compare.js';

describe('approximatelyZero', () => {
	it('厳密な 0 は scale によらず真', () => {
		expect(approximatelyZero(0, 1)).toBe(true);
		expect(approximatelyZero(0, 1e9)).toBe(true);
		expect(approximatelyZero(-0, 42)).toBe(true);
	});

	it('EPSILON ちょうどの値は真、EPSILON を超えると偽 (scale=1)', () => {
		// 既知の閾値で境界を検証 (同じ式へ戻すだけの自己確認ではない)
		expect(approximatelyZero(1e-9, 1)).toBe(true);
		expect(approximatelyZero(1e-8, 1)).toBe(false);
	});

	it('スケール相対: 大きな scale では許容誤差が緩む', () => {
		// 閾値 = 1e-9 * 1e6 = 1e-3。1e-4 は通り、1e-2 は通らない。
		expect(approximatelyZero(1e-4, 1e6)).toBe(true);
		expect(approximatelyZero(1e-2, 1e6)).toBe(false);
	});

	it('Math.max(1, |scale|) の下限: scale が 0 でも許容誤差は EPSILON を下回らない', () => {
		expect(approximatelyZero(5e-10, 0)).toBe(true);
	});

	it('負の scale は大きさ (絶対値) で扱う: -1e6 と 1e6 は同じ許容誤差', () => {
		// 閾値 = 1e-9 * |±1e6| = 1e-3。1e-4 は通り、1e-2 は通らない (符号によらず一致)。
		expect(approximatelyZero(1e-4, -1e6)).toBe(true);
		expect(approximatelyZero(1e-4, 1e6)).toBe(true);
		expect(approximatelyZero(1e-2, -1e6)).toBe(false);
		expect(approximatelyZero(1e-2, 1e6)).toBe(false);
	});

	it('非有限入力 → RangeError (サイレントに扱わない, MATH_CONVENTIONS §3)', () => {
		expect(() => approximatelyZero(NaN, 1)).toThrow(RangeError);
		expect(() => approximatelyZero(Infinity, 1)).toThrow(RangeError);
		expect(() => approximatelyZero(-Infinity, 1)).toThrow(RangeError);
		expect(() => approximatelyZero(0, NaN)).toThrow(RangeError);
		expect(() => approximatelyZero(0, Infinity)).toThrow(RangeError);
	});

	it('property: |value| <= EPSILON なら scale によらず真', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -EPSILON, max: EPSILON, noNaN: true }),
				fc.double({ min: -1e9, max: 1e9, noNaN: true }),
				(value, scale) => approximatelyZero(value, scale) === true,
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: scale を大きくすると判定は単調に緩む (真を偽に反転させない)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1e6, noNaN: true }),
				fc.double({ min: 0, max: 1e6, noNaN: true }),
				(value, s1, s2) => {
					const small = Math.min(s1, s2);
					const large = Math.max(s1, s2);
					// small で真なら large でも必ず真 (閾値は scale について非減少)
					if (approximatelyZero(value, small)) {
						return approximatelyZero(value, large);
					}
					return true;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
