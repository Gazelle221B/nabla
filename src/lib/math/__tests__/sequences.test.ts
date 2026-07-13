import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { arithmeticTerm, geometricTerm, arithmeticSum } from '../sequences.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (riemannSum.test.ts / lawOfSinesCosines.test.ts と同じ方針: 一部の引数だけでなく
// 全引数を網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('arithmeticTerm', () => {
	it('既知例: 初項1・公差1の第100項 = 100 (自然数列)', () => {
		expect(arithmeticTerm(1, 1, 100)).toBe(100);
	});

	it('初項3・公差2の第1項は初項そのもの', () => {
		expect(arithmeticTerm(3, 2, 1)).toBe(3);
	});

	it('公差 d=0 は定数列(退化例、例外なし)', () => {
		expect(arithmeticTerm(5, 0, 1)).toBe(5);
		expect(arithmeticTerm(5, 0, 50)).toBe(5);
	});

	it('初項 a1=0 でも例外なく値を返す', () => {
		expect(arithmeticTerm(0, 3, 4)).toBe(9);
	});

	it('公差が負(減少列)でも例外なく値を返す', () => {
		expect(arithmeticTerm(10, -3, 4)).toBe(1);
	});

	it('n=0 → RangeError (0番目は無意味)', () => {
		expect(() => arithmeticTerm(1, 1, 0)).toThrow(RangeError);
	});

	it('n が負 → RangeError', () => {
		expect(() => arithmeticTerm(1, 1, -3)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => arithmeticTerm(1, 1, 2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a1 → RangeError`, () => {
			expect(() => arithmeticTerm(value, 1, 3)).toThrow(RangeError);
		});
		it(`${label} な d → RangeError`, () => {
			expect(() => arithmeticTerm(1, value, 3)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => arithmeticTerm(1, 1, value)).toThrow(RangeError);
		});
	}
});

describe('geometricTerm', () => {
	it('既知例: 初項1・公比2の第10項 = 512', () => {
		expect(geometricTerm(1, 2, 10)).toBe(512);
	});

	it('第1項は公比によらず初項そのもの', () => {
		expect(geometricTerm(7, 3, 1)).toBe(7);
	});

	it('公比 r=1 は定数列(退化例、例外なし)', () => {
		expect(geometricTerm(5, 1, 1)).toBe(5);
		expect(geometricTerm(5, 1, 50)).toBe(5);
	});

	it('公比 r=0 は第1項が初項・第2項以降が0になる退化例(例外なし)', () => {
		expect(geometricTerm(3, 0, 1)).toBe(3);
		expect(geometricTerm(3, 0, 2)).toBe(0);
		expect(geometricTerm(3, 0, 5)).toBe(0);
	});

	it('初項 a1=0 は公比によらず全項0になる退化例(例外なし)', () => {
		expect(geometricTerm(0, 5, 1)).toBe(0);
		expect(geometricTerm(0, 5, 3)).toBe(0);
	});

	it('公比が負(符号が交互に反転する)でも例外なく値を返す', () => {
		expect(geometricTerm(2, -1, 1)).toBe(2);
		expect(geometricTerm(2, -1, 2)).toBe(-2);
		expect(geometricTerm(2, -1, 3)).toBe(2);
	});

	it('n=0 → RangeError', () => {
		expect(() => geometricTerm(1, 2, 0)).toThrow(RangeError);
	});

	it('n が負 → RangeError', () => {
		expect(() => geometricTerm(1, 2, -3)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => geometricTerm(1, 2, 2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a1 → RangeError`, () => {
			expect(() => geometricTerm(value, 2, 3)).toThrow(RangeError);
		});
		it(`${label} な r → RangeError`, () => {
			expect(() => geometricTerm(1, value, 3)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => geometricTerm(1, 2, value)).toThrow(RangeError);
		});
	}
});

describe('arithmeticSum', () => {
	it('既知例: 1+2+…+100 = 5050 (ガウスの逸話そのもの)', () => {
		expect(arithmeticSum(1, 1, 100)).toBe(5050);
	});

	it('n=1 は初項そのもの', () => {
		expect(arithmeticSum(4, 7, 1)).toBe(4);
	});

	it('公差 d=0 (定数列の和 = 初項 × 項数)', () => {
		expect(arithmeticSum(3, 0, 10)).toBe(30);
	});

	it('n=0 → RangeError', () => {
		expect(() => arithmeticSum(1, 1, 0)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => arithmeticSum(1, 1, 2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a1 → RangeError`, () => {
			expect(() => arithmeticSum(value, 1, 3)).toThrow(RangeError);
		});
		it(`${label} な d → RangeError`, () => {
			expect(() => arithmeticSum(1, value, 3)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => arithmeticSum(1, 1, value)).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。arithmeticTerm/arithmeticSum は a1・d について広めのレンジ、
// n は項数として意味のある正整数域に絞る (C-7: 自己確認的テスト禁止。以下の各 property は
// 「同じ式へ戻すだけ」ではなく、独立した計算経路・独立した定義に立ち返って突合する)。
const a1Arb = fc.double({ min: -50, max: 50, noNaN: true });
const dArb = fc.double({ min: -20, max: 20, noNaN: true });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 和の公式 ↔ ループ加算の独立2経路突合 — arithmeticSum(a1,d,n) と ' +
			'Σ_{k=1}^{n} arithmeticTerm(a1,d,k) は一致する (C-7: arithmeticSum は係数の閉じた式、' +
			'ループ加算は arithmeticTerm を n 回呼んで足し合わせる別経路)',
		() => {
			fc.assert(
				fc.property(a1Arb, dArb, fc.integer({ min: 1, max: 100 }), (a1, d, n) => {
					const formula = arithmeticSum(a1, d, n);
					let loopSum = 0;
					for (let k = 1; k <= n; k++) {
						loopSum += arithmeticTerm(a1, d, k);
					}
					const scale = Math.max(1, Math.abs(formula), Math.abs(loopSum));
					return Math.abs(formula - loopSum) <= 1e-6 * scale;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 階差 arithmeticTerm(n+1) − arithmeticTerm(n) = d (公差の定義に立ち返る)', () => {
		fc.assert(
			fc.property(a1Arb, dArb, fc.integer({ min: 1, max: 1000 }), (a1, d, n) => {
				const diff = arithmeticTerm(a1, d, n + 1) - arithmeticTerm(a1, d, n);
				const scale = Math.max(1, Math.abs(d));
				return Math.abs(diff - d) <= 1e-9 * scale;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property: 比 geometricTerm(n+1)/geometricTerm(n) = r (公比の定義に立ち返る。' +
			'a1≠0・r≠0 の範囲でのみ比が定義される)',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: -20, max: 20, noNaN: true }).filter((v) => Math.abs(v) > 0.01),
					fc.double({ min: -3, max: 3, noNaN: true }).filter((v) => Math.abs(v) > 0.01),
					fc.integer({ min: 1, max: 20 }),
					(a1, r, n) => {
						const term = geometricTerm(a1, r, n);
						const termNext = geometricTerm(a1, r, n + 1);
						const ratio = termNext / term;
						const scale = Math.max(1, Math.abs(r));
						return Math.abs(ratio - r) <= 1e-6 * scale;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property: ガウスの逆順和対称性 — aₖ + a_{n+1−k} は k に依らず一定 (= 2a1+(n-1)d, 等差)。' +
			'これは arithmeticSum の公式 n(2a1+(n-1)d)/2 が「先頭+末尾」を n/2 組足し合わせている、' +
			'という定義そのものであり arithmeticSum は経由しない',
		() => {
			fc.assert(
				fc.property(
					a1Arb,
					dArb,
					fc.integer({ min: 1, max: 100 }),
					fc.integer({ min: 0, max: 1_000_000 }),
					(a1, d, n, rawK) => {
						const k = (rawK % n) + 1; // k を [1, n] へ写像する
						const pairSum = arithmeticTerm(a1, d, k) + arithmeticTerm(a1, d, n + 1 - k);
						const expected = 2 * a1 + (n - 1) * d;
						const scale = Math.max(1, Math.abs(expected));
						return Math.abs(pairSum - expected) <= 1e-6 * scale;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);
});
