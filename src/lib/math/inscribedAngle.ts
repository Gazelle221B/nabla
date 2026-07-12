// 円周角の定理の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// similarity.ts / trigonometry.ts と同じ流儀: 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、
// ゼロ長ベクトル等の定義不能な入力は RangeError で明示ハンドリングする (MATH_CONVENTIONS §4)。
//
// 角度の内部単位はラジアンで統一する (MATH_CONVENTIONS §5)。度 (°) への変換は UI 層
// (components/lesson/InscribedAngleExperiment.tsx) に置く。
//
// 設計判断: 「中心角」「円周角」を別関数として用意しない。どちらも「ある頂点から見た
// 2点への符号なし角」という同一の計算 (angleAtVertex) であり、頂点を中心 O にするか
// 円周上の点 P にするかの違いにすぎない。同一の計算に別名の関数を2つ用意すると
// 実体のない重複になるため、呼び出し側 (テスト・Scene・Experiment) で
// `angleAtVertex(center, A, B)` (中心角) / `angleAtVertex(p, A, B)` (円周角) と
// 呼び分けることで意図を表現する (Simplicity First)。

import { approximatelyZero } from './compare.js';

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (similarity.ts の assertFiniteNumber / assertFinitePoint と同じ流儀)。
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
 * 中心 center・半径 radius の円周上で、角度 theta (ラジアン、x軸正方向から反時計回り) に
 * 対応する点。
 *
 * radius は正の実数でなければならない(方針、MATH_CONVENTIONS §4): 半径 0 以下は円ではなく
 * 「点」または向きが反転した無効な図形になり、この単元が扱う円周角・中心角がそもそも
 * 定義できないため、退化ケースとして値を返さず RangeError にする(similarity.ts の k=0 が
 * 有効な退化値〔中心の1点〕を返すのとは異なり、こちらは「円」という前提条件そのものが
 * 崩れるケース)。
 */
export function pointOnCircle(center: Point2, radius: number, theta: number): Point2 {
	assertFinitePoint(center, 'center');
	assertFiniteNumber(radius, 'radius');
	assertFiniteNumber(theta, 'theta');
	if (radius <= 0) {
		throw new RangeError(`radius must be positive, got ${radius}`);
	}
	return [center[0] + radius * Math.cos(theta), center[1] + radius * Math.sin(theta)];
}

/**
 * 頂点 vertex での符号なし角 ∠p1–vertex–p2 (ラジアン、[0, π])。
 *
 * Math.acos(内積 / (|v1|・|v2|)) ではなく Math.atan2(|外積|, 内積) を使う方針(根拠):
 * acos は入力が ±1 に近い(=角度が 0 または π に近い)場合、割り算と acos の定義域境界
 * 付近での桁落ちにより誤差が拡大しやすい。円周角の定理はまさに「角度が 0 や π に近い」
 * 境界(タレスの定理=π/2 はともかく、ほぼ同じ向き・正反対の向きのケースを含む)を扱うため、
 * 外積・内積を割り算せずそのまま atan2 に渡すこの方式のほうが数値的に安定する。
 *
 * vertex が p1 または p2 と一致する(ベクトルがゼロ長になる)場合、角度そのものが定義
 * できないため RangeError とする(MATH_CONVENTIONS §4: 退化ケースは明示ハンドリングし、
 * サイレントに NaN 等を伝播させない)。
 */
export function angleAtVertex(vertex: Point2, p1: Point2, p2: Point2): number {
	assertFinitePoint(vertex, 'vertex');
	assertFinitePoint(p1, 'p1');
	assertFinitePoint(p2, 'p2');

	const v1x = p1[0] - vertex[0];
	const v1y = p1[1] - vertex[1];
	const v2x = p2[0] - vertex[0];
	const v2y = p2[1] - vertex[1];

	const len1 = Math.hypot(v1x, v1y);
	const len2 = Math.hypot(v2x, v2y);

	// ゼロ長判定はスケール相対誤差で行う (MATH_CONVENTIONS §2)。scale は比較対象と同じ次元
	// (座標の大きさ)の量を渡す。
	const scale1 = Math.max(1, Math.abs(vertex[0]), Math.abs(vertex[1]), Math.abs(p1[0]), Math.abs(p1[1]));
	const scale2 = Math.max(1, Math.abs(vertex[0]), Math.abs(vertex[1]), Math.abs(p2[0]), Math.abs(p2[1]));
	if (approximatelyZero(len1, scale1)) {
		throw new RangeError(
			'angleAtVertex requires vertex !== p1 (zero-length vector, angle undefined)',
		);
	}
	if (approximatelyZero(len2, scale2)) {
		throw new RangeError(
			'angleAtVertex requires vertex !== p2 (zero-length vector, angle undefined)',
		);
	}

	const dot = v1x * v2x + v1y * v2y;
	const cross = v1x * v2y - v1y * v2x;
	return Math.atan2(Math.abs(cross), dot);
}
