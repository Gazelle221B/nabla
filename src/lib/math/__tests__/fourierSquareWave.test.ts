import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	squareWave,
	squareWaveCoefficient,
	fourierPartialSum,
	computeCoefficientByQuadrature,
} from '../fourierSquareWave.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (sequenceLimits.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('squareWave', () => {
	it('黄金値(手計算・再検算済み): t=π/2 → 1(sin(π/2)=1>0)', () => {
		expect(squareWave(Math.PI / 2)).toBe(1);
	});

	it('黄金値(手計算・再検算済み): t=-π/4 → -1(sin(-π/4)<0)', () => {
		expect(squareWave(-Math.PI / 4)).toBe(-1);
	});

	it('不連続点 t=0, π, 2π, -π(浮動小数点の Math.PI 倍) → 0(左右極限の平均)', () => {
		expect(squareWave(0)).toBe(0);
		expect(squareWave(Math.PI)).toBe(0);
		expect(squareWave(2 * Math.PI)).toBe(0);
		expect(squareWave(-Math.PI)).toBe(0);
	});

	it('不連続点から真に離れた値は0に丸められない(近傍判定が分類境界を鈍らせない)', () => {
		// t=π+1e-6 は sin(t)≈-1e-6 であり、approximatelyZero の許容帯(|sin t|<=1e-9)には
		// 入らないため、square(t)=-1 のまま(0 に潰れない)。
		expect(squareWave(Math.PI + 1e-6)).toBe(-1);
		expect(squareWave(Math.PI - 1e-6)).toBe(1);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な t → RangeError`, () => {
			expect(() => squareWave(value)).toThrow(RangeError);
		});
	}
});

describe('squareWaveCoefficient', () => {
	it('黄金値(手計算・再検算済み): b_1 = 4/π', () => {
		expect(squareWaveCoefficient(1)).toBe(4 / Math.PI);
	});

	it('黄金値(手計算・再検算済み): b_3 = 4/(3π)', () => {
		expect(squareWaveCoefficient(3)).toBeCloseTo(4 / (3 * Math.PI), 12);
	});

	it('偶数次 → 0', () => {
		expect(squareWaveCoefficient(2)).toBe(0);
		expect(squareWaveCoefficient(4)).toBe(0);
		expect(squareWaveCoefficient(50)).toBe(0);
	});

	it('k が非正・非整数・非有限 → RangeError', () => {
		expect(() => squareWaveCoefficient(0)).toThrow(RangeError);
		expect(() => squareWaveCoefficient(-1)).toThrow(RangeError);
		expect(() => squareWaveCoefficient(2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な k → RangeError`, () => {
			expect(() => squareWaveCoefficient(value)).toThrow(RangeError);
		});
	}
});

describe('computeCoefficientByQuadrature', () => {
	it('k が非正・非整数・非有限 → RangeError', () => {
		expect(() => computeCoefficientByQuadrature(0)).toThrow(RangeError);
		expect(() => computeCoefficientByQuadrature(-3)).toThrow(RangeError);
		expect(() => computeCoefficientByQuadrature(1.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な k → RangeError`, () => {
			expect(() => computeCoefficientByQuadrature(value)).toThrow(RangeError);
		});
	}

	it('偶数次でも求積は実質0(node で再計算済み: |quad|<1e-15 のオーダー)', () => {
		expect(Math.abs(computeCoefficientByQuadrature(2))).toBeLessThan(1e-10);
		expect(Math.abs(computeCoefficientByQuadrature(10))).toBeLessThan(1e-10);
	});
});

describe('fourierPartialSum', () => {
	it('黄金値(node で再計算・確定済み): S_1(π/2) = 4/π ≈ 1.27324(1項でも行き過ぎる)', () => {
		const s1 = fourierPartialSum(1, Math.PI / 2);
		expect(s1).toBeCloseTo(4 / Math.PI, 10);
		expect(s1).toBeCloseTo(1.27324, 4);
		// 「1項でも行き過ぎる」: square(π/2)=1 だが S_1(π/2)>1。
		expect(s1).toBeGreaterThan(1);
	});

	it('nTerms=0(空和、退化例) → 恒等的に0', () => {
		expect(fourierPartialSum(0, 0.7)).toBe(0);
		expect(fourierPartialSum(0, Math.PI / 2)).toBe(0);
	});

	it('nTerms が負・非整数・非有限 → RangeError', () => {
		expect(() => fourierPartialSum(-1, 0.5)).toThrow(RangeError);
		expect(() => fourierPartialSum(2.5, 0.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な t → RangeError`, () => {
			expect(() => fourierPartialSum(5, value)).toThrow(RangeError);
		});
		it(`${label} な nTerms → RangeError`, () => {
			expect(() => fourierPartialSum(value, 0.5)).toThrow(RangeError);
		});
	}
});

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (1) C-7 交差検証: computeCoefficientByQuadrature(積分の定義を数値積分する経路) と ' +
			'squareWaveCoefficient(閉形式 4/(πk) を代数的に評価する経路) が奇数 k<=25 で一致する' +
			'(「公式 vs 定義」という真に独立した2経路の突合、approximatelyZero・スケール引数は係数値)',
		() => {
			fc.assert(
				fc.property(fc.integer({ min: 1, max: 13 }), (j) => {
					const k = 2 * j - 1; // 1, 3, 5, ..., 25 の奇数
					const closed = squareWaveCoefficient(k);
					const quad = computeCoefficientByQuadrature(k);
					return approximatelyZero(closed - quad, Math.abs(closed));
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (2) ライプニッツ級数: S_N(π/2) = (4/π)(1-1/3+1/5-…) は交代級数であり、' +
			'|S_N(π/2)-1| は厳密な交代級数の剰余項上界 4/(π(2N+1)) 以下(square(π/2)=1 への収束)',
		() => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 300 }), (N) => {
					const sN = fourierPartialSum(N, Math.PI / 2);
					const err = Math.abs(sN - 1);
					const bound = 4 / (Math.PI * (2 * N + 1));
					return err <= bound + 1e-12;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (3) 奇関数性: S_N(-t) = -S_N(t)(sin 経由の浮動小数計算のため exact ではなく ' +
			'approximatelyZero で判定)',
		() => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 50 }),
					fc.double({ min: -10, max: 10, noNaN: true }),
					(N, t) => {
						const a = fourierPartialSum(N, -t);
						const b = -fourierPartialSum(N, t);
						const scale = Math.max(1, Math.abs(a), Math.abs(b));
						return approximatelyZero(a - b, scale);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (4) パーセバルの等式: Σ_{j=1}^{N} b_{2j-1}²/2 は N を増やすと単調に増加し、' +
			'常に上界1未満(全項が正、無限和はちょうど2なので部分和/2は1を超えない)。' +
			'N と N+1 を比較する独立した2つの評価どうしの突合。',
		() => {
			function parsevalPartialSum(N: number): number {
				let sumSq = 0;
				for (let j = 1; j <= N; j++) {
					const b = squareWaveCoefficient(2 * j - 1);
					sumSq += b * b;
				}
				return sumSq / 2;
			}
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 300 }), (N) => {
					const pN = parsevalPartialSum(N);
					const pNPlus1 = parsevalPartialSum(N + 1);
					return pNPlus1 >= pN - 1e-12 && pN < 1 && pNPlus1 < 1;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (5-numeric): 非有限入力は squareWave / squareWaveCoefficient / fourierPartialSum / computeCoefficientByQuadrature いずれもRangeError', () => {
		fc.assert(
			fc.property(fc.constantFrom(NaN, Infinity, -Infinity), (bad) => {
				const a = (() => {
					try {
						squareWave(bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const b = (() => {
					try {
						squareWaveCoefficient(bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const c = (() => {
					try {
						fourierPartialSum(5, bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const d = (() => {
					try {
						computeCoefficientByQuadrature(bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				return a && b && c && d;
			}),
			{ seed: 42, numRuns: 10 },
		);
	});
});

// ギブス現象の golden(動的性質の事前検証、AGENTS.md タスク厳守事項: 動的性質は実装前に node で
// 検算する)。N を増やしても S_N の最大値は 1 に戻らず、約1.179(ジャンプ幅2の約8.95%の
// オーバーシュート、Gibbs定数 (2/π)Si(π)≈1.17898 へ漸近)に留まり続けることを固定する。
// 実測値(node で2000点走査・再確認、samples=200000でも同一値に収束することを確認済み):
//   N=10: max S_N ≈ 1.179814019618836 (t=π/(2N) 付近)
//   N=25: max S_N ≈ 1.1791131018882952
//   N=50: max S_N ≈ 1.1790130793104288
describe('ギブス現象の golden(N=10, 25, 50 で最大値が1.179近辺に留まり、1に戻らない)', () => {
	function maxOfPartialSum(N: number, samples = 2000): number {
		let maxVal = -Infinity;
		for (let i = 1; i <= samples; i++) {
			const t = (Math.PI * i) / samples;
			const v = fourierPartialSum(N, t);
			if (v > maxVal) maxVal = v;
		}
		return maxVal;
	}

	it('N=10: 最大値 ≈ 1.1798(node 再検算済みgolden値)', () => {
		expect(maxOfPartialSum(10)).toBeCloseTo(1.179814019618836, 9);
	});

	it('N=25: 最大値 ≈ 1.1791(node 再検算済みgolden値)', () => {
		expect(maxOfPartialSum(25)).toBeCloseTo(1.1791131018882952, 9);
	});

	it('N=50: 最大値 ≈ 1.1790(node 再検算済みgolden値、N=10より小さいが1へは戻らない)', () => {
		const max50 = maxOfPartialSum(50);
		expect(max50).toBeCloseTo(1.1790130793104288, 9);
		// N を増やしても最大値は1(方形波の頂上の値)へ戻らない——ギブス現象の核心。
		expect(max50).toBeGreaterThan(1.15);
	});

	it('N=10→25→50 で最大値は単調に(ごくわずかに)減りながら、いずれも1.15を大きく上回ったまま', () => {
		const max10 = maxOfPartialSum(10);
		const max25 = maxOfPartialSum(25);
		const max50 = maxOfPartialSum(50);
		expect(max10).toBeGreaterThan(max25);
		expect(max25).toBeGreaterThan(max50);
		expect(max50).toBeGreaterThan(1.15); // 1.179へ漸近するGibbs定数に近い水準を維持
	});
});
