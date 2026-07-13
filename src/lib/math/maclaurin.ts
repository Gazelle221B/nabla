// マクローリン展開(テイラー展開の x=0 版)による多項式近似の純粋 TypeScript モデル
// (AGENTS.md §5: React/描画ライブラリを一切 import しない)。
//
// この単元の中核体験: 接線(1次近似、derivative-tangent-line の続き)の考え方を延長し、
// 近似多項式 P_n(x) = Σ_{k=0}^{n} coeff(k)・x^k の次数 n を上げていくと、曲線 f(x) に
// どこまで寄り添えるかを発見する。sin/cos/exp は収束半径が無限大(実数全体でいつか必ず
// 近づく)だが、log1p(x) = ln(1+x) は収束半径 1 しか持たず、|x|>1 では次数を上げるほど
// かえって誤差が拡大する——「次数を上げれば、どんな関数でも、どんな x でも
// いくらでも良く近似できる」という素朴な予想が破綻する反例を、この1つのモジュールの
// 中に同居させる設計にする(rule of three: 4関数を1つの表現(係数規則の切替)で扱う)。

export type MaclaurinFunction = 'sin' | 'cos' | 'exp' | 'log1p';

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (derivative.ts / derivativeFunction.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ
// 独立にこの極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * k(係数の次数・項数)は非負整数であること。マクローリン係数・部分和の項数は
 * 「x^k の指数」または「足し合わせた項の個数」という自然数的な量であり、負や非整数は
 * 意味を持たない(sequenceLimits.ts の assertValidPartialSumCount と同じ発想)。
 */
function assertNonNegativeInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
	}
}

/**
 * k! を逐次積で計算する(k は実用上高々20程度を想定——この単元の UI は次数 0〜12 のみを
 * 扱うため、k=13 以降の階乗(exactValue との誤差評価に使う剰余上界のテストで最大 k=11
 * 程度まで)でも double 精度で問題なく扱える範囲に収まる)。
 */
function factorial(k: number): number {
	let result = 1;
	for (let i = 2; i <= k; i++) {
		result *= i;
	}
	return result;
}

/**
 * マクローリン級数(x=0 まわりのテイラー展開)の x^k の係数。
 *
 * - sin: k が奇数のとき (-1)^((k-1)/2) / k!、k が偶数のときは 0(sin は奇関数なので
 *   偶数次の項を持たない)。
 * - cos: k が偶数のとき (-1)^(k/2) / k!、k が奇数のときは 0(cos は偶関数)。
 * - exp: 1/k!(全ての次数に項を持つ、自分自身の導関数という性質の直接的な帰結)。
 * - log1p (ln(1+x)): k=0 のとき 0(ln(1+0)=0)、k≥1 のとき (-1)^(k+1)/k
 *   (交代調和級数型の係数。この係数だけを見ても収束半径が有限であることは分からないが、
 *   下記 exactValue との突合テストで |x|>1 での発散が現れる)。
 */
export function maclaurinCoefficient(fn: MaclaurinFunction, k: number): number {
	assertNonNegativeInteger(k, 'k');
	switch (fn) {
		case 'sin':
			if (k % 2 === 0) return 0;
			return (-1) ** ((k - 1) / 2) / factorial(k);
		case 'cos':
			if (k % 2 !== 0) return 0;
			return (-1) ** (k / 2) / factorial(k);
		case 'exp':
			return 1 / factorial(k);
		case 'log1p':
			if (k === 0) return 0;
			return (-1) ** (k + 1) / k;
		default: {
			// 網羅性ガード(fn は型で保証されるが、frontmatter 等の外部由来値に備える)。
			const exhaustiveCheck: never = fn;
			throw new RangeError(`Unknown maclaurin function: ${String(exhaustiveCheck)}`);
		}
	}
}

/**
 * 次数 degree までの部分和(近似多項式) P_degree(x) = Σ_{k=0}^{degree} coeff(k)・x^k を、
 * x^k を毎回1つずつ掛けて積み上げるループ加算で計算する(ホーナー法ではなく、この単元の
 * 「1項ずつ足し合わせていく」という中核体験——次数を1つ上げるたびに1項加わる——と
 * 直接対応させるための意図的な選択)。
 */
export function maclaurinPartialSum(fn: MaclaurinFunction, degree: number, x: number): number {
	assertNonNegativeInteger(degree, 'degree');
	assertFiniteNumber(x, 'x');
	let sum = 0;
	let xPower = 1; // x^0
	for (let k = 0; k <= degree; k++) {
		sum += maclaurinCoefficient(fn, k) * xPower;
		xPower *= x;
	}
	assertFiniteNumber(sum, 'maclaurinPartialSum(fn, degree, x)');
	return sum;
}

/**
 * 真の値 f(x)(近似ではない、独立実装のオラクル)。sin/cos/exp/log1p はいずれも
 * Math.sin/cos/exp/log1p というマクローリン級数の展開・打ち切りとは別の(ブラウザ/Node の
 * 数値計算ライブラリによる)実装経路であり、maclaurinPartialSum との突合において
 * 「同じ式へ戻すだけの自己確認」にならない独立した検証相手になる(C-7)。
 *
 * log1p(x) = ln(1+x) は 1+x>0(x>-1)でなければ定義されない。x=-1 では ln(0) で
 * 発散し、x<-1 では真数が負になり定義できないため、x≤-1 は RangeError にする
 * (MATH_CONVENTIONS §3: 非有限や未定義をサイレントに伝播させない)。
 */
export function exactValue(fn: MaclaurinFunction, x: number): number {
	assertFiniteNumber(x, 'x');
	switch (fn) {
		case 'sin':
			return Math.sin(x);
		case 'cos':
			return Math.cos(x);
		case 'exp':
			return Math.exp(x);
		case 'log1p':
			if (x <= -1) {
				throw new RangeError(`exactValue('log1p', x) requires x > -1, got x=${x}`);
			}
			return Math.log1p(x);
		default: {
			const exhaustiveCheck: never = fn;
			throw new RangeError(`Unknown maclaurin function: ${String(exhaustiveCheck)}`);
		}
	}
}
