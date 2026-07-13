import { evaluatePoly, type Polynomial } from './derivativeFunction.js';
import { approximatelyZero } from './compare.js';

// リーマン和・厳密な定積分の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを
// 一切 import しない)。derivativeFunction.ts が確立した「多項式 (係数配列) に限定する」
// rule of three (DESIGN.md) を引き継ぎ、区分求積 (長方形近似) の合計面積が n を増やすほど
// 厳密な定積分値へ収束する、という発見体験を支える。
//
// evaluatePoly (多項式の値, derivativeFunction.ts) をそのまま再利用する (重複実装しない,
// タスク厳守事項)。exactIntegralPoly は evaluatePoly を経由せず、係数規則
// aₙ/(n+1)·x^(n+1) による「数学的真実」として独立に計算する
// (MATH_CONVENTIONS §10 と同じ思想: derivativeFunction.ts の exactDerivativePoly が
// 係数規則そのものをコード化したのと対になる関係)。riemannSumLeft (総和による近似, 独立経路)
// と exactIntegralPoly (係数規則, 独立経路) を突き合わせることで、C-7 (自己確認的テスト禁止)
// を満たす検証ができる設計にしてある。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (derivative.ts / derivativeFunction.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ
// 独立にこの極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 係数配列が「多項式」として意味を持つかを検証する (derivativeFunction.ts の
 * assertValidPolynomial と同じ規約。空配列・非有限係数はどちらも不正値として RangeError)。
 * このモジュールでは coeffs を evaluatePoly 経由で使わない場所 (exactIntegralPoly) もあるため、
 * 独自にこの検証を持つ (evaluatePoly の検証には常に頼れない)。
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
 * 積分区間 [lower, upper] の事前条件を検証する。非有限値はもちろん、lower と upper が
 * 実質的に同じ点 (区間の幅が実質ゼロ) の場合も、derivative.ts の secantLine が
 * x0 ≈ x1 を弾くのと同じ理由 (幅ゼロで長方形近似が退化し、割る n によらず意味を失う) で
 * approximatelyZero (MATH_CONVENTIONS §2, compare.ts) を使って弾く。その上で lower < upper
 * という向きそのもの (逆向きの区間は未対応, タスク厳守事項) を検証する。
 */
function assertValidInterval(lower: number, upper: number): void {
	assertFiniteNumber(lower, 'lower');
	assertFiniteNumber(upper, 'upper');
	if (approximatelyZero(upper - lower, 1)) {
		throw new RangeError(`lower and upper must differ (got lower=${lower}, upper=${upper})`);
	}
	if (upper < lower) {
		throw new RangeError(`lower must be < upper, got lower=${lower}, upper=${upper}`);
	}
}

/** 長方形の本数 n の事前条件: 正の整数であること (0本・負の本数・非整数本は無意味)。 */
function assertValidCount(n: number): void {
	assertFiniteNumber(n, 'n');
	if (!Number.isInteger(n) || n <= 0) {
		throw new RangeError(`n must be a positive integer, got ${n}`);
	}
}

/**
 * 左端点リーマン和 (left Riemann sum): 区間 [lower, upper] を n 等分し、各小区間の
 * 左端点での関数値を高さとする長方形 n 本の面積の合計。
 *
 * Σ_{i=0}^{n-1} f(lower + i·width) · width,  width = (upper - lower) / n
 *
 * これは「長方形の本数を増やすと合計面積が定積分の値へ収束する」という区分求積の
 * 中核体験そのものの計算経路 (総和) であり、exactIntegralPoly (係数規則という別の経路)
 * との突合が不変条件テストの核 (C-7: 自己確認的テスト禁止)。
 */
export function riemannSumLeft(coeffs: Polynomial, lower: number, upper: number, n: number): number {
	assertValidPolynomial(coeffs, 'coeffs');
	assertValidInterval(lower, upper);
	assertValidCount(n);

	const width = (upper - lower) / n;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const x = lower + i * width;
		sum += evaluatePoly(coeffs, x) * width;
	}
	assertFiniteNumber(sum, 'riemannSumLeft(coeffs, lower, upper, n)');
	return sum;
}

/**
 * 多項式 f(x) = Σ aᵢxⁱ の [lower, upper] における厳密な定積分。係数規則
 * ∫ aᵢxⁱ dx = aᵢ/(i+1)·x^(i+1) をそのままコード化したもので、区分求積のような近似
 * (riemannSumLeft) ではなく「数学的真実」として扱う
 * (derivativeFunction.ts の exactDerivativePoly, MATH_CONVENTIONS §10 と同じ位置づけ)。
 *
 * ∫_lower^upper aᵢxⁱ dx = aᵢ/(i+1) · (upper^(i+1) - lower^(i+1))  を各項について足し合わせる。
 */
export function exactIntegralPoly(coeffs: Polynomial, lower: number, upper: number): number {
	assertValidPolynomial(coeffs, 'coeffs');
	assertValidInterval(lower, upper);

	let sum = 0;
	for (let i = 0; i < coeffs.length; i++) {
		const power = i + 1;
		sum += (coeffs[i] / power) * (upper ** power - lower ** power);
	}
	assertFiniteNumber(sum, 'exactIntegralPoly(coeffs, lower, upper)');
	return sum;
}
