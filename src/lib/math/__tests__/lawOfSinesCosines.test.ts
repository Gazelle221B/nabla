import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	sideLength,
	angleAtVertex,
	lawOfCosinesSide,
	type Point2,
} from '../lawOfSinesCosines.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(inscribedAngle.test.ts /
// similarity.test.ts と同じ方針)。
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (前回レビューの学び: 非有限テストは一部の引数だけでなく全引数を NaN/Infinity それぞれで網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('sideLength', () => {
	it('sideLength([0,0],[3,4]) = 5 (既知の3-4-5)', () => {
		expect(sideLength([0, 0], [3, 4])).toBeCloseTo(5, 10);
	});

	it('p と q が一致する場合は 0 (退化ではなく有効な距離)', () => {
		expect(sideLength([2, 3], [2, 3])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な p[0] → RangeError`, () => {
			expect(() => sideLength([value, 0], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な p[1] → RangeError`, () => {
			expect(() => sideLength([0, value], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な q[0] → RangeError`, () => {
			expect(() => sideLength([0, 0], [value, 1])).toThrow(RangeError);
		});
		it(`${label} な q[1] → RangeError`, () => {
			expect(() => sideLength([0, 0], [1, value])).toThrow(RangeError);
		});
	}
});

describe('angleAtVertex', () => {
	it('直角(垂直なベクトル) → π/2 (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 10);
	});

	it('一直線上・正反対の向き → π (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [-1, 0])).toBeCloseTo(Math.PI, 10);
	});

	it('同じ向き(一直線上・同方向) → 0 (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [2, 0])).toBeCloseTo(0, 10);
	});

	it('vertex === p1 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => angleAtVertex([2, 3], [2, 3], [5, 5])).toThrow(RangeError);
	});

	it('vertex === p2 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => angleAtVertex([2, 3], [5, 5], [2, 3])).toThrow(RangeError);
	});

	it('共線だが vertex が p1・p2 と異なる場合は例外にならない(角度は0またはπとして定義可能。面積は0に退化するが角度自体は退化しない)', () => {
		// vertex=[1,0] は p1=[0,0] と p2=[2,0] の間にある(反対向き) → π
		expect(angleAtVertex([1, 0], [0, 0], [2, 0])).toBeCloseTo(Math.PI, 10);
		// vertex=[3,0] から見て p1=[0,0], p2=[1,0] は同じ側・同じ向き → 0
		expect(angleAtVertex([3, 0], [0, 0], [1, 0])).toBeCloseTo(0, 10);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な vertex[0] → RangeError`, () => {
			expect(() => angleAtVertex([value, 0], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な vertex[1] → RangeError`, () => {
			expect(() => angleAtVertex([0, value], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p1[0] → RangeError`, () => {
			expect(() => angleAtVertex([0, 0], [value, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p1[1] → RangeError`, () => {
			expect(() => angleAtVertex([0, 0], [1, value], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な p2[0] → RangeError`, () => {
			expect(() => angleAtVertex([0, 0], [1, 0], [value, 1])).toThrow(RangeError);
		});
		it(`${label} な p2[1] → RangeError`, () => {
			expect(() => angleAtVertex([0, 0], [1, 0], [0, value])).toThrow(RangeError);
		});
	}
});

describe('lawOfCosinesSide', () => {
	it('既知値: 3-4-5 直角三角形(挟角90°) → a=5', () => {
		expect(lawOfCosinesSide(3, 4, Math.PI / 2)).toBeCloseTo(5, 10);
	});

	it('既知値: 正三角形(b=c=1, 挟角60°) → a=1', () => {
		expect(lawOfCosinesSide(1, 1, Math.PI / 3)).toBeCloseTo(1, 10);
	});

	it('退化(挟角=0、共線・同方向) → a=|b−c|', () => {
		expect(lawOfCosinesSide(3, 4, 0)).toBeCloseTo(1, 10);
		expect(lawOfCosinesSide(4, 4, 0)).toBeCloseTo(0, 10);
	});

	it('退化(挟角=π、共線・正反対方向) → a=b+c', () => {
		expect(lawOfCosinesSide(3, 4, Math.PI)).toBeCloseTo(7, 10);
	});

	it('b が 0 以下 → RangeError', () => {
		expect(() => lawOfCosinesSide(0, 4, Math.PI / 4)).toThrow(RangeError);
		expect(() => lawOfCosinesSide(-1, 4, Math.PI / 4)).toThrow(RangeError);
	});

	it('c が 0 以下 → RangeError', () => {
		expect(() => lawOfCosinesSide(3, 0, Math.PI / 4)).toThrow(RangeError);
		expect(() => lawOfCosinesSide(3, -2, Math.PI / 4)).toThrow(RangeError);
	});

	it('angleA が [0, π] の範囲外 → RangeError', () => {
		expect(() => lawOfCosinesSide(3, 4, -0.01)).toThrow(RangeError);
		expect(() => lawOfCosinesSide(3, 4, Math.PI + 0.01)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な b → RangeError`, () => {
			expect(() => lawOfCosinesSide(value, 4, Math.PI / 4)).toThrow(RangeError);
		});
		it(`${label} な c → RangeError`, () => {
			expect(() => lawOfCosinesSide(3, value, Math.PI / 4)).toThrow(RangeError);
		});
		it(`${label} な angleA → RangeError`, () => {
			expect(() => lawOfCosinesSide(3, 4, value)).toThrow(RangeError);
		});
	}
});

describe('既知例の三角形(3-4-5 直角三角形・正三角形)', () => {
	it('3-4-5 直角三角形: 辺・角・余弦定理がすべて整合する', () => {
		const A: Point2 = [0, 0];
		const B: Point2 = [4, 0];
		const C: Point2 = [0, 3];
		expect(sideLength(A, B)).toBeCloseTo(4, 10); // c (AB)
		expect(sideLength(B, C)).toBeCloseTo(5, 10); // a (BC, 斜辺)
		expect(sideLength(C, A)).toBeCloseTo(3, 10); // b (CA)
		expect(angleAtVertex(A, B, C)).toBeCloseTo(Math.PI / 2, 10); // 頂点Aが直角
		expect(lawOfCosinesSide(3, 4, Math.PI / 2)).toBeCloseTo(5, 10);
	});

	it('正三角形(全辺1・全内角60°): 辺・角・余弦定理がすべて整合する', () => {
		const A: Point2 = [0, 0];
		const B: Point2 = [1, 0];
		const C: Point2 = [0.5, Math.sqrt(3) / 2];
		expect(sideLength(A, B)).toBeCloseTo(1, 10);
		expect(sideLength(B, C)).toBeCloseTo(1, 10);
		expect(sideLength(C, A)).toBeCloseTo(1, 10);
		expect(angleAtVertex(A, B, C)).toBeCloseTo(Math.PI / 3, 10);
		expect(angleAtVertex(B, C, A)).toBeCloseTo(Math.PI / 3, 10);
		expect(angleAtVertex(C, A, B)).toBeCloseTo(Math.PI / 3, 10);
		expect(lawOfCosinesSide(1, 1, Math.PI / 3)).toBeCloseTo(1, 10);
	});
});

// ランダムな非退化三角形の生成(fast-check)。
//
// 設計判断(構造的に非退化を保証し、discard に頼らない): 3頂点を無作為に3点生成して
// 共線・微小面積をフィルタで除外する方式は、生成のほとんどが捨てられて
// fast-check の "too many discards" 警告になりやすい。代わりに、3つの内角
// (angleA, angleB, angleC。和=π)を「スティック分割法」で MIN_ANGLE(0.3 rad ≈ 17.2°)
// 以上を保証しつつ生成し、外接円半径 R と頂角 A の挟角を使って正弦定理
// (a=2R·sinA, b=2R·sinB, c=2R·sinC)から逆算した辺の長さで頂点 B, C を配置する。
// これにより「3つの内角がすべて 0.3 rad 以上」という非退化な三角形だけが
// discard なしに構造的に生成される(inscribedAngle.test.ts の nonZeroOffsetArb と
// 同じ「生成段階で保証する」考え方)。
const MIN_ANGLE = 0.3;
const REMAINING_BUDGET = Math.PI - 3 * MIN_ANGLE;

interface TriangleAngles {
	angleA: number;
	angleB: number;
	angleC: number;
}

const triangleAnglesArb: fc.Arbitrary<TriangleAngles> = fc
	.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }))
	.map(([f1, f2]): TriangleAngles => {
		const lo = Math.min(f1, f2);
		const hi = Math.max(f1, f2);
		const r1 = lo * REMAINING_BUDGET;
		const r2 = (hi - lo) * REMAINING_BUDGET;
		const r3 = REMAINING_BUDGET - r1 - r2;
		return {
			angleA: MIN_ANGLE + r1,
			angleB: MIN_ANGLE + r2,
			angleC: MIN_ANGLE + r3,
		};
	});

function trianglePointsArb(): fc.Arbitrary<[Point2, Point2, Point2]> {
	return fc
		.tuple(
			fc.tuple(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true })),
			fc.double({ min: 1, max: 20, noNaN: true }), // 外接円半径 R
			fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), // 基準方向(軸整列バイアスを避けるための回転)
			triangleAnglesArb,
		)
		.map(([origin, r, theta0, angles]): [Point2, Point2, Point2] => {
			const { angleA, angleB, angleC } = angles;
			// 正弦定理(外接円): 辺 = 2R・対角の sin。b = CA(角Bの対辺)、c = AB(角Cの対辺)。
			const b = 2 * r * Math.sin(angleB);
			const c = 2 * r * Math.sin(angleC);
			const ax = origin[0];
			const ay = origin[1];
			const A: Point2 = [ax, ay];
			const B: Point2 = [ax + c * Math.cos(theta0), ay + c * Math.sin(theta0)];
			const C: Point2 = [ax + b * Math.cos(theta0 + angleA), ay + b * Math.sin(theta0 + angleA)];
			return [A, B, C];
		});
}

describe('正弦定理・余弦定理の不変条件(sideLength・angleAtVertex を独立の計算経路として使う)', () => {
	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('正弦定理: a/sinA ≈ b/sinB ≈ c/sinC(辺長・対角をそれぞれ独立に計算)', () => {
			fc.assert(
				fc.property(trianglePointsArb(), ([A, B, C]) => {
					// 辺の長さと角度は、それぞれ独立した計算(距離の公式・atan2 の角度公式)で
					// 求める。三角形を構成した際に使った angleA/b/c の値をそのまま使い回さない
					// (C-7: 入力エコーの自己確認テストにならないようにする)。
					const a = sideLength(B, C);
					const b = sideLength(C, A);
					const c = sideLength(A, B);
					const angleA = angleAtVertex(A, B, C);
					const angleB = angleAtVertex(B, C, A);
					const angleC = angleAtVertex(C, A, B);

					const ratioA = a / Math.sin(angleA);
					const ratioB = b / Math.sin(angleB);
					const ratioC = c / Math.sin(angleC);
					const scale = Math.max(1, Math.abs(ratioA), Math.abs(ratioB), Math.abs(ratioC));

					return (
						approximatelyZero(ratioA - ratioB, scale) && approximatelyZero(ratioB - ratioC, scale)
					);
				}),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('余弦定理: lawOfCosinesSide(b,c,angleA) は実頂点間距離 sideLength(B,C) と一致する(独立2経路)', () => {
			fc.assert(
				fc.property(trianglePointsArb(), ([A, B, C]) => {
					// 経路1: 座標から距離の公式(sideLength・angleAtVertex)で b, c, angleA を求める。
					const b = sideLength(C, A);
					const c = sideLength(A, B);
					const angleA = angleAtVertex(A, B, C);
					// 経路2: 余弦定理の公式(lawOfCosinesSide)で対辺 a を求める。
					const computedA = lawOfCosinesSide(b, c, angleA);
					// 経路1(座標)で対辺 a を直接測った値と突き合わせる。
					const actualA = sideLength(B, C);
					return approximatelyZero(computedA - actualA, Math.max(1, actualA));
				}),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('三角形の内角の和 ≈ π', () => {
			fc.assert(
				fc.property(trianglePointsArb(), ([A, B, C]) => {
					const angleA = angleAtVertex(A, B, C);
					const angleB = angleAtVertex(B, C, A);
					const angleC = angleAtVertex(C, A, B);
					return approximatelyZero(angleA + angleB + angleC - Math.PI, Math.PI);
				}),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});
