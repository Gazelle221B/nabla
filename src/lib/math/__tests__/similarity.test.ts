import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scaleFrom, distance, triangleArea, type Point2 } from '../similarity.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(linearFunction.test.ts /
// quadraticFunction.test.ts と同じ方針、独立レビュー GrokBuild T1 の学び)。
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー。
// (前回レビューの学び: 非有限テストは一部の引数だけでなく全引数を NaN/Infinity それぞれで網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

// Point2 を生成する fast-check ヘルパー。8引数を4引数(center/a/b/k 等)に圧縮して
// 可読性を上げるため、座標を tuple にまとめる(pythagoras.test.ts 等の生の座標列挙より簡潔)。
function pointArb(min: number, max: number): fc.Arbitrary<Point2> {
	return fc
		.tuple(fc.double({ min, max, noNaN: true }), fc.double({ min, max, noNaN: true }))
		.map(([x, y]): Point2 => [x, y]);
}

describe('scaleFrom', () => {
	it('scaleFrom([0,0], 2, [3,4]) = [6,8] (既知の整数値)', () => {
		expect(scaleFrom([0, 0], 2, [3, 4])).toEqual([6, 8]);
	});

	it('scaleFrom([1,1], 2, [3,4]) = [5,7] (中心が原点でない既知値)', () => {
		expect(scaleFrom([1, 1], 2, [3, 4])).toEqual([5, 7]);
	});

	it('scaleFrom([2,3], 0.5, [4,3]) = [3,3] (縮小、既知値)', () => {
		expect(scaleFrom([2, 3], 0.5, [4, 3])).toEqual([3, 3]);
	});

	it('k=0 (退化ケース): 任意の点が中心そのものへ退化する。例外を投げず有限値を返す (MATH_CONVENTIONS §4)', () => {
		const center: Point2 = [3, -2];
		const result = scaleFrom(center, 0, [100, -50]);
		expect(Number.isFinite(result[0]) && Number.isFinite(result[1])).toBe(true);
		expect(result).toEqual(center);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な center[0] → RangeError (サイレントに伝播させない, MATH_CONVENTIONS §3)`, () => {
			expect(() => scaleFrom([value, 0], 1, [1, 1])).toThrow(RangeError);
		});
		it(`${label} な center[1] → RangeError`, () => {
			expect(() => scaleFrom([0, value], 1, [1, 1])).toThrow(RangeError);
		});
		it(`${label} な k → RangeError`, () => {
			expect(() => scaleFrom([0, 0], value, [1, 1])).toThrow(RangeError);
		});
		it(`${label} な p[0] → RangeError`, () => {
			expect(() => scaleFrom([0, 0], 1, [value, 1])).toThrow(RangeError);
		});
		it(`${label} な p[1] → RangeError`, () => {
			expect(() => scaleFrom([0, 0], 1, [1, value])).toThrow(RangeError);
		});
	}

	it('property: 中心自身は不動 — scaleFrom(c,k,c) === c (計算経路: 減算 c-c は有限 k に対し常に厳密 0 になるため、丸め誤差なしで厳密等価)', () => {
		fc.assert(
			fc.property(pointArb(-1e6, 1e6), fc.double({ min: -1e6, max: 1e6, noNaN: true }), (c, k) => {
				const result = scaleFrom(c, k, c);
				return result[0] === c[0] && result[1] === c[1];
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: k=1 は恒等変換 — scaleFrom(c,1,p) ≈ p (計算経路を通す: center+1*(p-center) を実際に計算し、独立に p と比較する)', () => {
		fc.assert(
			fc.property(pointArb(-1e4, 1e4), pointArb(-1e4, 1e4), (center, p) => {
				const result = scaleFrom(center, 1, p);
				const scale = Math.max(
					1,
					Math.abs(p[0]),
					Math.abs(p[1]),
					Math.abs(center[0]),
					Math.abs(center[1]),
				);
				return approximatelyZero(distance(result, p), scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('distance', () => {
	it('distance([0,0],[3,4]) = 5 (3-4-5、既知の整数値)', () => {
		expect(distance([0, 0], [3, 4])).toBe(5);
	});

	it('同一点は距離 0', () => {
		expect(distance([2, -3], [2, -3])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a[0] → RangeError`, () => {
			expect(() => distance([value, 0], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な a[1] → RangeError`, () => {
			expect(() => distance([0, value], [1, 1])).toThrow(RangeError);
		});
		it(`${label} な b[0] → RangeError`, () => {
			expect(() => distance([0, 0], [value, 1])).toThrow(RangeError);
		});
		it(`${label} な b[1] → RangeError`, () => {
			expect(() => distance([0, 0], [1, value])).toThrow(RangeError);
		});
	}

	it('property: distance(a,b) === distance(b,a) (対称性)', () => {
		fc.assert(
			fc.property(pointArb(-1e6, 1e6), pointArb(-1e6, 1e6), (a, b) => distance(a, b) === distance(b, a)),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('triangleArea', () => {
	it('triangleArea([0,0],[2,0],[0,2]) = 2 (直角二等辺三角形、既知の整数値)', () => {
		expect(triangleArea([0, 0], [2, 0], [0, 2])).toBe(2);
	});

	it('共線三角形(退化)は面積 0。例外を投げず有限値を返す (MATH_CONVENTIONS §4)', () => {
		const area = triangleArea([0, 0], [1, 0], [3, 0]);
		expect(Number.isFinite(area)).toBe(true);
		expect(area).toBe(0);
	});

	it('頂点の順序を入れ替えても面積(符号なし)は変わらない', () => {
		const a: Point2 = [0, 0];
		const b: Point2 = [4, 0];
		const c: Point2 = [0, 3];
		expect(triangleArea(a, b, c)).toBe(triangleArea(a, c, b));
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a[0] → RangeError`, () => {
			expect(() => triangleArea([value, 0], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な a[1] → RangeError`, () => {
			expect(() => triangleArea([0, value], [1, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な b[0] → RangeError`, () => {
			expect(() => triangleArea([0, 0], [value, 0], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な b[1] → RangeError`, () => {
			expect(() => triangleArea([0, 0], [1, value], [0, 1])).toThrow(RangeError);
		});
		it(`${label} な c[0] → RangeError`, () => {
			expect(() => triangleArea([0, 0], [1, 0], [value, 1])).toThrow(RangeError);
		});
		it(`${label} な c[1] → RangeError`, () => {
			expect(() => triangleArea([0, 0], [1, 0], [0, value])).toThrow(RangeError);
		});
	}
});

describe('相似変換の不変条件 (中心拡大 scaleFrom + distance/triangleArea)', () => {
	it('既知例: center=(0,0) の三角形 (0,0),(2,0),(0,2) を k=2 で拡大すると辺は2倍・面積は4倍', () => {
		const center: Point2 = [0, 0];
		const p: Point2 = [0, 0];
		const q: Point2 = [2, 0];
		const r: Point2 = [0, 2];
		expect(distance(p, q)).toBe(2);
		expect(triangleArea(p, q, r)).toBe(2);

		const k = 2;
		const sp = scaleFrom(center, k, p);
		const sq = scaleFrom(center, k, q);
		const sr = scaleFrom(center, k, r);
		expect(sp).toEqual([0, 0]);
		expect(sq).toEqual([4, 0]);
		expect(sr).toEqual([0, 4]);
		expect(distance(sp, sq)).toBe(4); // 2倍
		expect(triangleArea(sp, sq, sr)).toBe(8); // 4倍 (2^2)
	});

	it('既知例: center=(0,0)上にない三角形を k=3 で拡大しても辺の比=3・面積比=9 (中心が三角形の頂点でない一般の場合)', () => {
		const center: Point2 = [0, 0];
		const p: Point2 = [2, 1];
		const q: Point2 = [4, 1];
		const r: Point2 = [2, 3];
		expect(distance(p, q)).toBe(2);
		expect(triangleArea(p, q, r)).toBe(2);

		const k = 3;
		const sp = scaleFrom(center, k, p);
		const sq = scaleFrom(center, k, q);
		const sr = scaleFrom(center, k, r);
		expect(sp).toEqual([6, 3]);
		expect(sq).toEqual([12, 3]);
		expect(sr).toEqual([6, 9]);
		expect(distance(sp, sq)).toBe(6); // 3倍
		expect(triangleArea(sp, sq, sr)).toBe(18); // 9倍 (3^2)
	});

	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('相似比=距離比: distance(scaleFrom(c,k,a), scaleFrom(c,k,b)) ≈ |k|·distance(a,b) (scaleFrom→distance という実際の計算経路を通し、独立に計算した |k|・distance(a,b) と突き合わせる)', () => {
			fc.assert(
				fc.property(
					pointArb(-1e3, 1e3),
					pointArb(-1e3, 1e3),
					pointArb(-1e3, 1e3),
					fc.double({ min: -10, max: 10, noNaN: true }),
					(center, a, b, k) => {
						const scaledDist = distance(scaleFrom(center, k, a), scaleFrom(center, k, b));
						const expected = Math.abs(k) * distance(a, b);
						return approximatelyZero(scaledDist - expected, Math.max(scaledDist, expected));
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('面積比=k²: triangleArea(scaleFrom×3) ≈ k²·triangleArea(元の3点) (scaleFrom→triangleArea という実際の計算経路を通し、独立に計算した k²・triangleArea(元の3点) と突き合わせる)', () => {
			fc.assert(
				fc.property(
					pointArb(-1e2, 1e2),
					pointArb(-1e2, 1e2),
					pointArb(-1e2, 1e2),
					pointArb(-1e2, 1e2),
					fc.double({ min: -10, max: 10, noNaN: true }),
					(center, p, q, r, k) => {
						const sp = scaleFrom(center, k, p);
						const sq = scaleFrom(center, k, q);
						const sr = scaleFrom(center, k, r);
						const scaledArea = triangleArea(sp, sq, sr);
						const originalArea = triangleArea(p, q, r);
						const expected = k * k * originalArea;
						return approximatelyZero(scaledArea - expected, Math.max(scaledArea, expected));
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});
