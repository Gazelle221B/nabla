import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { unsignedAngleBetweenVectors, unsignedAngleAtVertex } from '../geometry.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (dotProduct.test.ts / lawOfSinesCosines.test.ts と同じ方針: 一部の引数だけでなく
// 全引数を網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('unsignedAngleBetweenVectors', () => {
	it('golden: (1,0) と (0,1) のなす角は π/2 (直角)', () => {
		expect(approximatelyZero(unsignedAngleBetweenVectors([1, 0], [0, 1]) - Math.PI / 2, 1)).toBe(
			true,
		);
	});

	it('golden: (1,0) と (1,0) のなす角は0 (平行・同じ向き)', () => {
		expect(approximatelyZero(unsignedAngleBetweenVectors([1, 0], [1, 0]), 1)).toBe(true);
	});

	it('golden: (1,0) と (2,0) のなす角は0 (平行・スケール違い)', () => {
		expect(approximatelyZero(unsignedAngleBetweenVectors([1, 0], [2, 0]), 1)).toBe(true);
	});

	it('golden: (1,0) と (-1,0) のなす角はπ (反平行・正反対の向き)', () => {
		expect(
			approximatelyZero(unsignedAngleBetweenVectors([1, 0], [-1, 0]) - Math.PI, 1),
		).toBe(true);
	});

	it('v1 がゼロ長ベクトル → RangeError (向きを持たないため角度は未定義)', () => {
		expect(() => unsignedAngleBetweenVectors([0, 0], [1, 1])).toThrow(RangeError);
	});

	it('v2 がゼロ長ベクトル → RangeError', () => {
		expect(() => unsignedAngleBetweenVectors([1, 1], [0, 0])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な v1 の x成分 → RangeError`, () => {
			expect(() => unsignedAngleBetweenVectors([value, 0], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な v1 の y成分 → RangeError`, () => {
			expect(() => unsignedAngleBetweenVectors([0, value], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な v2 の x成分 → RangeError`, () => {
			expect(() => unsignedAngleBetweenVectors([1, 1], [value, 0])).toThrow(RangeError);
		});
		it(`${label} な v2 の y成分 → RangeError`, () => {
			expect(() => unsignedAngleBetweenVectors([1, 1], [0, value])).toThrow(RangeError);
		});
	}
});

describe('unsignedAngleAtVertex', () => {
	it('golden: 頂点(0,0)から見て(1,0)と(0,1)のなす角はπ/2 (直角)', () => {
		expect(
			approximatelyZero(unsignedAngleAtVertex([0, 0], [1, 0], [0, 1]) - Math.PI / 2, 1),
		).toBe(true);
	});

	it('golden: 頂点(1,1)から見て(2,1)と(0,1)のなす角はπ (正反対の向き)', () => {
		expect(
			approximatelyZero(unsignedAngleAtVertex([1, 1], [2, 1], [0, 1]) - Math.PI, 1),
		).toBe(true);
	});

	it('golden: 頂点(1,1)から見て(2,1)と(3,1)のなす角は0 (平行・同じ向き)', () => {
		expect(approximatelyZero(unsignedAngleAtVertex([1, 1], [2, 1], [3, 1]), 1)).toBe(true);
	});

	it('vertex === p1 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => unsignedAngleAtVertex([2, 3], [2, 3], [5, 5])).toThrow(RangeError);
	});

	it('vertex === p2 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => unsignedAngleAtVertex([2, 3], [5, 5], [2, 3])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な vertex[0] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([value, 0], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な vertex[1] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([0, value], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p1[0] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([0, 0], [value, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p1[1] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([0, 0], [1, value], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p2[0] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([0, 0], [1, 0], [value, 1])).toThrow(RangeError);
		});
		it(`${label} な p2[1] → RangeError`, () => {
			expect(() => unsignedAngleAtVertex([0, 0], [1, 0], [0, value])).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。ゼロベクトル(unsignedAngleBetweenVectors が RangeError を
// 投げる境界)を生成域から明示的に除外する (magnitude > 0.1 のフィルタ、C-7: 定義域を
// 恣意的に狭めて例外を隠すのではなく、退化条件そのものを生成域の前提として明示する)。
const componentArb = fc.double({ min: -50, max: 50, noNaN: true });
const nonZeroVecArb = fc
	.tuple(componentArb, componentArb)
	.filter(([x, y]) => Math.hypot(x, y) > 0.1) as fc.Arbitrary<readonly [number, number]>;
const pointArb = fc
	.tuple(componentArb, componentArb) as fc.Arbitrary<readonly [number, number]>;

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it('property: 対称性 unsignedAngleBetweenVectors(v1,v2) = unsignedAngleBetweenVectors(v2,v1)', () => {
		fc.assert(
			fc.property(nonZeroVecArb, nonZeroVecArb, (v1, v2) => {
				const forward = unsignedAngleBetweenVectors(v1, v2);
				const backward = unsignedAngleBetweenVectors(v2, v1);
				return approximatelyZero(forward - backward, Math.max(1, forward));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 値域は常に [0, π] (符号なし角の定義そのもの)', () => {
		fc.assert(
			fc.property(nonZeroVecArb, nonZeroVecArb, (v1, v2) => {
				const angle = unsignedAngleBetweenVectors(v1, v2);
				return angle >= 0 && angle <= Math.PI;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 回転不変性 — 両ベクトルを同じ角度だけ回転しても、なす角は変わらない', () => {
		fc.assert(
			fc.property(
				nonZeroVecArb,
				nonZeroVecArb,
				fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
				(v1, v2, theta) => {
					const rotate = (v: readonly [number, number]): readonly [number, number] => [
						v[0] * Math.cos(theta) - v[1] * Math.sin(theta),
						v[0] * Math.sin(theta) + v[1] * Math.cos(theta),
					];
					const before = unsignedAngleBetweenVectors(v1, v2);
					const after = unsignedAngleBetweenVectors(rotate(v1), rotate(v2));
					return approximatelyZero(before - after, Math.max(1, before));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 自分自身とのなす角は常に0 (同じベクトルは平行)', () => {
		fc.assert(
			fc.property(nonZeroVecArb, (v) => {
				return approximatelyZero(unsignedAngleBetweenVectors(v, v), 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 逆向きベクトルとのなす角は常にπ (反平行)', () => {
		fc.assert(
			fc.property(nonZeroVecArb, ([x, y]) => {
				const v: readonly [number, number] = [x, y];
				const opposite: readonly [number, number] = [-x, -y];
				return approximatelyZero(unsignedAngleBetweenVectors(v, opposite) - Math.PI, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property: unsignedAngleAtVertex(vertex,p1,p2) は unsignedAngleBetweenVectors(p1-vertex,p2-vertex) と' +
			'一致する(頂点+2点版が共有ベクトル版に正しく委譲していることの直接検証)',
		() => {
			fc.assert(
				fc.property(pointArb, nonZeroVecArb, nonZeroVecArb, (vertex, offset1, offset2) => {
					const p1: readonly [number, number] = [vertex[0] + offset1[0], vertex[1] + offset1[1]];
					const p2: readonly [number, number] = [vertex[0] + offset2[0], vertex[1] + offset2[1]];
					const viaVertex = unsignedAngleAtVertex(vertex, p1, p2);
					const viaVectors = unsignedAngleBetweenVectors(offset1, offset2);
					return approximatelyZero(viaVertex - viaVectors, Math.max(1, viaVertex));
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);
});
