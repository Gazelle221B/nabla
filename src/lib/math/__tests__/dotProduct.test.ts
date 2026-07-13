import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { dot, magnitude, angleBetween } from '../dotProduct.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (sequences.test.ts / lawOfSinesCosines.test.ts と同じ方針: 一部の引数だけでなく
// 全引数を網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('dot', () => {
	it('既知例: (1,0)・(0,1) = 0 (直交する基本ベクトル)', () => {
		expect(dot([1, 0], [0, 1])).toBe(0);
	});

	it('既知例: (3,4)・(3,4) = 25 (自分自身との内積 = |v|²)', () => {
		expect(dot([3, 4], [3, 4])).toBe(25);
	});

	it('ゼロベクトルとの内積は常に0(退化例、例外なし)', () => {
		expect(dot([0, 0], [5, -3])).toBe(0);
		expect(dot([5, -3], [0, 0])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a の x成分 → RangeError`, () => {
			expect(() => dot([value, 0], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な a の y成分 → RangeError`, () => {
			expect(() => dot([0, value], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な b の x成分 → RangeError`, () => {
			expect(() => dot([1, 1], [value, 0])).toThrow(RangeError);
		});
		it(`${label} な b の y成分 → RangeError`, () => {
			expect(() => dot([1, 1], [0, value])).toThrow(RangeError);
		});
	}
});

describe('magnitude', () => {
	it('既知例: |(3,4)| = 5 (3-4-5三平方数)', () => {
		expect(magnitude([3, 4])).toBe(5);
	});

	it('ゼロベクトルの大きさは0(退化例、例外なし)', () => {
		expect(magnitude([0, 0])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な x成分 → RangeError`, () => {
			expect(() => magnitude([value, 0])).toThrow(RangeError);
		});
		it(`${label} な y成分 → RangeError`, () => {
			expect(() => magnitude([0, value])).toThrow(RangeError);
		});
	}
});

describe('angleBetween', () => {
	it('既知例: (1,0) と (0,1) のなす角は π/2 (直角)', () => {
		expect(approximatelyZero(angleBetween([1, 0], [0, 1]) - Math.PI / 2, 1)).toBe(true);
	});

	it('既知例: (1,0) と (1,0) のなす角は0 (同じ向き)', () => {
		expect(approximatelyZero(angleBetween([1, 0], [1, 0]), 1)).toBe(true);
	});

	it('既知例: (1,0) と (-1,0) のなす角はπ (正反対の向き)', () => {
		expect(approximatelyZero(angleBetween([1, 0], [-1, 0]) - Math.PI, 1)).toBe(true);
	});

	it('a がゼロベクトル → RangeError (向きを持たないため角度は未定義)', () => {
		expect(() => angleBetween([0, 0], [1, 1])).toThrow(RangeError);
	});

	it('b がゼロベクトル → RangeError', () => {
		expect(() => angleBetween([1, 1], [0, 0])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a の x成分 → RangeError`, () => {
			expect(() => angleBetween([value, 0], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な a の y成分 → RangeError`, () => {
			expect(() => angleBetween([0, value], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な b の x成分 → RangeError`, () => {
			expect(() => angleBetween([1, 1], [value, 0])).toThrow(RangeError);
		});
		it(`${label} な b の y成分 → RangeError`, () => {
			expect(() => angleBetween([1, 1], [0, value])).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。ゼロベクトル(angleBetween が RangeError を投げる境界)を
// 生成域から明示的に除外する (magnitude > 0.1 のフィルタ、C-7: 定義域を恣意的に
// 狭めて例外を隠すのではなく、退化条件そのものを生成域の前提として明示する)。
const componentArb = fc.double({ min: -50, max: 50, noNaN: true });
const nonZeroVecArb = fc
	.tuple(componentArb, componentArb)
	.filter(([x, y]) => Math.hypot(x, y) > 0.1) as fc.Arbitrary<readonly [number, number]>;

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 成分公式 ↔ 幾何公式(|a||b|cosθ)の独立2経路突合 — dot(a,b) と ' +
			'magnitude(a)・magnitude(b)・Math.cos(angleBetween(a,b)) は一致する ' +
			'(C-7: dot は成分の積和、angleBetween は atan2(|外積|,内積) 経由で cos を' +
			'直接エコーしない別経路。検証には Math.cos(angleBetween(...)) を使い dot の成分計算と突合する)',
		() => {
			fc.assert(
				fc.property(nonZeroVecArb, nonZeroVecArb, (a, b) => {
					const componentDot = dot(a, b);
					const geometricDot = magnitude(a) * magnitude(b) * Math.cos(angleBetween(a, b));
					const scale = Math.max(1, Math.abs(componentDot), Math.abs(geometricDot));
					return approximatelyZero(componentDot - geometricDot, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 対称性 dot(a,b) = dot(b,a)', () => {
		fc.assert(
			fc.property(nonZeroVecArb, nonZeroVecArb, (a, b) => {
				return dot(a, b) === dot(b, a);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 線形性 dot(ka,b) = k・dot(a,b)', () => {
		fc.assert(
			fc.property(
				nonZeroVecArb,
				nonZeroVecArb,
				fc.double({ min: -10, max: 10, noNaN: true }),
				(a, b, k) => {
					const ka: readonly [number, number] = [k * a[0], k * a[1]];
					const scaled = dot(ka, b);
					const expected = k * dot(a, b);
					const scale = Math.max(1, Math.abs(scaled), Math.abs(expected));
					return approximatelyZero(scaled - expected, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property: 直交ベクトル対(構成的に生成: (x,y) と (−y,x)は常に垂直)の内積は≈0 ' +
			'(この単元の核心: 直角のとき内積がちょうど0になる)',
		() => {
			fc.assert(
				fc.property(nonZeroVecArb, ([x, y]) => {
					const a: readonly [number, number] = [x, y];
					const perpendicular: readonly [number, number] = [-y, x];
					const scale = Math.max(1, magnitude(a) * magnitude(perpendicular));
					return approximatelyZero(dot(a, perpendicular), scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: コーシー・シュワルツの不等式 |dot(a,b)| ≤ |a||b|', () => {
		fc.assert(
			fc.property(nonZeroVecArb, nonZeroVecArb, (a, b) => {
				const lhs = Math.abs(dot(a, b));
				const rhs = magnitude(a) * magnitude(b);
				// 等号成立(平行/反平行)近傍での浮動小数点丸めにより lhs がごくわずかに rhs を
				// 上回りうるため、EPSILON 相当の相対余裕を持たせる(不等式の向き自体は
				// 厳密に成り立つ数学的事実であり、これは実装バグの隠蔽ではなく丸め誤差の許容)。
				return lhs <= rhs * (1 + 1e-9) + 1e-9;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
