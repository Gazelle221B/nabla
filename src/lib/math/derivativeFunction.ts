import type { DifferentiableFunction } from './derivative.js';

// 導関数(点ごとの微分係数を集めた「新しい関数」)の純粋 TypeScript モデル
// (AGENTS.md §5: React/描画ライブラリを一切 import しない)。derivative.ts が確立した
// 「1点 a での微分係数=接線の傾き」の続きとして、多項式に限定した「係数規則による
// 厳密な導関数」を提供する。derivative.ts の differenceQuotient (割線の傾き、既存・独立経路)
// を検証相手として使う設計にする (この単元のテストで h→0 収束との突合に使う)。
//
// MVP 1 と同じ rule of three (DESIGN.md): 「任意の関数を扱える」DSL を先行設計せず、
// 多項式 (係数配列) という 1 つの表現に限定する。1記事で扱うのは x^2 / x^3 の2種のみ
// (関数切替は Experiment 層の UI 選択肢であり、ここでは任意次数の多項式係数を受け取るだけ)。

/**
 * 多項式の係数配列。coeffs[i] は x^i の係数 (昇べきの順、定数項が先頭)。
 * 例: f(x) = x^2 → [0, 0, 1]。f(x) = 3 (定数) → [3]。
 */
export type Polynomial = readonly number[];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (derivative.ts の assertFiniteNumber と同じ流儀。lib/math 内の各モジュールがそれぞれ
// 独立にこの極小ヘルパーを持つ既存の慣習に従う: lawOfSinesCosines.ts 等を参照)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 係数配列が「多項式」として意味を持つかを検証する。空配列(次数が定まらない)・非有限な
 * 係数(NaN/Infinity)はどちらも不正値として RangeError にする(MATH_CONVENTIONS §3)。
 * ゼロ係数自体は退化ではなく有効な値(例: [0, 0, 1] の先頭2つ)なので許可する。
 */
function assertValidPolynomial(coeffs: Polynomial, name: string): void {
	if (!Array.isArray(coeffs) || coeffs.length === 0) {
		throw new RangeError(`${name} must be a non-empty coefficient array, got ${JSON.stringify(coeffs)}`);
	}
	for (let i = 0; i < coeffs.length; i++) {
		assertFiniteNumber(coeffs[i], `${name}[${i}]`);
	}
}

/**
 * 多項式の x における値。ホーナー法(高次から順に result = result*x + coeffs[i])で評価する
 * (単純な累乗の総和より数値的に安定し、Math.pow の反復呼び出しも避けられる)。
 */
export function evaluatePoly(coeffs: Polynomial, x: number): number {
	assertValidPolynomial(coeffs, 'coeffs');
	assertFiniteNumber(x, 'x');
	let result = 0;
	for (let i = coeffs.length - 1; i >= 0; i--) {
		result = result * x + coeffs[i];
	}
	assertFiniteNumber(result, 'evaluatePoly(coeffs, x)');
	return result;
}

/**
 * 係数規則による厳密な導関数: f(x) = Σ aᵢ xⁱ の導関数は f'(x) = Σ (i・aᵢ) x^(i-1)。
 * 各項 aₙxⁿ を n・aₙx^(n-1) に置き換えるという教科書的な規則そのものをコード化したもので、
 * 数値微分(differenceQuotient)の近似ではなく「数学的真実」として扱う
 * (derivative.ts の DifferentiableFunction.derivative フィールドと同じ位置づけ、
 * MATH_CONVENTIONS §10 の「数学的真実と表示上の便宜の分離」と同じ思想)。
 *
 * 定数(coeffs.length === 1)の導関数は 0 の恒等関数になるため [0] を返す(空配列は
 * assertValidPolynomial が拒否するため、ゼロ多項式は長さ1の [0] という表現に統一する)。
 */
export function exactDerivativePoly(coeffs: Polynomial): Polynomial {
	assertValidPolynomial(coeffs, 'coeffs');
	if (coeffs.length === 1) {
		return [0];
	}
	const result: number[] = new Array(coeffs.length - 1);
	for (let i = 1; i < coeffs.length; i++) {
		result[i - 1] = i * coeffs[i];
	}
	return result;
}

/**
 * 係数配列を derivative.ts の DifferentiableFunction へ変換する。evaluate は evaluatePoly、
 * derivative は exactDerivativePoly の結果を evaluatePoly したもの(=係数規則による厳密値)。
 * これにより derivative.ts の differenceQuotient / derivativeAt / tangentLine 等を、
 * この単元の多項式に対してそのまま再利用できる(重複実装しない、タスクの厳守事項)。
 */
export function toDifferentiableFunction(coeffs: Polynomial): DifferentiableFunction {
	assertValidPolynomial(coeffs, 'coeffs');
	const derivCoeffs = exactDerivativePoly(coeffs);
	return {
		evaluate: (x: number) => evaluatePoly(coeffs, x),
		derivative: (x: number) => evaluatePoly(derivCoeffs, x),
	};
}
