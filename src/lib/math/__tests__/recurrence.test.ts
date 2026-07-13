import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	fibonacci,
	naiveCallCount,
	memoizedComputationCount,
	MAX_SAFE_FIB_N,
	MAX_SAFE_NAIVE_CALL_N,
} from '../recurrence.js';

// 非有限入力 (NaN / Infinity) を全関数について検証するための共通ヘルパー
// (combinatorics.test.ts / sequences.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2; // φ ≈ 1.618033988749895

describe('fibonacci', () => {
	it('黄金値: fib(0)=0, fib(1)=1, fib(2)=1, fib(10)=55, fib(16)=987(手計算・反復ループで検算済み)', () => {
		expect(fibonacci(0)).toBe(0);
		expect(fibonacci(1)).toBe(1);
		expect(fibonacci(2)).toBe(1);
		expect(fibonacci(10)).toBe(55);
		expect(fibonacci(16)).toBe(987);
	});

	it('安全域の境界: fib(78) は Number.MAX_SAFE_INTEGER 未満の厳密値と一致する', () => {
		expect(fibonacci(78)).toBe(8944394323791464);
		expect(Number.isSafeInteger(fibonacci(78))).toBe(true);
		expect(fibonacci(78)).toBeLessThan(2 ** 53);
	});

	it('79以上(安全域外)は RangeError', () => {
		expect(() => fibonacci(79)).toThrow(RangeError);
		expect(() => fibonacci(200)).toThrow(RangeError);
	});

	it('負・非整数 → RangeError', () => {
		expect(() => fibonacci(-1)).toThrow(RangeError);
		expect(() => fibonacci(2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => fibonacci(value)).toThrow(RangeError);
		});
	}

	it('property: n≥2 で fib(n)=fib(n−1)+fib(n−2)(定義そのものを全域で確認、fast-check seed 42)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: MAX_SAFE_FIB_N }), (n) => {
				return fibonacci(n) === fibonacci(n - 1) + fibonacci(n - 2);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('naiveCallCount', () => {
	it('黄金値: C(0)=1, C(1)=1, C(10)=177, C(15)=1973, C(20)=21891, C(30)=2692537(手計算・再検算済み)', () => {
		expect(naiveCallCount(0)).toBe(1);
		expect(naiveCallCount(1)).toBe(1);
		expect(naiveCallCount(10)).toBe(177);
		expect(naiveCallCount(15)).toBe(1973);
		expect(naiveCallCount(20)).toBe(21891);
		expect(naiveCallCount(30)).toBe(2692537);
	});

	it('黄金値: C(50)=40730022147(fib(50)の素朴再帰の呼び出し回数、記事の転用問題2と対応)', () => {
		expect(naiveCallCount(50)).toBe(40730022147);
	});

	it('安全域の境界: C(75) は定義域の上限で例外なく計算できる(2・fib(76)−1と一致)', () => {
		expect(() => naiveCallCount(MAX_SAFE_NAIVE_CALL_N)).not.toThrow();
		expect(naiveCallCount(75)).toBe(6832909245813413);
	});

	it('76以上(定義域外——C(n)=2・fib(n+1)−1 が安全域を超える)は RangeError', () => {
		expect(() => naiveCallCount(76)).toThrow(RangeError);
		expect(() => naiveCallCount(100)).toThrow(RangeError);
	});

	it('負・非整数 → RangeError', () => {
		expect(() => naiveCallCount(-1)).toThrow(RangeError);
		expect(() => naiveCallCount(2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => naiveCallCount(value)).toThrow(RangeError);
		});
	}

	it('境界: C(0)=C(1)=1(等しい、この2点だけは単調増加が成り立たない)', () => {
		expect(naiveCallCount(0)).toBe(naiveCallCount(1));
	});

	it('property: n≥1 で C(n+1) > C(n)(狭義単調増加、fast-check seed 42)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: MAX_SAFE_NAIVE_CALL_N - 1 }), (n) => {
				return naiveCallCount(n + 1) > naiveCallCount(n);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('黄金値: 増加率 C(75)/C(74) は黄金比 φ≈1.618033988749895 に極めて近い(手計算・検算済み)', () => {
		const ratio = naiveCallCount(75) / naiveCallCount(74);
		expect(Math.abs(ratio - GOLDEN_RATIO)).toBeLessThan(1e-9);
	});

	it('n が大きいほど増加率が黄金比へ近づく(n=40と n=74で誤差を比較)', () => {
		const ratioAt40 = naiveCallCount(41) / naiveCallCount(40);
		const ratioAt74 = naiveCallCount(75) / naiveCallCount(74);
		expect(Math.abs(ratioAt74 - GOLDEN_RATIO)).toBeLessThanOrEqual(Math.abs(ratioAt40 - GOLDEN_RATIO));
	});
});

describe('memoizedComputationCount', () => {
	it('黄金値: memoized(0)=1, memoized(10)=11, memoized(30)=31, memoized(78)=79(定義 n+1 の通り)', () => {
		expect(memoizedComputationCount(0)).toBe(1);
		expect(memoizedComputationCount(10)).toBe(11);
		expect(memoizedComputationCount(30)).toBe(31);
		expect(memoizedComputationCount(78)).toBe(79);
	});

	it('79以上(fibonacciと同じ安全域を超える)は RangeError', () => {
		expect(() => memoizedComputationCount(79)).toThrow(RangeError);
	});

	it('負・非整数 → RangeError', () => {
		expect(() => memoizedComputationCount(-1)).toThrow(RangeError);
		expect(() => memoizedComputationCount(2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => memoizedComputationCount(value)).toThrow(RangeError);
		});
	}

	it('property: memoizedComputationCount(n) === n+1 が全域で厳密に成り立つ(fast-check seed 42)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: MAX_SAFE_FIB_N }), (n) => {
				return memoizedComputationCount(n) === n + 1;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('C-7 交差検証: naiveCallCount(n) === 2・fibonacci(n+1) − 1', () => {
	// fast-check のランダムサンプリングに頼らず、n=0..75(naiveCallCountの安全域全体)を
	// 文字通り総当たりで確認する。値は整数演算のみを経由するため、厳密等価(===)で比較する
	// (approximatelyZero のようなスケール相対誤差は不要、MATH_CONVENTIONS §2 の対象外——
	// recurrence.ts のコメント参照)。
	it('n=0..75 の全域で恒等式が厳密に一致する(網羅チェック)', () => {
		for (let n = 0; n <= MAX_SAFE_NAIVE_CALL_N; n++) {
			expect(naiveCallCount(n)).toBe(2 * fibonacci(n + 1) - 1);
		}
	});

	it('property: 同じ恒等式を fast-check でも独立に検証する(seed 42, numRuns 200)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: MAX_SAFE_NAIVE_CALL_N }), (n) => {
				return naiveCallCount(n) === 2 * fibonacci(n + 1) - 1;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
