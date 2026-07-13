import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { expBase, logBase } from '../expLog.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (quadraticEquation.test.ts /
// linearTransformation.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

// approximatelyZero (MATH_CONVENTIONS §2、スケール相対誤差) を使った近似一致の共通ヘルパー。
// 対数の除算(ln(x)/ln(a))は toBe による bit-exact 一致を期待できない(例: log_2 8 は数学的に
// ちょうど3だが、Math.log(8)/Math.log(2) は浮動小数点丸めで3から1e-15オーダーずれうる)ため、
// このプロジェクト既定の相対誤差判定を再利用する(toBeCloseTo の固定桁数ではなくスケールに
// 合わせる)。
function expectApproxEqual(actual: number, expected: number, extraScale = 0): void {
	const scale = Math.max(1, Math.abs(expected), extraScale);
	expect(
		approximatelyZero(actual - expected, scale),
		`expected ${actual} to be approximately ${expected} (scale=${scale})`,
	).toBe(true);
}

describe('expBase (既知例)', () => {
	it('2^10 = 1024 (べき乗は2進浮動小数点で厳密)', () => {
		expect(expBase(2, 10)).toBe(1024);
	});

	it('3^4 = 81', () => {
		expect(expBase(3, 4)).toBe(81);
	});

	it('a^0 = 1 (任意の正の底)', () => {
		expect(expBase(1.2, 0)).toBe(1);
		expect(expBase(4, 0)).toBe(1);
	});

	it('4^0.5 = 2 (平方根)', () => {
		expect(expBase(4, 0.5)).toBe(2);
	});

	it('a<=0 は RangeError (a=-2, a=0 のいずれも)', () => {
		expect(() => expBase(-2, 3)).toThrow(RangeError);
		expect(() => expBase(0, 3)).toThrow(RangeError);
	});

	it('a=1 は expBase 自体では問題なく評価できる (1^x=1、除外するのは logBase 側のみ)', () => {
		expect(expBase(1, 5)).toBe(1);
		expect(expBase(1, -3)).toBe(1);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError`, () => {
			expect(() => expBase(value, 1)).toThrow(RangeError);
		});
		it(`${label} な x → RangeError`, () => {
			expect(() => expBase(2, value)).toThrow(RangeError);
		});
	}
});

describe('logBase (既知例、黄金値オラクル)', () => {
	it('log_2 8 = 3 (2^3=8)', () => {
		expectApproxEqual(logBase(2, 8), 3);
	});

	it('log_10 100 = 2', () => {
		expectApproxEqual(logBase(10, 100), 2);
	});

	it('log_10 1000 = 3', () => {
		expectApproxEqual(logBase(10, 1000), 3);
	});

	it('log_3 27 = 3 (3^3=27)', () => {
		expectApproxEqual(logBase(3, 27), 3);
	});

	it('log_4 2 = 0.5 (4^0.5=2)', () => {
		expectApproxEqual(logBase(4, 2), 0.5);
	});

	it('log_a 1 = 0 (任意の有効な底)', () => {
		expectApproxEqual(logBase(1.2, 1), 0);
		expectApproxEqual(logBase(4, 1), 0);
	});

	it('x<=0 は RangeError (x=0, x=-1 のいずれも、対数の真数条件)', () => {
		expect(() => logBase(2, 0)).toThrow(RangeError);
		expect(() => logBase(2, -1)).toThrow(RangeError);
	});

	it('a<=0 は RangeError (底の条件)', () => {
		expect(() => logBase(-2, 4)).toThrow(RangeError);
		expect(() => logBase(0, 4)).toThrow(RangeError);
	});

	it('a=1 は exact でも近傍でも RangeError (log(a)→0 の除算爆発を回避)', () => {
		expect(() => logBase(1, 4)).toThrow(RangeError);
		expect(() => logBase(1 + 1e-13, 4)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError`, () => {
			expect(() => logBase(value, 4)).toThrow(RangeError);
		});
		it(`${label} な x → RangeError`, () => {
			expect(() => logBase(2, value)).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。a は 1 から十分離す (margin 0.2)。これは logBase 自身の
// approximatelyZero(a-1, 1) 閾値 (EPSILON=1e-9 相対、ほぼ exact a=1 のみを弾く) より
// ずっと広いテスト用マージンであり、実装の閾値を変えるものではない——1.2 近傍では
// ln(a) が小さく除算で誤差が増幅されるため、不変条件テストの数値安定性を確保する目的で
// テスト側だけ広めに避けている(UI のスライダー可動域 [1.2,4] とも整合する)。
const aArb = fc
	.double({ min: 0.2, max: 6, noNaN: true })
	.filter((a) => Math.abs(a - 1) > 0.2);
const exponentArb = fc.double({ min: -3, max: 3, noNaN: true });
const positiveArb = fc.double({ min: 0.05, max: 50, noNaN: true });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (a): 往復 logBase(a, expBase(a,x))≈x と expBase(a, logBase(a,y))≈y — ' +
			'「aを何乗したらxになるか」という逆関数の定義への立ち返り。ただし expBase/logBase は' +
			'どちらも Math.pow/Math.log という同系統の実装に依存するため、この往復テストだけを' +
			'唯一の正しさの根拠にはしない(過大主張しない、確立済みレビュー学習)。主オラクルは' +
			'上の既知値テスト(log_2 8=3 等、手計算で独立に検証可能な黄金値)であり、この' +
			'property は「fuzzingされた広い範囲でも逆関数の関係が崩れないか」を確認する補助的な' +
			'不変条件と位置づける',
		() => {
			fc.assert(
				fc.property(aArb, exponentArb, (a, x) => {
					const y = expBase(a, x);
					const roundTripX = logBase(a, y);
					return approximatelyZero(roundTripX - x, Math.max(1, Math.abs(x)));
				}),
				{ seed: 42, numRuns: 200 },
			);
			fc.assert(
				fc.property(aArb, positiveArb, (a, y) => {
					const x = logBase(a, y);
					const roundTripY = expBase(a, x);
					return approximatelyZero(roundTripY - y, Math.max(1, Math.abs(y)));
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (b): 指数法則 a^(x+y) = a^x・a^y', () => {
		fc.assert(
			fc.property(aArb, exponentArb, exponentArb, (a, x, y) => {
				const lhs = expBase(a, x + y);
				const rhs = expBase(a, x) * expBase(a, y);
				return approximatelyZero(lhs - rhs, Math.max(1, Math.abs(lhs), Math.abs(rhs)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (c-1): 対数法則 log_a(xy) = log_a(x) + log_a(y)', () => {
		fc.assert(
			fc.property(aArb, positiveArb, positiveArb, (a, x, y) => {
				const lhs = logBase(a, x * y);
				const rhs = logBase(a, x) + logBase(a, y);
				return approximatelyZero(lhs - rhs, Math.max(1, Math.abs(lhs), Math.abs(rhs)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (c-2): 対数法則 log_a(x^k) = k・log_a(x)', () => {
		const kArb = fc.double({ min: -3, max: 3, noNaN: true });
		fc.assert(
			fc.property(aArb, positiveArb, kArb, (a, x, k) => {
				// x^k は独立に Math.pow で構成する(expBase を経由すると同じ実装を2回使うことになり、
				// 「log(x^k)=k log(x)」という対数法則そのものの検証が薄まるため、入力の構成は
				// 対数法則の外側にある素朴な Math.pow を使う)。
				const xToK = Math.pow(x, k);
				if (!Number.isFinite(xToK) || xToK <= 0) return true; // 構成上の数値限界は対象外
				const lhs = logBase(a, xToK);
				const rhs = k * logBase(a, x);
				return approximatelyZero(lhs - rhs, Math.max(1, Math.abs(lhs), Math.abs(rhs)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	// 単調性テスト用: lo<hi を保証する組 (十分な間隔 gap>=0.01 で丸め誤差による同値化を避ける)。
	const orderedExponentPairArb = fc
		.tuple(fc.double({ min: -3, max: 2.9, noNaN: true }), fc.double({ min: 0.01, max: 3, noNaN: true }))
		.map(([lo, gap]) => [lo, lo + gap] as const);
	const orderedPositivePairArb = fc
		.tuple(fc.double({ min: 0.01, max: 47, noNaN: true }), fc.double({ min: 0.01, max: 3, noNaN: true }))
		.map(([lo, gap]) => [lo, lo + gap] as const);

	it('property (d-1): 単調性(指数関数) — a>1なら増加、0<a<1なら減少', () => {
		fc.assert(
			fc.property(aArb, orderedExponentPairArb, (a, [lo, hi]) => {
				const yLo = expBase(a, lo);
				const yHi = expBase(a, hi);
				return a > 1 ? yLo < yHi : yLo > yHi;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (d-2): 単調性(対数関数) — a>1なら増加、0<a<1なら減少', () => {
		fc.assert(
			fc.property(aArb, orderedPositivePairArb, (a, [lo, hi]) => {
				const yLo = logBase(a, lo);
				const yHi = logBase(a, hi);
				return a > 1 ? yLo < yHi : yLo > yHi;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (e): 定義域外(x<=0・a<=0・a=1)は必ずRangeError、非有限も網羅', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -10, max: 0, noNaN: true }),
				aArb,
				(nonPositiveX, validA) => {
					expect(() => logBase(validA, nonPositiveX)).toThrow(RangeError);
					return true;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
		fc.assert(
			fc.property(fc.double({ min: -10, max: 0, noNaN: true }), positiveArb, (nonPositiveA, x) => {
				expect(() => expBase(nonPositiveA, x)).toThrow(RangeError);
				expect(() => logBase(nonPositiveA, x)).toThrow(RangeError);
				return true;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
