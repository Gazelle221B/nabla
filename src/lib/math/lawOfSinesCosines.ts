// 正弦定理・余弦定理の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// similarity.ts / inscribedAngle.ts と同じ流儀: 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、
// ゼロ長・退化(共線)ケースは明示ハンドリングする (MATH_CONVENTIONS §4)。
//
// 角度の内部単位はラジアンで統一する (MATH_CONVENTIONS §5)。度 (°) への変換は UI 層
// (components/lesson/LawOfSinesCosinesExperiment.tsx) に置く。
//
// この単元では三角形を3頂点 A, B, C: Point2 で表す。高校数学Iの標準的な記法に合わせ、
// 頂点 A の対辺 (= BC の長さ) を a、頂点 B の対辺 (= CA の長さ) を b、頂点 C の対辺
// (= AB の長さ) を c と呼ぶ。

import { unsignedAngleAtVertex } from './geometry.js';

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (similarity.ts / inscribedAngle.ts の assertFiniteNumber / assertFinitePoint と同じ流儀。
// この極小ヘルパーは lib/math 内の各モジュールがそれぞれ独立に持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

function assertFinitePoint(point: Point2, name: string): void {
	if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
		throw new RangeError(
			`${name} must have finite coordinates, got [${point[0]}, ${point[1]}]`,
		);
	}
}

/**
 * 2点 p, q 間のユークリッド距離(三角形の辺の長さ)。
 *
 * p と q が一致する場合は 0 を返す(退化ではなく、2点間距離として有効な通常値。
 * MATH_CONVENTIONS §4 の「ゼロ長は不正値ではなく退化例」という方針そのもの)。
 */
export function sideLength(p: Point2, q: Point2): number {
	assertFinitePoint(p, 'p');
	assertFinitePoint(q, 'q');
	return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/**
 * 頂点 vertex での符号なし角 ∠p1–vertex–p2 (ラジアン、[0, π])。
 *
 * 実装 (atan2(|外積|, 内積) 方式、ゼロ長ベクトルは RangeError) は Issue #21 で
 * lib/math/geometry.ts の unsignedAngleAtVertex へ共有化済み(旧: inscribedAngle.ts の
 * angleAtVertex・dotProduct.ts の angleBetween と同一実装が重複していた。数値的根拠の
 * コメントも共有先に集約している)。
 *
 * 退化ケースの方針(MATH_CONVENTIONS §4、この単元固有の判断のため引き続きここに残す):
 * vertex が p1 または p2 と一致する場合、頂点から見るベクトルがゼロ長になり角度そのものが
 * 定義できないため RangeError とする。一方、3点が一直線上にある(共線)だけで vertex が
 * p1・p2 と異なる場合は、角度は 0 (同じ向き) または π (正反対の向き) として有効に定義
 * できる——この場合、3点を頂点とする「三角形」の面積は0に退化するが、角度自体は退化しない
 * (面積0=角度未定義、ではない)。そのため、共線であるという理由だけでは例外にしない
 * (unsignedAngleAtVertex はこの方針の通り、共線かどうかではなくベクトルのゼロ長のみを
 * 検査する)。
 */
export function angleAtVertex(vertex: Point2, p1: Point2, p2: Point2): number {
	return unsignedAngleAtVertex(vertex, p1, p2);
}

/**
 * 余弦定理: 頂点 A に隣接する2辺 b (= CA の長さ), c (= AB の長さ) と、その間の角 A
 * (頂点 A の内角、ラジアン)から、対辺 a (= BC の長さ)を求める。
 *
 *   a = √(b² + c² − 2bc·cos A)
 *
 * b, c の方針(MATH_CONVENTIONS §4): 三角形の辺の長さとして意味を持つのは正の値のみ。
 * 0 以下は「辺」ではなく「点」に退化し、この関数がそもそも表現しようとしている量
 * (2辺と挟角から対辺を求める)が成立しないため RangeError とする
 * (inscribedAngle.ts の pointOnCircle が radius ≤ 0 を RangeError とするのと同じ方針)。
 *
 * angleA の方針: 三角形の内角として意味を持つ [0, π] の範囲に限る(この範囲外の値は
 * 「内角」として無意味なため弾く)。angleA = 0 または π は3点が一直線上に潰れる退化
 * ケース(共線・面積0)だが、公式自体は有限の値(それぞれ |b−c|、b+c)を返すため、
 * angleAtVertex とは異なり例外にはしない——「2辺と挟角」という入力形式そのものは
 * 挟角が 0/π であっても定義でき、頂点が一致してベクトルが消える angleAtVertex の
 * ケースとは性質が異なる。
 *
 * Math.max(0, …) で判別式(discriminant)を非負にクランプする理由: b²+c²−2bc·cosA は
 * (b−c·cosA)² + (c·sinA)² と書き換えられ、数学的には常に非負であることが保証されている。
 * しかし b と c が近い値で angleA が 0 に近いケースなど、浮動小数点の丸め誤差により
 * 理論上ゼロになるべき式がごく僅かに負(例: −1e−16)に計算されることがある。これを
 * そのまま Math.sqrt に渡すと NaN になり非有限値をサイレントに伝播させてしまう
 * (MATH_CONVENTIONS §3 違反)。ここでの Math.max(0, …) は NaN を握りつぶす処置ではなく、
 * 「数学的に非負であることが証明されている式」の丸め誤差だけを丸めの精度の範囲で
 * 補正する処置である。
 */
export function lawOfCosinesSide(b: number, c: number, angleA: number): number {
	assertFiniteNumber(b, 'b');
	assertFiniteNumber(c, 'c');
	assertFiniteNumber(angleA, 'angleA');
	if (b <= 0) {
		throw new RangeError(`b must be positive, got ${b}`);
	}
	if (c <= 0) {
		throw new RangeError(`c must be positive, got ${c}`);
	}
	if (angleA < 0 || angleA > Math.PI) {
		throw new RangeError(`angleA must be within [0, π], got ${angleA}`);
	}
	const discriminant = b * b + c * c - 2 * b * c * Math.cos(angleA);
	return Math.sqrt(Math.max(0, discriminant));
}
