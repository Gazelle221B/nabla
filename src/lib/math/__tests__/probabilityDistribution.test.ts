import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { expectedValue, distributionFromCounts, simulateDraws } from '../probabilityDistribution.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を全引数について検証するための共通ヘルパー
// (probability.test.ts / statistics.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

// くじの黄金値(手計算、再検算済み): 1等300円×1本・2等100円×2本・はずれ0円×3本、計6本。
// E[X] = (300×1 + 100×2 + 0×3) / 6 = 500/6 ≈ 83.333...
const LOTTERY_VALUES = [300, 100, 0];
const LOTTERY_COUNTS = [1, 2, 3];
const LOTTERY_EXPECTED = 500 / 6;

describe('expectedValue', () => {
	it('既知例(くじの黄金値): values=[300,100,0], probs=[1/6,2/6,3/6] → 500/6 ≈ 83.33', () => {
		expect(expectedValue(LOTTERY_VALUES, [1 / 6, 2 / 6, 3 / 6])).toBeCloseTo(LOTTERY_EXPECTED, 10);
	});

	it('既知例: 一様分布(values=[1,2,3], probs=[1/3,1/3,1/3]) → 平均と一致(2)', () => {
		expect(expectedValue([1, 2, 3], [1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(2, 10);
	});

	it('確定的な値(退化例、MATH_CONVENTIONS §4): probs=[1] → その値そのもの', () => {
		expect(expectedValue([42], [1])).toBe(42);
	});

	it('values と probs の長さ不一致 → RangeError', () => {
		expect(() => expectedValue([1, 2], [1])).toThrow(RangeError);
	});

	it('probs の総和が1でない → RangeError', () => {
		expect(() => expectedValue([1, 2], [0.5, 0.4])).toThrow(RangeError);
		expect(() => expectedValue([1, 2], [0.5, 0.6])).toThrow(RangeError);
	});

	it('負の確率 → RangeError', () => {
		expect(() => expectedValue([1, 2, 3], [-0.5, 0.5, 1])).toThrow(RangeError);
	});

	it('空配列 → RangeError', () => {
		expect(() => expectedValue([], [])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な値(values) → RangeError`, () => {
			expect(() => expectedValue([1, value], [0.5, 0.5])).toThrow(RangeError);
		});
		it(`${label} な確率(probs) → RangeError`, () => {
			expect(() => expectedValue([1, 2], [value, 1 - value])).toThrow(RangeError);
		});
	}
});

describe('distributionFromCounts', () => {
	it('既知例(くじの黄金値): counts=[1,2,3] → probs=[1/6,2/6,3/6]', () => {
		expect(distributionFromCounts(LOTTERY_VALUES, LOTTERY_COUNTS)).toEqual([1 / 6, 2 / 6, 3 / 6]);
	});

	it('総本数0(全て0) → RangeError', () => {
		expect(() => distributionFromCounts([1, 2, 3], [0, 0, 0])).toThrow(RangeError);
	});

	it('総本数0(空配列) → RangeError', () => {
		expect(() => distributionFromCounts([], [])).toThrow(RangeError);
	});

	it('負の本数 → RangeError', () => {
		expect(() => distributionFromCounts([1, 2, 3], [1, -1, 2])).toThrow(RangeError);
	});

	it('非整数の本数 → RangeError', () => {
		expect(() => distributionFromCounts([1, 2, 3], [1, 2.5, 3])).toThrow(RangeError);
	});

	it('values と counts の長さ不一致 → RangeError', () => {
		expect(() => distributionFromCounts([1, 2], [1])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な本数(counts) → RangeError`, () => {
			expect(() => distributionFromCounts([1, 2], [1, value])).toThrow(RangeError);
		});
	}
});

describe('simulateDraws', () => {
	it('n が0以下 → RangeError(標本平均が0/0で定義できない)', () => {
		expect(() => simulateDraws(1, 0, LOTTERY_VALUES, LOTTERY_COUNTS)).toThrow(RangeError);
		expect(() => simulateDraws(1, -1, LOTTERY_VALUES, LOTTERY_COUNTS)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => simulateDraws(1, 2.5, LOTTERY_VALUES, LOTTERY_COUNTS)).toThrow(RangeError);
	});

	it('総本数0 → RangeError', () => {
		expect(() => simulateDraws(1, 10, [1, 2, 3], [0, 0, 0])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な seed → RangeError`, () => {
			expect(() => simulateDraws(value, 10, LOTTERY_VALUES, LOTTERY_COUNTS)).toThrow(RangeError);
		});
	}

	it('同じシード・n・分布なら同じ結果(決定性)', () => {
		const a = simulateDraws(42, 500, LOTTERY_VALUES, LOTTERY_COUNTS);
		const b = simulateDraws(42, 500, LOTTERY_VALUES, LOTTERY_COUNTS);
		expect(a).toEqual(b);
	});

	it('異なるシードなら(固定シードペアで)異なる結果になる(統計的フレークを避けるため固定ペアで検証)', () => {
		const a = simulateDraws(1, 6000, LOTTERY_VALUES, LOTTERY_COUNTS);
		const b = simulateDraws(2, 6000, LOTTERY_VALUES, LOTTERY_COUNTS);
		expect(a.sampleMean).not.toBe(b.sampleMean);
	});

	it('度数の総和は必ず n と一致する(実測、seed=42, n=6000)', () => {
		const { frequencies } = simulateDraws(42, 6000, LOTTERY_VALUES, LOTTERY_COUNTS);
		expect(frequencies.reduce((a, b) => a + b, 0)).toBe(6000);
	});

	it(
		'固定シード(42)の黄金値: n=6000引くと標本平均は実測値82.1333...(度数[973,2009,3018])と厳密一致し、' +
			'E[X]=500/6≈83.33 の許容誤差 ±5 に収まる(決定的アサーション、統計的フレークにならない)',
		() => {
			const result = simulateDraws(42, 6000, LOTTERY_VALUES, LOTTERY_COUNTS);
			// 実測でキャプチャした黄金値(手元で計算・確認済み)との厳密一致——PRNG・重み付き
			// 抽選ロジック・集計のいずれかが変わればここで検出される。
			expect(result.frequencies).toEqual([973, 2009, 3018]);
			expect(result.sampleMean).toBeCloseTo(82.13333333333334, 10);
			expect(Math.abs(result.sampleMean - LOTTERY_EXPECTED)).toBeLessThanOrEqual(5);
		},
	);

	it('試行回数が少ない(n=10)ときは標本平均が E[X] から大きく外れうる(実測、seed=42)', () => {
		// n=10 では大数の法則が効く前であり、E[X]±5 のような狭い範囲には収まらないことがある
		// (実測でキャプチャした既知値との比較。フレークにならない固定シード)。
		const result = simulateDraws(42, 10, LOTTERY_VALUES, LOTTERY_COUNTS);
		expect(result.sampleMean).toBe(40);
		expect(Math.abs(result.sampleMean - LOTTERY_EXPECTED)).toBeGreaterThan(5);
	});
});

// fast-check 用の共通 arbitrary。values・weights/counts は同じ長さでなければ意味を持たないため、
// chain で長さを1つ決めてから両方の配列を同じ長さで生成する。
const distributionArb = fc.integer({ min: 1, max: 6 }).chain((len) =>
	fc.tuple(
		fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), { minLength: len, maxLength: len }),
		fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: len, maxLength: len }),
	),
);

const countsDistributionArb = fc.integer({ min: 1, max: 6 }).chain((len) =>
	fc.tuple(
		fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: len, maxLength: len }),
		fc
			.array(fc.integer({ min: 0, max: 50 }), { minLength: len, maxLength: len })
			.filter((counts) => counts.some((c) => c > 0)),
	),
);

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 期待値の線形性 E[aX+b] = a·E[X] + b ' +
			'(同じ確率分布に対し、値だけを線形変換して再計算し独立に突合する)',
		() => {
			fc.assert(
				fc.property(
					distributionArb,
					fc.double({ min: -100, max: 100, noNaN: true }),
					fc.double({ min: -100, max: 100, noNaN: true }),
					([values, weights], a, b) => {
						const totalWeight = weights.reduce((s, w) => s + w, 0);
						const probs = weights.map((w) => w / totalWeight);
						const ex = expectedValue(values, probs);
						const transformed = values.map((v) => a * v + b);
						const exTransformed = expectedValue(transformed, probs);
						const expected = a * ex + b;
						return approximatelyZero(exTransformed - expected, Math.max(1, Math.abs(expected)));
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: E[X] は常に min(values) 〜 max(values) の範囲内に収まる', () => {
		fc.assert(
			fc.property(distributionArb, ([values, weights]) => {
				const totalWeight = weights.reduce((s, w) => s + w, 0);
				const probs = weights.map((w) => w / totalWeight);
				const ex = expectedValue(values, probs);
				const lo = Math.min(...values);
				const hi = Math.max(...values);
				const scale = Math.max(1, Math.abs(hi - lo));
				return ex >= lo - 1e-9 * scale && ex <= hi + 1e-9 * scale;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property: distributionFromCounts 経由の E[X](Σx·(c/N))は、合計÷総本数(Σx·c)/N と一致する ' +
			'——2つの計算経路: 前者は distributionFromCounts→expectedValue(lib実装、割り算してから内積)、' +
			'後者はこのテストが直接持つ独立な式(先に積を合計してから最後に1回だけ割る)。' +
			'代数的には同値だが実装コードパスが分離しており、自己確認的な検証にならない(C-7)。',
		() => {
			fc.assert(
				fc.property(countsDistributionArb, ([values, counts]) => {
					const probs = distributionFromCounts(values, counts);
					const pathA = expectedValue(values, probs); // Σ x·(c/N)
					const total = counts.reduce((s, c) => s + c, 0);
					const pathB = counts.reduce((s, c, i) => s + values[i] * c, 0) / total; // (Σ x·c) / N
					return approximatelyZero(pathA - pathB, Math.max(1, Math.abs(pathB)));
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: simulateDraws の度数の総和は常に n と一致する(独立に合算、C-7)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: -1_000_000, max: 1_000_000 }),
				fc.integer({ min: 1, max: 2000 }),
				(seed, n) => {
					const { frequencies } = simulateDraws(seed, n, LOTTERY_VALUES, LOTTERY_COUNTS);
					return frequencies.reduce((a, b) => a + b, 0) === n;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 同じシードなら同じ結果(決定性)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: -1_000_000, max: 1_000_000 }),
				fc.integer({ min: 1, max: 2000 }),
				(seed, n) => {
					const a = simulateDraws(seed, n, LOTTERY_VALUES, LOTTERY_COUNTS);
					const b = simulateDraws(seed, n, LOTTERY_VALUES, LOTTERY_COUNTS);
					return a.sampleMean === b.sampleMean && a.frequencies.every((v, i) => v === b.frequencies[i]);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

// 独立レビュー GrokBuild の指摘で追加: simulateDraws 自身の入力検証(負本数・長さ不一致)は
// distributionFromCounts 側のテストだけでは担保されない(simulateDraws が内部で同じ検証を
// 通る保証を、公開 API の契約として直接固定する)。
describe('simulateDraws の入力検証 (追加)', () => {
	it('負の本数 → RangeError', () => {
		expect(() => simulateDraws(1, 10, [1, 2], [1, -1])).toThrow(RangeError);
	});

	it('values と counts の長さ不一致 → RangeError', () => {
		expect(() => simulateDraws(1, 10, [1, 2, 3], [1, 2])).toThrow(RangeError);
	});

	it('総本数0 → RangeError', () => {
		expect(() => simulateDraws(1, 10, [1, 2], [0, 0])).toThrow(RangeError);
	});
});
