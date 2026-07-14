// 符号なし角度計算の共有ジオメトリユーティリティ (純粋 TypeScript, AGENTS.md §5:
// React/Mafs 等の描画ライブラリを一切 import しない)。
//
// 背景 (Issue #21): `Math.atan2(|外積|, 内積)` による符号なし角の計算は、当初
// inscribedAngle.ts の angleAtVertex / lawOfSinesCosines.ts の angleAtVertex /
// dotProduct.ts の angleBetween の3箇所に独立実装されていた。PR #20 (dotProduct.ts
// 実装時) の時点で rule of three (3箇所目の出現で初めて共通化を検討する) に到達したが、
// 既存2単元の安定を壊さない外科的判断としてその場では先送りし、Issue #21 として
// 記録した。本モジュールはその共有化の受け皿であり、3モジュールはいずれも
// ここへ処理を委譲する (公開 API・シグネチャ・挙動は変更しない)。
//
// 角度の内部単位はラジアンで統一する (MATH_CONVENTIONS §5)。

import { approximatelyZero } from './compare.js';

export type Vec2 = readonly [number, number];
export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (lib/math 内の各モジュールが持つ assertFiniteNumber / assertFinitePoint と同じ流儀)。
function assertFiniteVec2(v: Vec2, name: string): void {
	if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
		throw new RangeError(`${name} must have finite components, got [${v[0]}, ${v[1]}]`);
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
 * 2ベクトル v1, v2 のなす角(符号なし、ラジアン、[0, π])。
 *
 * Math.acos(内積 / (|v1||v2|)) ではなく Math.atan2(|外積|, 内積) を使う方針(根拠。
 * inscribedAngle.ts / lawOfSinesCosines.ts / dotProduct.ts の3箇所に重複していたコメントを
 * Issue #21 でここへ集約):
 *
 * acos は入力が ±1 に近い(=角度が 0 または π に近い、v1 と v2 がほぼ同じ向き・正反対の向き)
 * 場合、割り算と acos の定義域境界付近での桁落ちにより誤差が拡大しやすい。本ライブラリが
 * 扱う単元(円周角の定理・正弦定理余弦定理・内積)はいずれも「ほぼ同じ向き」「正反対の向き」
 * に近い操作域を扱うため、外積・内積を割り算せずそのまま atan2 に渡すこの方式のほうが
 * 数値的に安定する。
 *
 * ゼロベクトル(v1 または v2 の大きさが実質0)は、向きを持たないため2ベクトルのなす角が
 * 数学的に定義できない。RangeError とする(MATH_CONVENTIONS §4: サイレントに NaN を
 * 伝播させない)。
 */
/**
 * 【計算核・検証なし】2ベクトルのなす角(符号なし、ラジアン、[0, π])を
 * Math.atan2(|外積|, 内積) で計算する。
 *
 * 事前条件: 呼び出し側が「成分は有限」「ゼロ長ベクトルでない」ことを検証済みであること
 * (この関数は検証しない)。既存3モジュール(inscribedAngle/lawOfSinesCosines/dotProduct)は
 * それぞれの公開 API 互換(ゼロ長判定のスケール定義・例外メッセージ)を守るために自前の
 * 検証を保持したまま、この計算核だけを共有する(GrokBuild レビュー指摘の反映: 検証まで
 * 共有すると点ベース API のゼロ長境界〔点の絶対座標スケール〕が変わってしまう)。
 */
export function unsignedAngleFromVectors(v1: Vec2, v2: Vec2): number {
	const dot = v1[0] * v2[0] + v1[1] * v2[1];
	const cross = v1[0] * v2[1] - v1[1] * v2[0];
	return Math.atan2(Math.abs(cross), dot);
}

export function unsignedAngleBetweenVectors(v1: Vec2, v2: Vec2): number {
	assertFiniteVec2(v1, 'v1');
	assertFiniteVec2(v2, 'v2');

	const len1 = Math.hypot(v1[0], v1[1]);
	const len2 = Math.hypot(v2[0], v2[1]);

	// ゼロ長判定はスケール相対誤差で行う (MATH_CONVENTIONS §2)。scale は比較対象と同じ次元
	// (座標の大きさ)の量を渡す。
	const scale1 = Math.max(1, Math.abs(v1[0]), Math.abs(v1[1]));
	const scale2 = Math.max(1, Math.abs(v2[0]), Math.abs(v2[1]));
	if (approximatelyZero(len1, scale1)) {
		throw new RangeError(
			'unsignedAngleBetweenVectors requires a non-zero vector v1 (zero vector has no direction, angle undefined)',
		);
	}
	if (approximatelyZero(len2, scale2)) {
		throw new RangeError(
			'unsignedAngleBetweenVectors requires a non-zero vector v2 (zero vector has no direction, angle undefined)',
		);
	}

	return unsignedAngleFromVectors(v1, v2);
}

/**
 * 頂点 vertex での符号なし角 ∠p1–vertex–p2 (ラジアン、[0, π])。頂点+2点版。
 *
 * vertex から p1・p2 へのベクトルを作り、unsignedAngleBetweenVectors に委譲する。
 * vertex が p1 または p2 と一致する(ベクトルがゼロ長になる)場合、角度そのものが定義
 * できないため RangeError とする(MATH_CONVENTIONS §4)。
 *
 * 注意(境界の定義): 本関数のゼロ長判定は差分ベクトルの成分スケールで行う。既存3単元の
 * angleAtVertex(点の絶対座標スケールで判定——巨大座標×近接点の桁落ち領域をより早く
 * 退化として弾く)とは境界が異なる新 API であり、互換の制約はない。単元モジュール側は
 * 従来どおり自前の判定を保持している。
 */
export function unsignedAngleAtVertex(vertex: Point2, p1: Point2, p2: Point2): number {
	assertFinitePoint(vertex, 'vertex');
	assertFinitePoint(p1, 'p1');
	assertFinitePoint(p2, 'p2');

	const v1: Vec2 = [p1[0] - vertex[0], p1[1] - vertex[1]];
	const v2: Vec2 = [p2[0] - vertex[0], p2[1] - vertex[1]];
	return unsignedAngleBetweenVectors(v1, v2);
}
