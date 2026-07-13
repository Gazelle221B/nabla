// 数列(等差数列・等比数列)の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを
// 一切 import しない)。この単元の中核体験: 点列 (n, aₙ) を並べたとき、等差数列は一次関数
// (前単元 algebra/linear-function, prerequisite) と同じ「まっすぐ」並び、等比数列は指数的に
// 「曲がって」並ぶ、という視覚的な違いを発見させる。
//
// n(項番号)は 1 始まりの正整数のみを受け付ける(数列の項番号という意味を持つ値であり、
// 0 番目・負の番目・小数番目は無意味なので RangeError にする。riemannSum.ts の n(長方形の
// 本数)と同じ流儀)。
//
// 退化ケースの方針(MATH_CONVENTIONS.md §4): 公差 d=0(定数列)・公比 r=0・a1=0 は
// 「不正値」ではなく「有効な退化例」として扱い、項の値が単に 0 や一定値になるだけで
// 例外を投げない。r=0 のとき、第1項は a1・第2項以降は 0 になる(0 の 0 乗は数学的に
// 曖昧な値だが、JavaScript の `0 ** 0 === 1` という仕様上の既定に従う。これは
// geometricTerm(a1, 0, 1) = a1 * 0**0 = a1 * 1 = a1(第1項が a1 そのものである、という
// 定義上必ず成り立つべき性質)と一致するため、この単元の意味論と矛盾しない)。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (riemannSum.ts / derivative.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** 項番号 n の事前条件: 正の整数であること(0番目・負の番目・非整数番目は無意味)。 */
function assertValidTermIndex(n: number): void {
	assertFiniteNumber(n, 'n');
	if (!Number.isInteger(n) || n <= 0) {
		throw new RangeError(`n must be a positive integer, got ${n}`);
	}
}

/**
 * 等差数列の第 n 項: aₙ = a1 + (n−1)d。
 * a1(初項)・d(公差)は任意の有限実数(d=0 は定数列という有効な退化例)。
 */
export function arithmeticTerm(a1: number, d: number, n: number): number {
	assertFiniteNumber(a1, 'a1');
	assertFiniteNumber(d, 'd');
	assertValidTermIndex(n);

	const result = a1 + (n - 1) * d;
	assertFiniteNumber(result, 'arithmeticTerm(a1, d, n)');
	return result;
}

/**
 * 等比数列の第 n 項: aₙ = a1・r^(n−1)。
 * a1(初項)・r(公比)は任意の有限実数。r=0(第2項以降が0になる)・a1=0(全項0)・
 * r<0(符号が交互に反転する)はいずれも有効な退化例として扱い、値をそのまま返す
 * (ファイル冒頭コメント参照)。
 */
export function geometricTerm(a1: number, r: number, n: number): number {
	assertFiniteNumber(a1, 'a1');
	assertFiniteNumber(r, 'r');
	assertValidTermIndex(n);

	const result = a1 * r ** (n - 1);
	assertFiniteNumber(result, 'geometricTerm(a1, r, n)');
	return result;
}

/**
 * 等差数列の初項から第 n 項までの和: Sₙ = n(2a1 + (n−1)d) / 2。
 * ガウスの逆順和(先頭+末尾・2番目+末尾から2番目…がすべて 2a1+(n-1)d で一定になる)を
 * n/2 組足し合わせた公式そのものであり、arithmeticTerm を n 回ループ加算する経路とは
 * 独立した計算経路(この式は arithmeticTerm を呼ばない)。テスト側でこの2経路を突合する。
 */
export function arithmeticSum(a1: number, d: number, n: number): number {
	assertFiniteNumber(a1, 'a1');
	assertFiniteNumber(d, 'd');
	assertValidTermIndex(n);

	const result = (n * (2 * a1 + (n - 1) * d)) / 2;
	assertFiniteNumber(result, 'arithmeticSum(a1, d, n)');
	return result;
}
