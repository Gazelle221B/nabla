import { approximatelyZero } from './compare.js';

// 微分係数・接線・割線の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを一切 import しない)。
// MVP 1 は「関数を選ぶ」汎用 DSL を先行設計しない (rule of three, DESIGN.md)。呼び出し側が
// evaluate (関数値) と derivative (既知の閉じた式による導関数) を渡す 1 関数専用モデルとして扱う。

export type UnaryFunction = (x: number) => number;

/**
 * 微分可能な関数の表現。derivative は数値微分の近似ではなく、呼び出し側が既知の
 * 閉じた式(例: f(x)=x^2 なら f'(x)=2x)として渡す「数学的真実」である
 * (MATH_CONVENTIONS.md §10: 数学的真実と表示上の便宜の分離と同じ思想。
 * ここでは「真の微分係数」と「割線から近似した傾き」を型として区別する)。
 */
export interface DifferentiableFunction {
	readonly evaluate: UnaryFunction;
	readonly derivative: UnaryFunction;
}

/** 直線 y = slope * x + intercept */
export interface Line {
	readonly slope: number;
	readonly intercept: number;
}

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

// label は呼び出し側の式 (例: 'x + h') をエラーメッセージに反映するためのもの。
// 既定の 'x' 固定だと、differenceQuotient(fn, x, h) 内で x+h が非有限になったケースでも
// 「x が悪い」という誤解を招くメッセージになってしまうため、呼び出し側が渡せるようにする。
function evaluateAt(fn: DifferentiableFunction, x: number, label = 'x'): number {
	assertFiniteNumber(x, label);
	const y = fn.evaluate(x);
	assertFiniteNumber(y, `fn.evaluate(${label})`);
	return y;
}

/**
 * 差分商 (割線の傾き): (f(x+h) - f(x)) / h。
 * MATH_CONVENTIONS.md §3: ゼロ除算になりうる箇所は事前に分母がゼロに近いかを判定し、
 * 専用の分岐(ここでは RangeError)を用意する。h=0 は数学的に未定義(0/0)であり、
 * ゼロ長辺のような「有限値を返す退化ケース」(§4)とは異なる。
 */
export function differenceQuotient(fn: DifferentiableFunction, x: number, h: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(h, 'h');
	if (approximatelyZero(h, 1)) {
		throw new RangeError(`h must be non-zero (got h=${h})`);
	}
	const y0 = evaluateAt(fn, x, 'x');
	const y1 = evaluateAt(fn, x + h, 'x + h');
	return (y1 - y0) / h;
}

/** 微分係数(点 x における真の瞬間の変化率)。fn.derivative の値を境界検査つきで取り出す。 */
export function derivativeAt(fn: DifferentiableFunction, x: number): number {
	assertFiniteNumber(x, 'x');
	const slope = fn.derivative(x);
	assertFiniteNumber(slope, 'fn.derivative(x)');
	return slope;
}

/** 直線上の y 座標。 */
export function evaluateLine(line: Line, x: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(line.slope, 'line.slope');
	assertFiniteNumber(line.intercept, 'line.intercept');
	return line.slope * x + line.intercept;
}

/**
 * 2 点 (x0, f(x0)), (x1, f(x1)) を通る割線 (secant line)。
 * x0 と x1 が実質的に同じ点だと傾きが未定義になるため RangeError にする。
 */
export function secantLine(fn: DifferentiableFunction, x0: number, x1: number): Line {
	assertFiniteNumber(x0, 'x0');
	assertFiniteNumber(x1, 'x1');
	if (approximatelyZero(x1 - x0, 1)) {
		throw new RangeError(`x0 and x1 must differ (got x0=${x0}, x1=${x1})`);
	}
	const y0 = evaluateAt(fn, x0, 'x0');
	const slope = differenceQuotient(fn, x0, x1 - x0);
	return { slope, intercept: y0 - slope * x0 };
}

/** 点 x における接線 (tangent line): 傾きは真の微分係数、切片は接点 (x, f(x)) を通るよう定める。 */
export function tangentLine(fn: DifferentiableFunction, x: number): Line {
	const y = evaluateAt(fn, x);
	const slope = derivativeAt(fn, x);
	return { slope, intercept: y - slope * x };
}
