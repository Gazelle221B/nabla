// ベクトルの内積の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// trigonometry.ts / inscribedAngle.ts と同じ流儀: 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、
// ゼロベクトル等の定義不能な入力は RangeError で明示ハンドリングする (MATH_CONVENTIONS §4)。
//
// この単元の中核体験: 内積には独立な2つの定義がある。
//   (1) 成分計算  a·b = aₓbₓ + aᵧbᵧ
//   (2) 幾何的定義 a·b = |a||b|cos θ (θ はなす角)
// この2つが常に一致し、θ = π/2 (直角) のときちょうど 0 になることを発見させる。
//
// 角度の内部単位はラジアンで統一する (MATH_CONVENTIONS §5)。度 (°) への変換は UI 層
// (components/lesson/DotProductExperiment.tsx) に置く。

import { approximatelyZero } from './compare.js';
import { unsignedAngleFromVectors } from './geometry.js';

export type Vec2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (inscribedAngle.ts の assertFiniteNumber / assertFinitePoint と同じ流儀)。
function assertFiniteVec2(v: Vec2, name: string): void {
	if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
		throw new RangeError(`${name} must have finite components, got [${v[0]}, ${v[1]}]`);
	}
}

/**
 * 内積の成分計算: a·b = aₓbₓ + aᵧbᵧ。
 * この単元の2つの独立な定義のうち1つ目(座標成分から直接計算する経路)。
 * 縮退(ゼロベクトルとの内積は常に0)は有効な退化例であり、例外を投げない
 * (MATH_CONVENTIONS §4: ゼロ長は「不正値」ではなく「退化例」)。
 */
export function dot(a: Vec2, b: Vec2): number {
	assertFiniteVec2(a, 'a');
	assertFiniteVec2(b, 'b');
	return a[0] * b[0] + a[1] * b[1];
}

/**
 * ベクトルの大きさ |v| = √(vₓ² + vᵧ²)。ゼロベクトルは大きさ0という有効な退化値であり、
 * 例外を投げない(角度が定義できなくなるのは angleBetween 側の責務)。
 */
export function magnitude(v: Vec2): number {
	assertFiniteVec2(v, 'v');
	return Math.hypot(v[0], v[1]);
}

/**
 * 2ベクトル a, b のなす角(符号なし、ラジアン、[0, π])。
 *
 * 実装 (atan2(|外積|, 内積) 方式、ゼロベクトルは RangeError) は Issue #21 で
 * lib/math/geometry.ts の unsignedAngleBetweenVectors へ共有化済み(旧: inscribedAngle.ts の
 * angleAtVertex・lawOfSinesCosines.ts の angleAtVertex と同一実装が重複していた。rule of
 * three 到達時〔PR #20〕は既存2単元の安定を壊さない外科的判断として先送りしたが、Issue #21
 * の横断リファクタで共有化した。数値的根拠のコメントも共有先に集約している)。
 *
 * この単元のUI操作域ではゼロベクトルを作れない設計にするが(DotProductExperiment.tsx:
 * 大きさの最小値 > 0)、数学モデルとしては境界条件を明示的にハンドリングし RangeError と
 * する(MATH_CONVENTIONS §4: サイレントに NaN を伝播させない)。
 */
export function angleBetween(a: Vec2, b: Vec2): number {
	assertFiniteVec2(a, 'a');
	assertFiniteVec2(b, 'b');

	const lenA = Math.hypot(a[0], a[1]);
	const lenB = Math.hypot(b[0], b[1]);

	// ゼロ長判定はスケール相対誤差で行う (MATH_CONVENTIONS §2)。scale は比較対象と同じ次元
	// (座標の大きさ)の量を渡す。
	const scaleA = Math.max(1, Math.abs(a[0]), Math.abs(a[1]));
	const scaleB = Math.max(1, Math.abs(b[0]), Math.abs(b[1]));
	if (approximatelyZero(lenA, scaleA)) {
		throw new RangeError('angleBetween requires a non-zero vector a (zero vector has no direction, angle undefined)');
	}
	if (approximatelyZero(lenB, scaleB)) {
		throw new RangeError('angleBetween requires a non-zero vector b (zero vector has no direction, angle undefined)');
	}

	// 計算核は共有 util へ委譲(Issue #21。検証・境界・メッセージは本モジュールの公開 API 互換のため自前のまま)。
	return unsignedAngleFromVectors(a, b);
}
