import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
	exactSumDistribution,
	sumMeanVariance,
	meanVarianceFromDistribution,
	normalPdf,
	simulateDiceSums,
	sumFrequencies,
	sampleMeanOfSums,
	maxAbsDeviationFromNormal,
	makeRational,
	rationalToNumber,
	rationalEquals,
} from '../centralLimit.js';
import { createRng } from '../probability.js';

// 不変条件テストは fast-check(seed 42, AGENTS.md §3 C-7: 自己確認的な検証を合格条件と
// しない)。各プロパティは exactSumDistribution(厳密分布・独立オラクル)を基準に、
// 別経路(閉じた式 6^k、対称性、公式ベースの平均・分散、正規近似)と突き合わせる。

describe('exactSumDistribution(厳密分布、独立オラクル)', () => {
	it('場合の数の総数は6^kに一致する(exact、DPの合計 vs 閉じた式の2経路)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), (k) => {
				const dist = exactSumDistribution(k);
				const dpSum = dist.counts.reduce((a, b) => a + b, 0);
				expect(dist.total).toBe(6 ** k);
				expect(dpSum).toBe(6 ** k);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('対称性: count(s) = count(7k-s)(exact、サイコロの目の対称性 1↔6, 2↔5, 3↔4 に由来)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), (k) => {
				const dist = exactSumDistribution(k);
				for (let s = k; s <= 6 * k; s++) {
					const mirror = 7 * k - s;
					expect(dist.counts[s - k]).toBe(dist.counts[mirror - k]);
				}
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('和の範囲はちょうど [k, 6k](counts の長さは 5k+1)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), (k) => {
				const dist = exactSumDistribution(k);
				expect(dist.counts.length).toBe(5 * k + 1);
				expect(dist.counts.every((c) => c > 0)).toBe(true); // [k,6k] のどの和も到達可能
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('手計算による具体値の検証: k=1(サイコロ1個、一様)', () => {
		const dist = exactSumDistribution(1);
		expect(dist.counts).toEqual([1, 1, 1, 1, 1, 1]);
		expect(dist.total).toBe(6);
	});

	it('手計算による具体値の検証: k=2(和2〜12。場合の数を列挙して再検算)', () => {
		// 和2:(1,1)の1通り、和3:(1,2)(2,1)の2通り、…、和7:6通りが頂点、以降対称に減る。
		const dist = exactSumDistribution(2);
		expect(dist.counts).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
		expect(dist.total).toBe(36);
	});

	it('k が非有限・非整数・範囲外なら RangeError', () => {
		expect(() => exactSumDistribution(Number.NaN)).toThrow(RangeError);
		expect(() => exactSumDistribution(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => exactSumDistribution(1.5)).toThrow(RangeError);
		expect(() => exactSumDistribution(0)).toThrow(RangeError);
		expect(() => exactSumDistribution(13)).toThrow(RangeError);
	});
});

describe('平均・分散の2経路突合(公式 sumMeanVariance vs 厳密分布 meanVarianceFromDistribution)', () => {
	it('厳密有理数として完全一致する(丸め誤差なし、C-7: 別コードパスでの突合)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), (k) => {
				const formula = sumMeanVariance(k);
				const fromDist = meanVarianceFromDistribution(exactSumDistribution(k));
				expect(rationalEquals(formula.meanExact, fromDist.meanExact)).toBe(true);
				expect(rationalEquals(formula.varianceExact, fromDist.varianceExact)).toBe(true);
				// 丸めた number としても一致する(表示値の整合性)。
				expect(fromDist.mean).toBe(formula.mean);
				expect(fromDist.variance).toBeCloseTo(formula.variance, 9);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('手計算による具体値の検証: k=2 の期待値7・分散35/6(再検算済み)', () => {
		const mv = sumMeanVariance(2);
		expect(mv.mean).toBe(7);
		expect(mv.meanExact).toEqual({ numerator: 7, denominator: 1 });
		expect(rationalToNumber(mv.varianceExact)).toBeCloseTo(35 / 6, 9);
	});

	it('k が非有限・非整数・範囲外なら RangeError(sumMeanVariance)', () => {
		expect(() => sumMeanVariance(Number.NaN)).toThrow(RangeError);
		expect(() => sumMeanVariance(0)).toThrow(RangeError);
		expect(() => sumMeanVariance(13)).toThrow(RangeError);
	});

	it('dist.total が不正なら RangeError(meanVarianceFromDistribution の防御的検証)', () => {
		expect(() => meanVarianceFromDistribution({ k: 1, counts: [1], total: 0 })).toThrow(RangeError);
		expect(() => meanVarianceFromDistribution({ k: 1, counts: [1], total: -1 })).toThrow(RangeError);
	});
});

describe('makeRational / rationalEquals(厳密有理数演算の基盤)', () => {
	it('既約化する(符号は分母側に正規化)', () => {
		expect(makeRational(4, 8)).toEqual({ numerator: 1, denominator: 2 });
		expect(makeRational(-4, 8)).toEqual({ numerator: -1, denominator: 2 });
		expect(makeRational(4, -8)).toEqual({ numerator: -1, denominator: 2 });
		expect(makeRational(-4, -8)).toEqual({ numerator: 1, denominator: 2 });
	});

	it('分母0はRangeError', () => {
		expect(() => makeRational(1, 0)).toThrow(RangeError);
	});

	it('非有限・非整数はRangeError', () => {
		expect(() => makeRational(Number.NaN, 1)).toThrow(RangeError);
		expect(() => makeRational(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => makeRational(1.5, 2)).toThrow(RangeError);
	});

	it('rationalEquals は値として等しい既約分数を真と判定する', () => {
		expect(rationalEquals(makeRational(1, 2), makeRational(2, 4))).toBe(true);
		expect(rationalEquals(makeRational(1, 2), makeRational(1, 3))).toBe(false);
	});
});

describe('normalPdf(正規分布の密度)', () => {
	it('標準正規分布のピーク値は 1/√(2π) ≈ 0.3989(手計算・再検算済み)', () => {
		expect(normalPdf(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 9);
	});

	it('平均からの対称性: normalPdf(mu-d) と normalPdf(mu+d) が一致する', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -50, max: 50, noNaN: true }),
				fc.double({ min: 0.01, max: 100, noNaN: true }),
				fc.double({ min: 0.1, max: 20, noNaN: true }),
				(mu, d, sigma) => {
					expect(normalPdf(mu - d, mu, sigma)).toBeCloseTo(normalPdf(mu + d, mu, sigma), 9);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('sigma が0以下、または非有限入力はRangeError', () => {
		expect(() => normalPdf(0, 0, 0)).toThrow(RangeError);
		expect(() => normalPdf(0, 0, -1)).toThrow(RangeError);
		expect(() => normalPdf(Number.NaN, 0, 1)).toThrow(RangeError);
		expect(() => normalPdf(0, Number.NaN, 1)).toThrow(RangeError);
		expect(() => normalPdf(0, 0, Number.NaN)).toThrow(RangeError);
	});
});

describe('maxAbsDeviationFromNormal(正規近似との最大偏差、CLTの定量化)', () => {
	// golden値(2026-07-13、node/vitestで実測して固定。事前計算スクリプトの出力をそのまま採用)。
	// k=1(一様、平ら)が最も正規分布から遠く、k を増やすほど単調に近づいていく。
	const GOLDEN: Record<number, number> = {
		1: 0.1434456330057704,
		2: 0.08333333383333336,
		3: 0.06895506519820427,
		5: 0.05245482369948007,
		8: 0.041530970089461605,
		12: 0.03384441493876489,
	};

	it.each(Object.entries(GOLDEN))('k=%s の最大絶対偏差が golden 値と一致する(回帰検出)', (kStr, expected) => {
		const k = Number(kStr);
		expect(maxAbsDeviationFromNormal(k)).toBeCloseTo(expected, 6);
	});

	it('k を増やすと最大絶対偏差は単調に縮む(k=1,2,3,5,8,12、CLTの「近づく」の実測、証明ではない)', () => {
		const ks = [1, 2, 3, 5, 8, 12];
		const deviations = ks.map((k) => maxAbsDeviationFromNormal(k));
		for (let i = 1; i < deviations.length; i++) {
			expect(deviations[i]).toBeLessThan(deviations[i - 1]);
		}
	});

	it('k が非有限・非整数・範囲外なら RangeError', () => {
		expect(() => maxAbsDeviationFromNormal(Number.NaN)).toThrow(RangeError);
		expect(() => maxAbsDeviationFromNormal(0)).toThrow(RangeError);
		expect(() => maxAbsDeviationFromNormal(13)).toThrow(RangeError);
	});
});

describe('simulateDiceSums / sumFrequencies / sampleMeanOfSums(大数の法則のシミュレーション)', () => {
	it('n=0 は空配列を返す有効な退化例(probability.ts の simulateDice と同じ方針)', () => {
		const rng = createRng(1);
		expect(simulateDiceSums(rng, 3, 0)).toEqual([]);
	});

	it('各試行の和は必ず [k, 6k] の範囲に収まる', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 42 }), (k, seed) => {
				const rng = createRng(seed);
				const sums = simulateDiceSums(rng, k, 50);
				expect(sums.every((s) => s >= k && s <= 6 * k)).toBe(true);
				expect(sums.length).toBe(50);
			}),
			{ seed: 42, numRuns: 100 },
		);
	});

	it('sumFrequencies の度数の総和は試行回数nに一致する(実行時検証と同じ不変条件)', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 42 }), (k, seed) => {
				const rng = createRng(seed);
				const n = 200;
				const sums = simulateDiceSums(rng, k, n);
				const freqs = sumFrequencies(sums, k);
				expect(freqs.reduce((a, b) => a + b, 0)).toBe(n);
				expect(freqs.length).toBe(5 * k + 1);
			}),
			{ seed: 42, numRuns: 100 },
		);
	});

	// golden値(2026-07-13、node/vitestで実測して固定): 決定的シード(seed=42)・n=50,000での
	// 収束の様子を固定する(probability.ts の「固定シードの決定的golden」の前例)。
	it('固定シード(seed=42, k=2, n=50000)の標本平均・度数分布が golden 値と一致する(回帰検出)', () => {
		const rng = createRng(42);
		const sums = simulateDiceSums(rng, 2, 50000);
		const freqs = sumFrequencies(sums, 2);
		const mean = sampleMeanOfSums(sums);

		expect(freqs).toEqual([1364, 2661, 4072, 5588, 7099, 8390, 7043, 5458, 4137, 2795, 1393]);
		expect(mean).toBe(7.0112);
	});

	it('固定シード(seed=42, k=5, n=50000)でも標本平均が理論値17.5へ十分近い(収束の実測)', () => {
		const rng = createRng(42);
		const sums = simulateDiceSums(rng, 5, 50000);
		const mean = sampleMeanOfSums(sums);
		// golden値として固定(node/vitestで実測)。理論値17.5との差は小さい。
		expect(mean).toBe(17.49854);
		expect(Math.abs(mean - 17.5)).toBeLessThan(0.05);
	});

	it('rng が関数でない、k・nが非有限・非整数・範囲外ならRangeError', () => {
		const rng = createRng(1);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(() => simulateDiceSums(1 as any, 2, 10)).toThrow(RangeError);
		expect(() => simulateDiceSums(rng, 0, 10)).toThrow(RangeError);
		expect(() => simulateDiceSums(rng, 13, 10)).toThrow(RangeError);
		expect(() => simulateDiceSums(rng, 1.5, 10)).toThrow(RangeError);
		expect(() => simulateDiceSums(rng, 2, -1)).toThrow(RangeError);
		expect(() => simulateDiceSums(rng, 2, 1.5)).toThrow(RangeError);
	});

	it('sumFrequencies: 範囲外の和が混入していたらRangeError(数学モデルの不整合検出)', () => {
		expect(() => sumFrequencies([1, 2, 3], 2)).toThrow(RangeError); // k=2の範囲は[2,12]
		expect(() => sumFrequencies([100], 2)).toThrow(RangeError);
	});

	it('sampleMeanOfSums: 空配列はRangeError(0回試行の標本平均は未定義)', () => {
		expect(() => sampleMeanOfSums([])).toThrow(RangeError);
	});
});
