// 相似・拡大縮小(中心拡大)の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// pythagoras.ts / linearFunction.ts / quadraticFunction.ts / trigonometry.ts と同じ流儀:
// 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、ゼロ除算になりうる箇所は専用の分岐を用意する。
//
// 相似の中心拡大(dilation)とは、中心 center と相似比(拡大縮小の比率)k を固定し、
// 任意の点 p を center + k·(p − center) へ写す変換である。中学3年の「相似」単元では、
// 図形を「相似の中心」から一定の比率で拡大・縮小したものとして導入する。

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (pythagoras.ts の assertFinitePoint / linearFunction.ts の assertFiniteNumber と同じ流儀)。
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
 * 相似の中心 center から相似比 k で点 p を拡大・縮小した点: center + k·(p − center)。
 *
 * k=0 の方針(根拠、MATH_CONVENTIONS §4 退化ケース): k=0 のとき、どんな点 p を渡しても
 * center + 0·(p − center) = center となり、すべての点が中心 1 点へ押しつぶされる
 * (三角形であれば面積 0・辺の長さ 0 の「点」に退化する)。これは「不正値」ではなく、
 * 拡大縮小が極端に縮んだ結果として数学的に意味のある退化ケースなので、例外を投げず
 * center をそのまま返す(distance・triangleArea 側も 0 という有効な値を返す)。
 * ただし呼び出し側で「相似比」を辺の比・面積比として逆算する(距離や面積で割る)場合、
 * k=0 の結果同士を比較すると 0/0 のゼロ除算になりうる点に注意すること——本モジュールの
 * scaleFrom/distance/triangleArea 自体はそのような除算を行わないため、ここでは破綻しない。
 */
export function scaleFrom(center: Point2, k: number, p: Point2): Point2 {
	assertFinitePoint(center, 'center');
	assertFiniteNumber(k, 'k');
	assertFinitePoint(p, 'p');
	return [center[0] + k * (p[0] - center[0]), center[1] + k * (p[1] - center[1])];
}

/** 2点間のユークリッド距離。 */
export function distance(a: Point2, b: Point2): number {
	assertFinitePoint(a, 'a');
	assertFinitePoint(b, 'b');
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	return Math.hypot(dx, dy);
}

/**
 * 3点 a, b, c を頂点とする三角形の符号なし面積(シューレース公式の絶対値)。
 * 3点が同一直線上にある(共線)、または2点が一致する退化三角形では 0 を返す
 * (例外を投げない、MATH_CONVENTIONS §4)。
 */
export function triangleArea(a: Point2, b: Point2, c: Point2): number {
	assertFinitePoint(a, 'a');
	assertFinitePoint(b, 'b');
	assertFinitePoint(c, 'c');
	const cross = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
	return Math.abs(cross) / 2;
}
