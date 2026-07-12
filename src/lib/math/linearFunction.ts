import { approximatelyZero } from './compare.js';

// 一次関数 y = a*x + b の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を一切 import しない)。
// pythagoras.ts / derivative.ts と同じ流儀: 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、
// ゼロ除算になりうる箇所は専用の分岐 (RangeError) を用意する。MVP 1 と同じく「関数を選べる」
// 汎用 DSL は先行設計しない (rule of three) — a, b の 2 パラメータを直接引数に取る。

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (pythagoras.ts の assertFinitePoint / derivative.ts の assertFiniteNumber と同じ流儀)。
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

/** 一次関数 y = a*x + b の値。a が傾き、b が切片。 */
export function evaluate(a: number, b: number, x: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	assertFiniteNumber(x, 'x');
	return a * x + b;
}

/**
 * y 切片 (直線が y 軸と交わる点の y 座標、すなわち x=0 のときの y の値)。
 * y = a*x + b に x=0 を代入すると a*0=0 なので、値は常に b そのものになる。
 * この関数が a を引数に取るのは evaluate/xRoot と同じ「傾き a・切片 b」というインターフェースを
 * 揃えるためであり、a は非有限値を静かに通さないための検証にのみ使う(計算自体には関与しない)。
 */
export function yIntercept(a: number, b: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	return b;
}

/**
 * 2 点 (x1,y1), (x2,y2) を通る直線の傾き: (y2-y1)/(x2-x1)。
 * x1 と x2 が実質的に同じだと傾きが未定義(垂直線であり、x の関数として表せない)になるため、
 * derivative.ts の secantLine(x0 と x1 が同じ点だと傾きが未定義)と同じ方針で RangeError にする。
 */
export function slopeBetween(p1: Point2, p2: Point2): number {
	assertFinitePoint(p1, 'p1');
	assertFinitePoint(p2, 'p2');
	const dx = p2[0] - p1[0];
	if (approximatelyZero(dx, 1)) {
		throw new RangeError(
			`p1 and p2 must have different x-coordinates (got x1=${p1[0]}, x2=${p2[0]})`,
		);
	}
	return (p2[1] - p1[1]) / dx;
}

/**
 * y = a*x + b の x 切片(根): a*x + b = 0 を解いて x = -b/a。
 *
 * a=0 のときの方針(根拠): a=0 は水平線 y=b であり、傾きを持つ一次関数(a≠0)とは質的に異なる
 * 退化ケースである。
 *   - b=0 の場合: y=0 は x 軸そのものであり、すべての x が根になる(根が一意に定まらない)。
 *   - b≠0 の場合: 水平線 y=b は x 軸と交わらないため、根は存在しない。
 * どちらの場合も「唯一の数値としての根」を返すことができず、centinel 値(例: 0 や NaN)を
 * 返すと「根が無数にある」と「根が存在しない」という異なる状態の違いを呼び出し側から隠して
 * しまう。したがって a=0 は MATH_CONVENTIONS §3 の「ゼロ除算になりうる箇所」として扱い、
 * derivative.ts の differenceQuotient(h=0)・secantLine(x0=x1)と同じ方針で RangeError を
 * 投げ、2 つの退化ケースをメッセージで区別する。呼び出し側(UI 層)は a=0 を選べないよう
 * 制約するか、呼び出し前に a の値を確認する。
 */
export function xRoot(a: number, b: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	if (approximatelyZero(a, 1)) {
		if (approximatelyZero(b, 1)) {
			throw new RangeError(
				'xRoot is undefined for a=0, b=0: every x is a root (y=0 is the x-axis itself)',
			);
		}
		throw new RangeError(
			`xRoot is undefined for a=0, b=${b}: the horizontal line y=${b} never crosses the x-axis`,
		);
	}
	return -b / a;
}
