// 一次変換(2×2 行列によるベクトル空間の変換)と行列式の純粋 TypeScript モデル
// (AGENTS.md §5: React/Mafs を一切 import しない)。
//
// この単元の中核体験: 単位正方形 (0,0),(1,0),(1,1),(0,1) を 2×2 行列 A で変換すると
// 平行四辺形になり、その面積は常に |det A| 倍になる。さらに det A の符号が
// 変換前後で図形の向き(表裏)が反転したかどうかを表す。
//
// applyMatrix は lib/math/eigen.ts に同一シグネチャ(Matrix2x2 × Vector2 → Vector2)の
// 実装が既にあるため重複実装せず、そのまま re-export する(タスク厳守事項: eigen.ts に
// 同等があれば import 再利用する)。determinant・signedPolygonArea はこの単元固有の新規実装。

import { applyMatrix as eigenApplyMatrix, type Vector2, type Matrix2x2 } from './eigen.js';

export type { Vector2, Matrix2x2 };
export const applyMatrix = eigenApplyMatrix;

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (eigen.ts / similarity.ts と同じ流儀)。
function assertFiniteMatrix(matrix: Matrix2x2, name: string): void {
	const [[a, b], [c, d]] = matrix;
	if (![a, b, c, d].every(Number.isFinite)) {
		throw new RangeError(`${name} must have finite entries, got [[${a}, ${b}], [${c}, ${d}]]`);
	}
}

function assertFinitePoint(point: Point2, name: string): void {
	if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
		throw new RangeError(`${name} must have finite coordinates, got [${point[0]}, ${point[1]}]`);
	}
}

/**
 * 2×2 行列 A = [[a,b],[c,d]] の行列式: det A = ad − bc。
 *
 * 設計判断(eigen.ts の computeEigenSystem との重複について): computeEigenSystem も内部で
 * 同じ ad−bc を計算して結果の一部として返すが、それは固有系全体(トレース・判別式・
 * 固有ベクトルまで)を計算する重い処理であり、行列式だけが欲しいこのモジュールの用途には
 * 過剰かつ関心が異なる(このモジュールは固有値・固有ベクトルを一切扱わない)。
 * computeEigenSystem は行列式を公開 API として単体 export していないため、ここでの
 * 最小限の再実装は「重複実装しない」方針に反しない(1行の式を、無関係な計算一式を
 * 経由せず直接計算するほうが外科的な変更)。
 */
export function determinant(matrix: Matrix2x2): number {
	assertFiniteMatrix(matrix, 'matrix');
	const [[a, b], [c, d]] = matrix;
	return a * d - b * c;
}

/**
 * 多角形の頂点列(順序どおりに結んだもの)の符号つき面積(シューレース公式)。
 *
 * similarity.ts の triangleArea は Math.abs を取った符号なし面積であり、3点固定の三角形専用
 * (相似単元では図形の向きの反転を扱わないため、それで十分だった)。この一次変換の単元では
 * 「変換によって図形の表裏(向き)が反転したかどうか」を検出する必要があり、符号なし面積では
 * それができない(反転しても |面積| 自体は変わらないため情報が失われる)。そこで頂点の
 * 並び順に依存する符号をそのまま保持するシューレース公式をこのモジュールに新設する
 * ——triangleArea の重複ではなく、必要な情報量(符号の有無)が異なる別の関数として位置づける。
 *
 * 頂点を反時計回り(MATH_CONVENTIONS §5 の標準的な数学の向き: x右・y上)に結んだとき正、
 * 時計回りのとき負になる。3点未満は「多角形」として面積が定義できないため RangeError。
 * 3点以上あれば、共線・頂点重複などの退化(潰れて線分や点になる)はすべて有効な退化例として
 * シューレース公式がそのまま 0 を返す(特別扱い不要、例外を投げない。MATH_CONVENTIONS §4)。
 */
export function signedPolygonArea(points: readonly Point2[]): number {
	if (points.length < 3) {
		throw new RangeError(`signedPolygonArea requires at least 3 points, got ${points.length}`);
	}
	points.forEach((p, i) => assertFinitePoint(p, `points[${i}]`));

	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const [x1, y1] = points[i];
		const [x2, y2] = points[(i + 1) % points.length];
		sum += x1 * y2 - x2 * y1;
	}
	return sum / 2;
}
