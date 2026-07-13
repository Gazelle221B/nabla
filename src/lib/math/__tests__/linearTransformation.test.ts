import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	applyMatrix,
	determinant,
	signedPolygonArea,
	type Matrix2x2,
	type Point2,
	type Vector2,
} from '../linearTransformation.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (dotProduct.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const UNIT_SQUARE: readonly Point2[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];

describe('determinant', () => {
	it('既知例: 単位行列 → 1', () => {
		expect(determinant([[1, 0], [0, 1]])).toBe(1);
	});

	it('既知例: 90°回転行列 [[0,-1],[1,0]] → 1(回転は面積・向きを保つ)', () => {
		expect(determinant([[0, -1], [1, 0]])).toBe(1);
	});

	it('既知例: 対角行列 diag(2,3) → 6', () => {
		expect(determinant([[2, 0], [0, 3]])).toBe(6);
	});

	it('既知例: 鏡映行列(x軸に関して反転)[[1,0],[0,-1]] → -1(向きが反転)', () => {
		expect(determinant([[1, 0], [0, -1]])).toBe(-1);
	});

	it('退化例: 階数1の行列(列が比例)は行列式0(例外なし)', () => {
		expect(determinant([[1, 2], [2, 4]])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 a → RangeError`, () => {
			expect(() => determinant([[value, 0], [0, 1]])).toThrow(RangeError);
		});
		it(`${label} な成分 d → RangeError`, () => {
			expect(() => determinant([[1, 0], [0, value]])).toThrow(RangeError);
		});
	}
});

describe('signedPolygonArea', () => {
	it('単位正方形(反時計回り)の符号つき面積は +1', () => {
		expect(signedPolygonArea(UNIT_SQUARE)).toBe(1);
	});

	it('単位正方形を時計回りに結ぶと符号つき面積は -1(向きの反転を検出できる)', () => {
		expect(signedPolygonArea([...UNIT_SQUARE].reverse())).toBe(-1);
	});

	it('退化例: 3点が同一直線上(共線)なら面積0(例外なし)', () => {
		expect(
			signedPolygonArea([
				[0, 0],
				[1, 0],
				[2, 0],
			]),
		).toBe(0);
	});

	it('退化例: 頂点が潰れて一直線に並ぶ四角形(階数1変換の像)は面積0(例外なし)', () => {
		expect(
			signedPolygonArea([
				[0, 0],
				[1, 2],
				[3, 6],
				[2, 4],
			]),
		).toBe(0);
	});

	it('3点未満はRangeError(多角形として面積が定義できない)', () => {
		expect(() =>
			signedPolygonArea([
				[0, 0],
				[1, 0],
			]),
		).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な頂点座標 → RangeError`, () => {
			expect(() =>
				signedPolygonArea([
					[value, 0],
					[1, 0],
					[1, 1],
				]),
			).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。
const entryArb = fc.double({ min: -8, max: 8, noNaN: true });
const matrixArb: fc.Arbitrary<Matrix2x2> = fc
	.tuple(entryArb, entryArb, entryArb, entryArb)
	.map(([a, b, c, d]) => [[a, b], [c, d]] as Matrix2x2);

const pointArb = fc.tuple(
	fc.double({ min: -5, max: 5, noNaN: true }),
	fc.double({ min: -5, max: 5, noNaN: true }),
) as fc.Arbitrary<Point2>;

// 退化(共線・面積ほぼ0)三角形を検証域から除外する(similarity.test.ts の non-degenerate
// フィルタと同じ方針)。面積比の相対誤差評価は originalArea で割った量を扱うため、
// originalArea が0に近いと相対誤差が発散し、実装ではなくテストの数値的不安定性を
// 検出してしまう。
const triangleArb = fc
	.tuple(pointArb, pointArb, pointArb)
	.filter(([a, b, c]) => Math.abs(signedPolygonArea([a, b, c])) > 0.5) as fc.Arbitrary<
	readonly [Point2, Point2, Point2]
>;

// 2×2 行列の積(この不変条件テスト専用のローカルヘルパー。lib/math には置かない
// ——乗法性の検証にのみ使う補助であり、この単元の数学モデルの公開 API ではないため)。
function matMul(m: Matrix2x2, n: Matrix2x2): Matrix2x2 {
	const [[a11, a12], [a21, a22]] = m;
	const [[b11, b12], [b21, b22]] = n;
	return [
		[a11 * b11 + a12 * b21, a11 * b12 + a12 * b22],
		[a21 * b11 + a22 * b21, a21 * b12 + a22 * b22],
	];
}

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 単位正方形を変換した実測面積(シューレース)と determinant(m)(成分の式)が一致する — ' +
			'正確には(GrokBuild 指摘で表現を是正): シューレース展開は代数的には ad−bc に簡約される' +
			'同一の恒等式であり「代数的に独立」ではない。ただし**実装経路は独立**' +
			'(determinant / applyMatrix / signedPolygonArea は互いを呼ばない別関数)なので、' +
			'いずれか1つの実装の式誤り(行列積の行/列取り違え・符号誤り・/2 抜け等)を確実に検出できる' +
			'(C-7: 検出力の根拠は代数の独立性ではなく実装の分離にある)',
		() => {
			fc.assert(
				fc.property(matrixArb, (m) => {
					const transformed = UNIT_SQUARE.map((p) => applyMatrix(m, p as Vector2));
					const measuredArea = signedPolygonArea(transformed);
					const det = determinant(m);
					const scale = Math.max(1, Math.abs(det));
					return approximatelyZero(measuredArea - det, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 一般の三角形でも、変換後の面積比は |det(m)| に一致する(単位正方形に限らない)', () => {
		fc.assert(
			fc.property(matrixArb, triangleArb, (m, tri) => {
				const originalArea = Math.abs(signedPolygonArea(tri));
				const transformed = tri.map((p) => applyMatrix(m, p));
				const transformedArea = Math.abs(signedPolygonArea(transformed));
				const det = determinant(m);
				const expected = Math.abs(det) * originalArea;
				const scale = Math.max(1, transformedArea, expected);
				return approximatelyZero(transformedArea - expected, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 乗法性 det(AB) = det(A)・det(B)(行列の積は本テスト専用のローカル実装で計算)', () => {
		fc.assert(
			fc.property(matrixArb, matrixArb, (a, b) => {
				const ab = matMul(a, b);
				const lhs = determinant(ab);
				const rhs = determinant(a) * determinant(b);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return approximatelyZero(lhs - rhs, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 恒等変換(単位行列)はどんな図形の面積・向きも変えない(det=1の具体例の一般化)', () => {
		fc.assert(
			fc.property(triangleArb, (tri) => {
				const identity: Matrix2x2 = [[1, 0], [0, 1]];
				const transformed = tri.map((p) => applyMatrix(identity, p));
				const before = signedPolygonArea(tri);
				const after = signedPolygonArea(transformed);
				return approximatelyZero(after - before, Math.max(1, Math.abs(before)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 任意の行列で sign(変換後の符号つき面積) = sign(det A)・sign(元の面積)(向きの保存/反転が det の符号で完全に決まる。QA_MEMORY 指摘: 固定の鏡映のみでなく任意行列で検証)', () => {
		fc.assert(
			fc.property(
				// |det| が微小だと変換後面積も微小になり符号が数値的に不安定になるため、
				// 十分な大きさの行列式を持つ行列に限定する(性質自体は det≠0 で成り立つ)。
				matrixArb.filter((m) => Math.abs(determinant(m)) > 0.1),
				triangleArb,
				(m, tri) => {
					const original = signedPolygonArea(tri);
					const transformed = tri.map((p) => applyMatrix(m, p));
					const after = signedPolygonArea(transformed);
					return (
						Math.sign(original) !== 0 &&
						Math.sign(after) === Math.sign(determinant(m)) * Math.sign(original)
					);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
