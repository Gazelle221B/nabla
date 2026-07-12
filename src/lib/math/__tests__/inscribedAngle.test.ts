import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { pointOnCircle, angleAtVertex, type Point2 } from '../inscribedAngle.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(similarity.test.ts / trigonometry.test.ts
// と同じ方針)。
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー。
// (前回レビューの学び: 非有限テストは一部の引数だけでなく全引数を NaN/Infinity それぞれで網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const centerArb: fc.Arbitrary<Point2> = fc
	.tuple(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true }))
	.map(([x, y]): Point2 => [x, y]);
const radiusArb = fc.double({ min: 0.5, max: 50, noNaN: true });
const angleArb = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true });

describe('pointOnCircle', () => {
	it('pointOnCircle([0,0], 1, 0) = [1,0] (既知値)', () => {
		const [x, y] = pointOnCircle([0, 0], 1, 0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
	});

	it('pointOnCircle([0,0], 1, π/2) ≈ [0,1] (既知値)', () => {
		const [x, y] = pointOnCircle([0, 0], 1, Math.PI / 2);
		expect(x).toBeCloseTo(0, 10);
		expect(y).toBeCloseTo(1, 10);
	});

	it('pointOnCircle([2,3], 5, 0) = [7,3] (中心が原点でない既知値)', () => {
		const [x, y] = pointOnCircle([2, 3], 5, 0);
		expect(x).toBeCloseTo(7, 10);
		expect(y).toBeCloseTo(3, 10);
	});

	it('radius=0 → RangeError (円ではなく点に退化するため、円周角が定義できない)', () => {
		expect(() => pointOnCircle([0, 0], 0, 0)).toThrow(RangeError);
	});

	it('radius が負 → RangeError', () => {
		expect(() => pointOnCircle([0, 0], -3, 0)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な center[0] → RangeError`, () => {
			expect(() => pointOnCircle([value, 0], 1, 0)).toThrow(RangeError);
		});
		it(`${label} な center[1] → RangeError`, () => {
			expect(() => pointOnCircle([0, value], 1, 0)).toThrow(RangeError);
		});
		it(`${label} な radius → RangeError`, () => {
			expect(() => pointOnCircle([0, 0], value, 0)).toThrow(RangeError);
		});
		it(`${label} な theta → RangeError`, () => {
			expect(() => pointOnCircle([0, 0], 1, value)).toThrow(RangeError);
		});
	}

	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('property: pointOnCircle(center,r,theta) は常に center から距離 r (計算経路: cos/sin で座標を求め、独立に Math.hypot で距離を測って突き合わせる)', () => {
			fc.assert(
				fc.property(centerArb, radiusArb, angleArb, (center, r, theta) => {
					const [x, y] = pointOnCircle(center, r, theta);
					const dist = Math.hypot(x - center[0], y - center[1]);
					return approximatelyZero(dist - r, Math.max(1, r));
				}),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('property: theta と theta+2π で同じ点になる (周期性)', () => {
			fc.assert(
				fc.property(centerArb, radiusArb, fc.double({ min: -50, max: 50, noNaN: true }), (center, r, theta) => {
					const before = pointOnCircle(center, r, theta);
					const after = pointOnCircle(center, r, theta + 2 * Math.PI);
					const scale = Math.max(1, r);
					return (
						approximatelyZero(after[0] - before[0], scale) &&
						approximatelyZero(after[1] - before[1], scale)
					);
				}),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});

describe('angleAtVertex', () => {
	it('直角 (垂直なベクトル) → π/2 (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 10);
	});

	it('一直線上・正反対の向き → π (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [-1, 0])).toBeCloseTo(Math.PI, 10);
	});

	it('同じ向き(一直線上・同方向) → 0 (既知値)', () => {
		expect(angleAtVertex([0, 0], [1, 0], [2, 0])).toBeCloseTo(0, 10);
	});

	it('vertex が中心でない一般の位置でも成り立つ (既知値: vertex=[1,1], p1=[1,2], p2=[2,1] → π/2)', () => {
		expect(angleAtVertex([1, 1], [1, 2], [2, 1])).toBeCloseTo(Math.PI / 2, 10);
	});

	it('vertex === p1 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => angleAtVertex([2, 3], [2, 3], [5, 5])).toThrow(RangeError);
	});

	it('vertex === p2 (ゼロ長ベクトル) → RangeError', () => {
		expect(() => angleAtVertex([2, 3], [5, 5], [2, 3])).toThrow(RangeError);
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

	// vertex から p1・p2 へ向かうベクトルがゼロにならないことを保証するため、極座標
	// (半径 0.01〜100, 任意の向き) でオフセットを生成して加算する(退化ケースを構造的に排除する。
	// fc.pre によるフィルタと違い、生成段階で保証できるため discard によるテストの弱まりがない)。
	function nonZeroOffsetArb(): fc.Arbitrary<Point2> {
		return fc
			.tuple(fc.double({ min: 0.01, max: 100, noNaN: true }), angleArb)
			.map(([r, a]): Point2 => [r * Math.cos(a), r * Math.sin(a)]);
	}

	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('property: 角度は常に [0, π] の範囲 (非退化な vertex/p1/p2 で、計算経路: atan2(|cross|,dot) を実際に評価する)', () => {
			fc.assert(
				fc.property(centerArb, nonZeroOffsetArb(), nonZeroOffsetArb(), (vertex, off1, off2) => {
					const p1: Point2 = [vertex[0] + off1[0], vertex[1] + off1[1]];
					const p2: Point2 = [vertex[0] + off2[0], vertex[1] + off2[1]];
					const angle = angleAtVertex(vertex, p1, p2);
					return Number.isFinite(angle) && angle >= 0 && angle <= Math.PI + 1e-9;
				}),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('property: angleAtVertex(v,p1,p2) ≈ angleAtVertex(v,p2,p1) (p1/p2 の対称性、それぞれ独立に atan2 を評価して突き合わせる)', () => {
			fc.assert(
				fc.property(centerArb, nonZeroOffsetArb(), nonZeroOffsetArb(), (vertex, off1, off2) => {
					const p1: Point2 = [vertex[0] + off1[0], vertex[1] + off1[1]];
					const p2: Point2 = [vertex[0] + off2[0], vertex[1] + off2[1]];
					const a = angleAtVertex(vertex, p1, p2);
					const b = angleAtVertex(vertex, p2, p1);
					return approximatelyZero(a - b, Math.max(1, a, b));
				}),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});

describe('円周角の定理の不変条件 (angleAtVertex を中心角にも円周角にも用いる)', () => {
	it('既知例: タレスの定理(直径 AB・円周上の点 P=(0,5))で ∠APB=π/2 (中心(0,0)・半径5)', () => {
		const A: Point2 = [5, 0];
		const B: Point2 = [-5, 0]; // 直径の反対側
		const P: Point2 = [0, 5]; // 円周上の点(円周上であることは 0²+5²=5² から手計算で確認できる)
		expect(angleAtVertex(P, A, B)).toBeCloseTo(Math.PI / 2, 10);
	});

	it('既知例: タレスの定理は下半円の点でも成り立つ (P=(0,-5))', () => {
		const A: Point2 = [5, 0];
		const B: Point2 = [-5, 0];
		const P: Point2 = [0, -5];
		expect(angleAtVertex(P, A, B)).toBeCloseTo(Math.PI / 2, 10);
	});

	it('既知例: 単位円に内接する正三角形(0°,120°,240°)の頂点角は60°(=π/3)、中心角は120°(=2π/3)', () => {
		// A=0°=(1,0), B=120°=(-1/2, √3/2), C=240°=(-1/2, -√3/2) (手計算可能な既知の三角比)。
		const A: Point2 = [1, 0];
		const B: Point2 = [-0.5, Math.sqrt(3) / 2];
		const C: Point2 = [-0.5, -Math.sqrt(3) / 2];
		const center: Point2 = [0, 0];

		// 頂点 C から見た ∠ACB (弧 AB に対する円周角、C は弧 AB に対する優弧側)。
		expect(angleAtVertex(C, A, B)).toBeCloseTo(Math.PI / 3, 10);
		// 中心 O から見た ∠AOB (弧 AB に対する中心角)。
		expect(angleAtVertex(center, A, B)).toBeCloseTo((2 * Math.PI) / 3, 10);
		// 円周角 = 中心角 / 2 の直接確認。
		expect(angleAtVertex(C, A, B)).toBeCloseTo(angleAtVertex(center, A, B) / 2, 10);
	});

	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('タレスの定理: 直径に対する円周角は常に π/2 (B=2·center−A、P は A,B 以外の円周上の任意の点)', () => {
			fc.assert(
				fc.property(
					centerArb,
					radiusArb,
					angleArb,
					// P の角度は A(alphaA)・B(alphaA+π) からある程度離す(ゼロ長ベクトルではなく、
					// 数値的な余裕を持たせるための実務上のマージン)。
					fc.double({ min: 0.1, max: 2 * Math.PI - 0.1, noNaN: true }).filter((d) => Math.abs(d - Math.PI) > 0.1),
					(center, r, alphaA, delta) => {
						const A = pointOnCircle(center, r, alphaA);
						const B: Point2 = [2 * center[0] - A[0], 2 * center[1] - A[1]];
						const P = pointOnCircle(center, r, alphaA + delta);
						const angle = angleAtVertex(P, A, B);
						return approximatelyZero(angle - Math.PI / 2, 1);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('円周角 = 中心角 / 2 (P を優弧上に取る。角度は独立に angleAtVertex を計算経路として通す)', () => {
			fc.assert(
				fc.property(
					centerArb,
					radiusArb,
					angleArb,
					// 弧 AB (A→B の短い側)の中心角。0/π 付近の退化的な狭さを避けるマージンを取る。
					fc.double({ min: 0.2, max: Math.PI - 0.2, noNaN: true }),
					// 優弧(B から A へ、長い側を回る弧)上の位置 t∈(0,1)。端(A,B そのもの)から
					// 十分離すことで数値的な余裕を持たせる。
					fc.double({ min: 0.05, max: 0.95, noNaN: true }),
					(center, r, alphaA, gap, t) => {
						const alphaB = alphaA + gap;
						const A = pointOnCircle(center, r, alphaA);
						const B = pointOnCircle(center, r, alphaB);
						const alphaP = alphaB + t * (2 * Math.PI - gap);
						const P = pointOnCircle(center, r, alphaP);

						const central = angleAtVertex(center, A, B);
						const inscribed = angleAtVertex(P, A, B);
						return approximatelyZero(inscribed - central / 2, 1);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('等しい弧に対する円周角は等しい: 優弧上の異なる2点 P,Q で angleAtVertex(P,A,B) ≈ angleAtVertex(Q,A,B)', () => {
			fc.assert(
				fc.property(
					centerArb,
					radiusArb,
					angleArb,
					fc.double({ min: 0.2, max: Math.PI - 0.2, noNaN: true }),
					// P,Q は優弧上の2つの互いに離れた区間 (t1∈[0.05,0.45], t2∈[0.55,0.95]) から
					// それぞれ取る。区間を分けることで「異なる2点」であることを生成段階で保証する。
					fc.double({ min: 0.05, max: 0.45, noNaN: true }),
					fc.double({ min: 0.55, max: 0.95, noNaN: true }),
					(center, r, alphaA, gap, t1, t2) => {
						const alphaB = alphaA + gap;
						const A = pointOnCircle(center, r, alphaA);
						const B = pointOnCircle(center, r, alphaB);
						const major = 2 * Math.PI - gap;
						const P = pointOnCircle(center, r, alphaB + t1 * major);
						const Q = pointOnCircle(center, r, alphaB + t2 * major);

						const angleP = angleAtVertex(P, A, B);
						const angleQ = angleAtVertex(Q, A, B);
						return approximatelyZero(angleP - angleQ, 1);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});
