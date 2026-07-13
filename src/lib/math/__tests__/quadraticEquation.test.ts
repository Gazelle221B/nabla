import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	discriminant,
	realRoots,
	evaluateStandard,
	vertexFromStandard,
} from '../quadraticEquation.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (linearTransformation.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('discriminant', () => {
	it('既知例: x^2-5x+6 (a=1,b=-5,c=6) → D=25-24=1', () => {
		expect(discriminant(1, -5, 6)).toBe(1);
	});

	it('既知例: x^2-2x+1 (a=1,b=-2,c=1) → D=4-4=0 (重解)', () => {
		expect(discriminant(1, -2, 1)).toBe(0);
	});

	it('既知例: x^2+1 (a=1,b=0,c=1) → D=0-4=-4 (実数解なし)', () => {
		expect(discriminant(1, 0, 1)).toBe(-4);
	});

	it('a=0 は二次方程式でないため RangeError', () => {
		expect(() => discriminant(0, 3, 2)).toThrow(RangeError);
	});

	it('aが0に近い(approximatelyZero)場合もRangeError', () => {
		expect(() => discriminant(1e-12, 3, 2)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError`, () => {
			expect(() => discriminant(value, 1, 1)).toThrow(RangeError);
		});
		it(`${label} な b → RangeError`, () => {
			expect(() => discriminant(1, value, 1)).toThrow(RangeError);
		});
		it(`${label} な c → RangeError`, () => {
			expect(() => discriminant(1, 1, value)).toThrow(RangeError);
		});
	}
});

describe('realRoots (既知例、タスク厳守事項 (e))', () => {
	it('x^2-5x+6=0 → {2,3} (昇順)', () => {
		expect(realRoots(1, -5, 6)).toEqual([2, 3]);
	});

	it('x^2-2x+1=0 → {1} (重解、exact zero で分類)', () => {
		expect(realRoots(1, -2, 1)).toEqual([1]);
	});

	it('x^2+1=0 → {} (実数の範囲に解はない、数Iの範囲)', () => {
		expect(realRoots(1, 0, 1)).toEqual([]);
	});

	it('a=0 は二次方程式でないため RangeError (UI から到達不能な境界も安全に例外)', () => {
		expect(() => realRoots(0, 3, 2)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な係数 → RangeError`, () => {
			expect(() => realRoots(value, 1, 1)).toThrow(RangeError);
		});
	}
});

describe('evaluateStandard', () => {
	it('既知例: x^2-5x+6 を x=2 で評価 → 0 (根)', () => {
		expect(evaluateStandard(1, -5, 6, 2)).toBe(0);
	});

	it('既知例: x^2-5x+6 を x=0 で評価 → 6 (定数項)', () => {
		expect(evaluateStandard(1, -5, 6, 0)).toBe(6);
	});

	it('a=0(二次でない退化)でも例外を投げず有限値を返す(MATH_CONVENTIONS §4)', () => {
		expect(evaluateStandard(0, 3, 2, 1)).toBe(5);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な x → RangeError`, () => {
			expect(() => evaluateStandard(1, 1, 1, value)).toThrow(RangeError);
		});
	}
});

describe('vertexFromStandard (completeSquare の薄いラッパー)', () => {
	it('既知例: x^2-4x+3 → 頂点 (2,-1)', () => {
		expect(vertexFromStandard(1, -4, 3)).toEqual([2, -1]);
	});

	it('a=0 は completeSquare 同様 RangeError', () => {
		expect(() => vertexFromStandard(0, 3, 2)).toThrow(RangeError);
	});
});

// fast-check 用の共通レンジ。a は0を跨がない(discriminant/realRootsの定義域)。
const aArb = fc
	.double({ min: -8, max: 8, noNaN: true })
	.filter((a) => !approximatelyZero(a, 1));
const bArb = fc.double({ min: -8, max: 8, noNaN: true });
const cArb = fc.double({ min: -8, max: 8, noNaN: true });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (a): 返った実数解を evaluateStandard に代入すると≈0になる — ' +
			'realRoots は completeSquare 由来の p と判別式の平方根から解を導出するのに対し、' +
			'evaluateStandard は completeSquare を経由しない独立な多項式評価 (ax^2+bx+c を直接計算) ' +
			'なので、これは解の定義 (ax^2+bx+c=0 を満たすxが解) への立ち返りであり、' +
			'解の公式のエコーを自己確認するだけのテストではない (C-7)',
		() => {
			fc.assert(
				fc.property(aArb, bArb, cArb, (a, b, c) => {
					const roots = realRoots(a, b, c);
					return roots.every((root) => {
						const residual = evaluateStandard(a, b, c, root);
						const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
						return approximatelyZero(residual, scale);
					});
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (b): 解の個数と判別式の符号は完全に対応する (D>0→2個, D=0→1個(exact), D<0→0個)', () => {
		fc.assert(
			fc.property(aArb, bArb, cArb, (a, b, c) => {
				const d = discriminant(a, b, c);
				const roots = realRoots(a, b, c);
				if (d > 0) return roots.length === 2;
				if (d === 0) return roots.length === 1;
				return roots.length === 0;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (c): 解と係数の関係(解と係数の関係、D≥0のとき) 和=-b/a、積=c/a(重解は重複度2で数える)', () => {
		fc.assert(
			fc.property(aArb, bArb, cArb, (a, b, c) => {
				const roots = realRoots(a, b, c);
				if (roots.length === 0) return true; // D<0 は対象外(実数解の和・積が定義できない)
				const [sum, product] =
					roots.length === 2
						? [roots[0] + roots[1], roots[0] * roots[1]]
						: [2 * roots[0], roots[0] * roots[0]];
				const expectedSum = -b / a;
				const expectedProduct = c / a;
				const scale = Math.max(1, Math.abs(expectedSum), Math.abs(expectedProduct));
				return (
					approximatelyZero(sum - expectedSum, scale) &&
					approximatelyZero(product - expectedProduct, scale)
				);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property (d): 構成的生成 — 既知の2根 p,q から a(x-p)(x-q) を展開した係数で realRoots を' +
			'呼ぶと、p,q が復元される(根→係数→根の往復、係数式からの独立オラクル)',
		() => {
			const pqArb = fc.double({ min: -6, max: 6, noNaN: true });
			const nonZeroAArb = fc
				.double({ min: -5, max: 5, noNaN: true })
				.filter((a) => !approximatelyZero(a, 1));
			fc.assert(
				fc.property(nonZeroAArb, pqArb, pqArb, (a, p, q) => {
					// a(x-p)(x-q) = a*x^2 - a(p+q)*x + a*p*q
					const b = -a * (p + q);
					const c = a * p * q;
					const roots = realRoots(a, b, c);
					const [lo, hi] = p <= q ? [p, q] : [q, p];
					if (roots.length === 2) {
						const scale = Math.max(1, Math.abs(lo), Math.abs(hi));
						return (
							approximatelyZero(roots[0] - lo, scale) && approximatelyZero(roots[1] - hi, scale)
						);
					}
					if (roots.length === 1) {
						// p===q (重解) に極めて近い場合のみここに来るはず。
						const scale = Math.max(1, Math.abs(lo), Math.abs(hi));
						return approximatelyZero(roots[0] - lo, scale) && approximatelyZero(lo - hi, scale);
					}
					// 構成的に判別式は (a(p-q))^2/a^2 の形で常に0以上のはずなので、
					// ここに来るのは丸め誤差で境界に極めて近いケースのみ。
					return approximatelyZero(p - q, Math.max(1, Math.abs(p), Math.abs(q)));
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: aが正でDが正のとき、放物線は2根の間で符号がx軸と反対になる(中間値の生きた確認)', () => {
		fc.assert(
			fc.property(aArb, bArb, cArb, (a, b, c) => {
				const roots = realRoots(a, b, c);
				if (roots.length !== 2) return true;
				const [lo, hi] = roots;
				const mid = (lo + hi) / 2;
				const valueAtMid = evaluateStandard(a, b, c, mid);
				// 頂点でのyの値はaと反対符号(a>0なら下に凸で頂点が最小、a<0なら上に凸で頂点が最大)。
				return Math.sign(valueAtMid) === -Math.sign(a) || approximatelyZero(valueAtMid, Math.max(1, Math.abs(a)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
