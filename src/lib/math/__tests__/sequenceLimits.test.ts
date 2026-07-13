import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyGeometricLimit, geometricPartialSum, geometricSeriesSum } from '../sequenceLimits.js';
import { geometricTerm } from '../sequences.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (expLog.test.ts / probability.test.ts
// と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('classifyGeometricLimit', () => {
	it('|r|<1 (r=0.8) → converges-to-zero', () => {
		expect(classifyGeometricLimit(0.8)).toBe('converges-to-zero');
	});

	it('|r|<1 (r=-0.8、負でも絶対値が1未満なら0に収束) → converges-to-zero', () => {
		expect(classifyGeometricLimit(-0.8)).toBe('converges-to-zero');
	});

	it('r=0(退化例) → converges-to-zero', () => {
		expect(classifyGeometricLimit(0)).toBe('converges-to-zero');
	});

	it('r=1(境界、exact) → constant', () => {
		expect(classifyGeometricLimit(1)).toBe('constant');
	});

	it('r>1 (r=1.2) → diverges', () => {
		expect(classifyGeometricLimit(1.2)).toBe('diverges');
	});

	it('r=-1(境界、exact) → oscillates', () => {
		expect(classifyGeometricLimit(-1)).toBe('oscillates');
	});

	it('r<-1 (r=-1.2) → oscillates', () => {
		expect(classifyGeometricLimit(-1.2)).toBe('oscillates');
	});

	// 境界の exact 判定が「僅かに超えた瞬間に分類が変わる」ことをピンポイントで固定する
	// (quadraticEquation.ts の D=0 境界テストと同じ発想)。
	it('r=1 のごく近傍でも exact に分類が切り替わる(1-1e-9 → converges-to-zero, 1+1e-9 → diverges)', () => {
		expect(classifyGeometricLimit(1 - 1e-9)).toBe('converges-to-zero');
		expect(classifyGeometricLimit(1 + 1e-9)).toBe('diverges');
	});

	it('r=-1 のごく近傍でも exact に分類が切り替わる(-1+1e-9 → converges-to-zero, -1-1e-9 → oscillates)', () => {
		expect(classifyGeometricLimit(-1 + 1e-9)).toBe('converges-to-zero');
		expect(classifyGeometricLimit(-1 - 1e-9)).toBe('oscillates');
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な r → RangeError`, () => {
			expect(() => classifyGeometricLimit(value)).toThrow(RangeError);
		});
	}
});

describe('geometricPartialSum', () => {
	it('黄金値(手計算・再検算済み): r=1/2, n=1 → S=1', () => {
		expect(geometricPartialSum(0.5, 1)).toBe(1);
	});

	it('黄金値(手計算・再検算済み): r=1/2, n=10 → S₁₀=1023/512=1.998046875', () => {
		// S₁₀ = (1-(1/2)^10)/(1-1/2) = (1-1/1024)/(1/2) = (1023/1024)×2 = 1023/512
		expect(geometricPartialSum(0.5, 10)).toBeCloseTo(1023 / 512, 12);
		expect(1023 / 512).toBeCloseTo(1.998046875, 12);
	});

	it('n=0(空和、退化例 MATH_CONVENTIONS §4) → 0', () => {
		expect(geometricPartialSum(0.5, 0)).toBe(0);
		expect(geometricPartialSum(2, 0)).toBe(0);
		expect(geometricPartialSum(1, 0)).toBe(0);
	});

	it('r=1(境界、除算を避けnをそのまま返す) → n', () => {
		expect(geometricPartialSum(1, 1)).toBe(1);
		expect(geometricPartialSum(1, 10)).toBe(10);
		expect(geometricPartialSum(1, 0)).toBe(0);
	});

	it('r=-1(境界、振動): 部分和は 1 と 0 を交互に取る', () => {
		expect(geometricPartialSum(-1, 1)).toBe(1);
		expect(geometricPartialSum(-1, 2)).toBe(0);
		expect(geometricPartialSum(-1, 3)).toBe(1);
		expect(geometricPartialSum(-1, 4)).toBe(0);
	});

	it('n が負・非整数 → RangeError', () => {
		expect(() => geometricPartialSum(0.5, -1)).toThrow(RangeError);
		expect(() => geometricPartialSum(0.5, 2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な r → RangeError`, () => {
			expect(() => geometricPartialSum(value, 5)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => geometricPartialSum(0.5, value)).toThrow(RangeError);
		});
	}
});

describe('geometricSeriesSum', () => {
	it('黄金値(手計算・再検算済み): r=1/2 → S=1/(1-1/2)=2', () => {
		expect(geometricSeriesSum(0.5)).toBe(2);
	});

	it('黄金値(手計算・再検算済み): r=-1/2 → S=1/(1+1/2)=2/3', () => {
		expect(geometricSeriesSum(-0.5)).toBeCloseTo(2 / 3, 12);
	});

	it('r=1(収束しない、一定) → RangeError', () => {
		expect(() => geometricSeriesSum(1)).toThrow(RangeError);
	});

	it('r=-1(収束しない、振動の境界) → RangeError', () => {
		expect(() => geometricSeriesSum(-1)).toThrow(RangeError);
	});

	it('|r|>1(収束しない、発散・振動) → RangeError', () => {
		expect(() => geometricSeriesSum(1.5)).toThrow(RangeError);
		expect(() => geometricSeriesSum(-1.5)).toThrow(RangeError);
	});

	// |r|<1 のごく近傍の境界でも exact に切り替わる(geometricPartialSum の r≈1 近傍緩和とは
	// 別物であることの確認: こちらは |r|>=1 の exact 判定のみで、近傍緩和を持たない——級数が
	// 「収束するかしないか」という2値の性質は除算の分母の話ではなく、|r|<1 という真の数学的
	// 境界そのものだからである)。
	it('r=1-1e-9(境界のすぐ内側)は収束し、r=1+1e-9(すぐ外側)はRangeError', () => {
		expect(() => geometricSeriesSum(1 - 1e-9)).not.toThrow();
		expect(() => geometricSeriesSum(1 + 1e-9)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な r → RangeError`, () => {
			expect(() => geometricSeriesSum(value)).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通 arbitrary。partialSum の r=1/-1 近傍緩和帯 (|r-1|<=1e-9) を避けて
// 生成する(緩和帯そのものの挙動は上の単体テストで別途固定済みであり、不変条件テストの
// 対象は「通常の r」における2経路の一致であるため)。
const rNotNearOneArb = fc
	.double({ min: -3, max: 3, noNaN: true })
	.filter((r) => Math.abs(r - 1) > 1e-6);

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (a): 部分和の漸化式 S_{n+1}=S_n+r^n との突合 ' +
			'(geometricPartialSum は閉形式 (1-r^n)/(1-r) を1回だけ評価する経路。このテストは' +
			'geometricPartialSum(r,n) から出発し、sequences.ts の geometricTerm(1,r,n+1)=r^n を' +
			'1回だけ足す、独立したコードパスで S_{n+1} を再構成して突合する。C-7: 同じ式へ戻すだけの' +
			'自己確認にならない、閉形式 vs 逐次加算1ステップという分離した経路)',
		() => {
			fc.assert(
				fc.property(rNotNearOneArb, fc.integer({ min: 0, max: 30 }), (r, n) => {
					const sN = geometricPartialSum(r, n);
					const sNPlus1 = geometricPartialSum(r, n + 1);
					const rToN = geometricTerm(1, r, n + 1); // geometricTerm(a1=1, r, n+1) = r^((n+1)-1) = r^n
					const scale = Math.max(1, Math.abs(sNPlus1), Math.abs(sN), Math.abs(rToN));
					return approximatelyZero(sNPlus1 - (sN + rToN), scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (b): |r|<1 で部分和は 1/(1-r) へ単調に近づき、誤差は厳密に |S_n-S|=|r|^n・|S| ' +
			'(等比数列の美点: この誤差式は geometricSeriesSum(級数の極限)と geometricPartialSum' +
			'(部分和の閉形式)という独立した2つの公開関数を突き合わせる恒等式であり、片方だけを' +
			'見た自己確認ではない)',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: -0.999, max: 0.999, noNaN: true }),
					fc.integer({ min: 0, max: 40 }),
					(r, n) => {
						const s = geometricSeriesSum(r);
						const sN = geometricPartialSum(r, n);
						const actualError = Math.abs(sN - s);
						const predictedError = Math.abs(r) ** n * Math.abs(s);
						const scale = Math.max(1, Math.abs(s));
						if (!approximatelyZero(actualError - predictedError, scale)) return false;

						// 単調性: n を1増やすと誤差(=|r|^n・|S|)は狭義に減少する(|r|<1 のため)。
						const sNext = geometricPartialSum(r, n + 1);
						const errorNext = Math.abs(sNext - s);
						return errorNext <= actualError + 1e-9 * scale;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (c-1): |r|<1 では、nを大きくすると項の実値 r^n は0に近づく' +
			'(sequences.ts の geometricTerm を用い、大きい n での実測値が実質0とみなせることを確認。' +
			'|r|<=0.9・n=200 に固定するのは、0.9^200≈7.1e-10 のように境界の r=±0.9 でも十分な余裕を' +
			'持って1e-6を下回ることを事前に node で検算済みだから——|r|→1 に近いほど収束は遅くなる' +
			'ので、この単元のUIが実際に到達させる範囲(後述のスライダー可動域)に対応する余裕を確保する)',
		() => {
			fc.assert(
				fc.property(fc.double({ min: -0.9, max: 0.9, noNaN: true }), (r) => {
					if (classifyGeometricLimit(r) !== 'converges-to-zero') return true; // r=0 も含め対象内
					const term200 = geometricTerm(1, r, 201); // r^200
					return Math.abs(term200) <= 1e-6;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (c-2): r>1 では、nを大きくすると項の実値 r^n は単調に増大し続ける' +
			'(diverges 分類との整合。geometricTerm による実測値どうしの比較)',
		() => {
			fc.assert(
				fc.property(fc.double({ min: 1.001, max: 3, noNaN: true }), fc.integer({ min: 1, max: 20 }), (r, n) => {
					if (classifyGeometricLimit(r) !== 'diverges') return true;
					const termN = geometricTerm(1, r, n);
					const termNPlus1 = geometricTerm(1, r, n + 1);
					return termNPlus1 > termN;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (e-numeric): 非有限入力は classifyGeometricLimit / geometricPartialSum / geometricSeriesSum いずれもRangeError', () => {
		fc.assert(
			fc.property(fc.constantFrom(NaN, Infinity, -Infinity), (bad) => {
				const a = (() => {
					try {
						classifyGeometricLimit(bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const b = (() => {
					try {
						geometricPartialSum(bad, 5);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const c = (() => {
					try {
						geometricSeriesSum(bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				return a && b && c;
			}),
			{ seed: 42, numRuns: 10 },
		);
	});
});
