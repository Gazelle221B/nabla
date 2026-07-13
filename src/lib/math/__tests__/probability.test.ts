import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createRng, simulateDice, relativeFrequencies, theoreticalProbability } from '../probability.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を全引数について検証するための共通ヘルパー
// (sequences.test.ts / riemannSum.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('createRng', () => {
	it('[0,1) の範囲の値を返す(1000回サンプリング)', () => {
		const rng = createRng(1);
		for (let i = 0; i < 1000; i++) {
			const value = rng();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('非有限な seed → RangeError', () => {
		for (const [, value] of NON_FINITE_VALUES) {
			expect(() => createRng(value)).toThrow(RangeError);
		}
	});

	it('非整数な seed → RangeError', () => {
		expect(() => createRng(1.5)).toThrow(RangeError);
	});
});

describe('simulateDice', () => {
	it('n=0 は全ての目の度数が0になる退化例(例外なし、MATH_CONVENTIONS §4)', () => {
		expect(simulateDice(1, 0)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('n が負 → RangeError', () => {
		expect(() => simulateDice(1, -1)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => simulateDice(1, 2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な seed → RangeError`, () => {
			expect(() => simulateDice(value, 10)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => simulateDice(1, value)).toThrow(RangeError);
		});
	}

	it('固定シードの黄金値 (seed=42/43): 実測でキャプチャした既知の度数配列と厳密一致する', () => {
		// GrokBuild 指摘で強化: 「first===second」だけでは決定性しか検証できず、実装が
		// まるごと変わっても(同じように決定的なら)通ってしまう。実測でキャプチャした
		// 黄金値と厳密一致させることで、mulberry32・出目写像・集計のあらゆる回帰を捕捉する
		// (このアルゴリズムの出力に対する独立オラクル=過去に検証済みの実測スナップショット)。
		expect(simulateDice(42, 10)).toEqual([0, 2, 2, 3, 1, 2]);
		expect(simulateDice(42, 100)).toEqual([16, 21, 13, 18, 15, 17]);
		expect(simulateDice(43, 10)).toEqual([4, 2, 0, 1, 1, 2]);
	});
});

describe('relativeFrequencies', () => {
	it('既知例: 度数 [1,2,3] → 相対度数 [1/6, 2/6, 3/6]', () => {
		expect(relativeFrequencies([1, 2, 3])).toEqual([1 / 6, 2 / 6, 3 / 6]);
	});

	it('合計0(全て0)は RangeError', () => {
		expect(() => relativeFrequencies([0, 0, 0, 0, 0, 0])).toThrow(RangeError);
	});

	it('合計0(空配列)は RangeError', () => {
		expect(() => relativeFrequencies([])).toThrow(RangeError);
	});

	it('負の度数は RangeError', () => {
		expect(() => relativeFrequencies([1, -1, 2])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な度数 → RangeError`, () => {
			expect(() => relativeFrequencies([1, value, 2])).toThrow(RangeError);
		});
	}

	it('非整数の度数 → RangeError', () => {
		expect(() => relativeFrequencies([1, 2.5, 3])).toThrow(RangeError);
	});
});

describe('theoreticalProbability', () => {
	it('既知例: サイコロの偶数の目 (2,4,6の3通り/6通り) = 1/2', () => {
		expect(theoreticalProbability(3, 6)).toBe(0.5);
	});

	it('favorable=0 → 0 (どの場合も条件に合わない)', () => {
		expect(theoreticalProbability(0, 6)).toBe(0);
	});

	it('favorable=total → 1 (必ず条件に合う)', () => {
		expect(theoreticalProbability(6, 6)).toBe(1);
	});

	it('total=0 → RangeError', () => {
		expect(() => theoreticalProbability(1, 0)).toThrow(RangeError);
	});

	it('total が負 → RangeError', () => {
		expect(() => theoreticalProbability(1, -3)).toThrow(RangeError);
	});

	it('favorable が負 → RangeError', () => {
		expect(() => theoreticalProbability(-1, 6)).toThrow(RangeError);
	});

	it('favorable > total → RangeError', () => {
		expect(() => theoreticalProbability(7, 6)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な favorable → RangeError`, () => {
			expect(() => theoreticalProbability(value, 6)).toThrow(RangeError);
		});
		it(`${label} な total → RangeError`, () => {
			expect(() => theoreticalProbability(1, value)).toThrow(RangeError);
		});
	}

	it('非整数の favorable/total → RangeError', () => {
		expect(() => theoreticalProbability(1.5, 6)).toThrow(RangeError);
		expect(() => theoreticalProbability(1, 6.5)).toThrow(RangeError);
	});
});

// fast-check 用の共通レンジ。
// C-7 の位置づけ(GrokBuild 指摘で明確化): 下の「再構成」テストは createRng を経由して
// テスト側でも同じアルゴリズム(Math.floor(rng()*6))を組み直すため、写像規則そのものの
// 独立オラクルにはならない(集計・境界の食い違いは捕捉できるが、写像規則の同型誤りは
// 素通りする)。**写像規則を含む全体の独立オラクルは、上の「固定シードの黄金値」テスト**
// (実測でキャプチャした既知出力との厳密一致)が担う。property 群は総和=n・範囲・決定性
// という定義そのものの不変条件を検証する役割分担。
const seedArb = fc.integer({ min: -1_000_000, max: 1_000_000 });
const nArb = fc.integer({ min: 0, max: 500 });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 度数の総和 = 試行回数 n (simulateDice の出力を独立に合算する、C-7)',
		() => {
			fc.assert(
				fc.property(seedArb, nArb, (seed, n) => {
					const counts = simulateDice(seed, n);
					const sum = counts.reduce((a, b) => a + b, 0);
					return sum === n;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property: createRng を直接使って独立に再構成した出目は常に1〜6の範囲に収まり、' +
			'simulateDice の度数と一致する(実装の分離を根拠にした2経路突合)',
		() => {
			fc.assert(
				fc.property(seedArb, nArb, (seed, n) => {
					const rng = createRng(seed);
					const independentCounts = [0, 0, 0, 0, 0, 0];
					let allInRange = true;
					for (let i = 0; i < n; i++) {
						const roll = Math.floor(rng() * 6) + 1; // 1〜6
						if (roll < 1 || roll > 6) allInRange = false;
						independentCounts[roll - 1] += 1;
					}
					const modelCounts = simulateDice(seed, n);
					return allInRange && independentCounts.every((c, i) => c === modelCounts[i]);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 同じシードなら同じ結果(決定性)', () => {
		fc.assert(
			fc.property(seedArb, fc.integer({ min: 1, max: 500 }), (seed, n) => {
				const a = simulateDice(seed, n);
				const b = simulateDice(seed, n);
				return a.every((v, i) => v === b[i]);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('異なるシードなら(ほぼ確実に)異なる結果になる(固定シードペアでの回帰確認、n=200)', () => {
		// 「ほぼ確実に」を fast-check の任意入力で主張すると偶然の一致で稀にフレークしうるため、
		// 具体的な固定シードペア(既に手元で差異を確認済み)を使う決定的な回帰テストにする
		// (C-7: 統計的フレークを許さない)。
		const a = simulateDice(1, 200);
		const b = simulateDice(2, 200);
		expect(a).not.toEqual(b);
	});

	it('property: 相対度数の総和 ≈ 1、各相対度数は [0,1] の範囲(度数→確率の定義に立ち返る)', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 10 }).filter(
					(counts) => counts.some((c) => c > 0),
				),
				(counts) => {
					const rel = relativeFrequencies(counts);
					const sum = rel.reduce((a, b) => a + b, 0);
					const sumOk = approximatelyZero(sum - 1, 1);
					const rangeOk = rel.every((v) => v >= 0 && v <= 1);
					return sumOk && rangeOk;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'固定シード(42)で n=6000 振ると、各目の相対度数が理論確率 1/6 の ±0.05 に収まる ' +
			'(固定シードなので決定的な既知値アサーション、統計的フレークにならない)',
		() => {
			const counts = simulateDice(42, 6000);
			const rel = relativeFrequencies(counts);
			const theoretical = theoreticalProbability(1, 6);
			for (const value of rel) {
				expect(Math.abs(value - theoretical)).toBeLessThanOrEqual(0.05);
			}
		},
	);
});
