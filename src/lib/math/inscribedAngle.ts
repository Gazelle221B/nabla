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

import { unsignedAngleAtVertex } from './geometry.js';

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
 * 実装 (atan2(|外積|, 内積) 方式、ゼロ長ベクトルは RangeError) は Issue #21 で
 * lib/math/geometry.ts の unsignedAngleAtVertex へ共有化済み(旧: lawOfSinesCosines.ts の
 * angleAtVertex・dotProduct.ts の angleBetween と同一実装が重複していた。数値的根拠の
 * コメントも共有先に集約している)。
 */
export function angleAtVertex(vertex: Point2, p1: Point2, p2: Point2): number {
	return unsignedAngleAtVertex(vertex, p1, p2);
}
