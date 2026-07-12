import { approximatelyZero } from './compare.js';

// 二次関数(頂点形式) y = a*(x-p)^2 + q の純粋 TypeScript モデル
// (AGENTS.md §5: React/Mafs を一切 import しない)。
// linearFunction.ts / derivative.ts と同じ流儀: 非有限入力は境界で弾き (MATH_CONVENTIONS §3)、
// ゼロ除算になりうる箇所は専用の分岐 (RangeError) を用意する。MVP 1 と同じく「関数を選べる」
// 汎用 DSL は先行設計しない (rule of three) — a, p, q を直接引数に取る。

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (pythagoras.ts の assertFinitePoint / linearFunction.ts の assertFiniteNumber と同じ流儀)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 二次関数(頂点形式) y = a*(x-p)^2 + q の値。
 * a=0 は「二次関数ではない」退化ケースだが、この式自体は a=0 でも破綻せず有限値 q を返す
 * (MATH_CONVENTIONS §4: 退化入力は不正値ではなく明示的にハンドリングする)。a≠0 の強制は、
 * ゼロ除算を伴う completeSquare 側でのみ行う。
 */
export function evaluate(a: number, p: number, q: number, x: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(p, 'p');
	assertFiniteNumber(q, 'q');
	assertFiniteNumber(x, 'x');
	const dx = x - p;
	return a * dx * dx + q;
}

/**
 * 頂点の座標 (p, q)。この関数は a を引数に取る(evaluate/axisOfSymmetry とインターフェースを
 * 揃えるため)が、頂点の座標自体は a の値に関与しない。a は非有限値を静かに通さないための
 * 検証にのみ使う(yIntercept が a を検証にのみ使うのと同じ理由、linearFunction.ts 参照)。
 */
export function vertex(a: number, p: number, q: number): Point2 {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(p, 'p');
	assertFiniteNumber(q, 'q');
	return [p, q];
}

/**
 * 対称軸(x = p)。vertex と同様、a は検証にのみ使い計算には関与しない。
 */
export function axisOfSymmetry(a: number, p: number, q: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(p, 'p');
	assertFiniteNumber(q, 'q');
	return p;
}

/** 頂点形式のパラメータ (a, p, q)。 */
export interface VertexForm {
	readonly a: number;
	readonly p: number;
	readonly q: number;
}

/**
 * 標準形 y = a*x^2 + b*x + c を頂点形式 {a, p, q} へ変換する(平方完成)。
 *
 * 導出: a*x^2 + b*x + c = a*(x + b/(2a))^2 - b^2/(4a) + c なので、
 * p = -b/(2a), q = c - b^2/(4a)。
 *
 * a=0 のときの方針(根拠): a=0 は y=b*x+c という一次関数(または定数関数)であり、
 * a≠0 を要求する二次関数の定義から外れる質的に異なるケースである。p=-b/(2a) の計算式が
 * 分母 0 になり定義できないため、linearFunction.ts の xRoot(a=0)・derivative.ts の
 * differenceQuotient(h=0) と同じ方針で、MATH_CONVENTIONS §3「ゼロ除算になりうる箇所」として
 * RangeError を投げる。呼び出し側(UI 層)は a=0 を選べないよう制約するか、呼び出し前に
 * a の値を確認する。
 */
export function completeSquare(a: number, b: number, c: number): VertexForm {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	assertFiniteNumber(c, 'c');
	if (approximatelyZero(a, 1)) {
		throw new RangeError(
			`completeSquare is undefined for a=0: y=${b}*x+${c} is not a quadratic function (a≠0 required)`,
		);
	}
	const p = -b / (2 * a);
	const q = c - (b * b) / (4 * a);
	return { a, p, q };
}
