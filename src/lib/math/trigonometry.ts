import { approximatelyZero } from './compare.js';

// 三角比・単位円の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// linearFunction.ts / quadraticFunction.ts と同じ流儀: 非有限入力は境界で弾き
// (MATH_CONVENTIONS §3)、ゼロ除算になりうる箇所は専用の分岐 (RangeError) を用意する。
//
// 角度の内部単位はラジアンで統一する (MATH_CONVENTIONS §5)。度 (°) への変換
// (degreesToRadians/radiansToDegrees) はこのファイルには置かず、呼び出し側の UI 層
// (components/lesson/TrigonometryExperiment.tsx) に置く — EigenvectorExperiment.tsx が
// DEG_TO_RAD/RAD_TO_DEG をコンポーネント側に持つのと同じ設計判断。

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (pythagoras.ts の assertFinitePoint / linearFunction.ts の assertFiniteNumber と同じ流儀)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 単位円上の点 (cos θ, sin θ)。半径 1 の円周上で、x 軸正方向から反時計回りに測った
 * 角度 θ (ラジアン) に対応する点を返す。これが sin・cos の定義そのものである
 * (直角三角形の比の定義を、斜辺の長さ 1 の直角三角形として単位円へ一般化したもの)。
 */
export function unitCirclePoint(theta: number): Point2 {
	assertFiniteNumber(theta, 'theta');
	return [Math.cos(theta), Math.sin(theta)];
}

/** 正弦 sin θ。単位円上の点の y 座標。 */
export function sine(theta: number): number {
	assertFiniteNumber(theta, 'theta');
	return Math.sin(theta);
}

/** 余弦 cos θ。単位円上の点の x 座標。 */
export function cosine(theta: number): number {
	assertFiniteNumber(theta, 'theta');
	return Math.cos(theta);
}

/**
 * 正接 tan θ = sin θ / cos θ。
 *
 * cos θ ≈ 0 のときの方針(根拠): θ = π/2 + kπ(k は整数)では単位円上の点の x 座標が 0 になり、
 * sin θ / cos θ がゼロ除算になる。幾何学的には、この角度で決まる直線が y 軸と平行(傾きが
 * 定義できない垂直な直線)になるため、tan θ という「その直線の傾き」自体が存在しない
 * 質的に異なるケースである。linearFunction.ts の xRoot(a=0)・quadraticFunction.ts の
 * completeSquare(a=0)と同じ方針で、MATH_CONVENTIONS §3「ゼロ除算になりうる箇所」として
 * approximatelyZero(cos, 1) で判定し RangeError を投げる。呼び出し側(UI 層)は
 * cos θ ≈ 0 を事前に検知して安全な表示へフォールバックすること(例外での分岐に頼らない)。
 */
export function tangent(theta: number): number {
	assertFiniteNumber(theta, 'theta');
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	if (approximatelyZero(cos, 1)) {
		throw new RangeError(
			`tangent is undefined at theta=${theta}: cos(theta)≈0 (theta is near π/2 + k·π, the terminal ray is vertical)`,
		);
	}
	return sin / cos;
}

/**
 * ピタゴラス恒等式の残差 sin²θ + cos²θ − 1。単位円の定義(半径 1)から、この値は
 * どんな θ に対しても常に 0 になるはずである。丸めない内部値を返す(表示時に丸めるのは
 * 呼び出し側の責務、MATH_CONVENTIONS §1)。
 */
export function pythagoreanIdentityResidual(theta: number): number {
	assertFiniteNumber(theta, 'theta');
	const sin = Math.sin(theta);
	const cos = Math.cos(theta);
	return sin * sin + cos * cos - 1;
}
