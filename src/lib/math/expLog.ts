import { approximatelyZero } from './compare.js';

// 指数関数 y=a^x と対数関数 y=log_a(x) の純粋 TypeScript モデル
// (AGENTS.md §5: React/Mafs を一切 import しない)。
//
// この単元の中核体験: 底 a を固定して指数関数 y=a^x のグラフを描くと、対数関数 y=log_a(x) の
// グラフは常にそれを直線 y=x に関して鏡映したものになる。これは偶然の図形的一致ではなく、
// 「a を何乗したら x になるか」という**逆の問い**——log_a(x) の定義そのもの——から必然的に
// 導かれる。往復 a^(log_a x)=x / log_a(a^t)=t を観察することで、この「逆関数」という関係を
// 数値の一致として確かめられる(数II の範囲。自然対数 e・ln は数III のため使わない——
// 底は常に UI から与えられる一般の a、または記事内の常用対数 log_10 に限定する)。

/**
 * 非有限入力を事前条件違反として例外にする (MATH_CONVENTIONS.md §3)。
 *
 * quadraticEquation.ts / linearTransformation.ts / eigen.ts と同じ流儀で、モジュールをまたいだ
 * 共有はせず各モジュールが自身の検証ヘルパーを持つ (既存の流儀を踏襲)。a の「1に近いか」の
 * 判定は compare.ts の approximatelyZero を使う (下記 logBase のコメント参照)。
 */
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 指数関数 y = a^x を評価する。
 *
 * 定義域: a > 0(真に数学的な境界)。指数関数は底が正でなければ実数値関数として矛盾なく
 * 定義できない(例: a=-2, x=1/2 は実数の範囲で値を持たない)ため、a ≤ 0 は近傍表示ではなく
 * 常に RangeError にする。a=1(すべての x で 1 になる退化ケース)は expBase 自体の計算では
 * 何の問題も起きない(1^x=1 は有限かつ well-defined)ため、ここでは a≠1 を要求しない——
 * a≠1 が必要になるのは対数の除算 (log(x)/log(a)) 側の都合であり、logBase 側でのみ弾く
 * (下記コメント参照)。x は任意の有限実数を許す(指数は負・0・正すべてで定義される)。
 */
export function expBase(a: number, x: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(x, 'x');
	if (a <= 0) {
		throw new RangeError(`expBase requires a positive base a>0, got a=${a}`);
	}
	return Math.pow(a, x);
}

/**
 * 対数関数 y = log_a(x) = ln(x)/ln(a) を評価する。
 *
 * 定義域: a > 0 ∧ a ≠ 1 ∧ x > 0(すべて数学的に真に未定義な境界のみを弾く。連続量として
 * 「0に近い」ケースを近似的に許容する話ではない——例えば x=1e-9 は正の実数として well-defined
 * な対数を持ち、UIの近傍表示の話とは別問題)。
 *
 * a>0 と x>0 は exact な境界判定(a≤0 / x≤0 で RangeError)にする。この2つは「わずかに
 * 越えても数値が不安定になる」という性質を持たず、単に真の数学的境界(対数の底・真数の
 * 定義域そのもの)なので、approximatelyZero の緩和を入れる理由がない。
 *
 * 一方 a≠1 の判定だけは **approximatelyZero(a-1, 1) による近傍判定**を採用する(exact a=1
 * だけを弾く方式は採らない)。理由: quadraticEquation.ts の discriminant() が a≈0(二次方程式で
 * なくなる質的に異なるケース)を approximatelyZero で弾いたのと同じ構造の判断——a=1 ちょうど
 * だけを RangeError にしても、a=1+1e-13 のような「ほぼ1」の底は素通りしてしまい、
 * log(a)=Math.log(1+1e-13)≈1e-13 という極小値で ln(x)/ln(a) を割ることになる。この除算は
 * わずかな x の違いを巨大な出力差に増幅する(例: x=2 と x=2.001 で log_a の差が万倍に
 * 拡大する)ため、「値としては有限だが実用上無意味に不安定」という結果を返してしまう。
 * これは D=0 の分類境界(quadraticEquation.ts の realRoots、exact zero を使うべき箇所)とは
 * 性質が違う——あちらは「解の個数」という離散分類の際どい境界を鈍らせないために exact が
 * 必要だったが、こちらは離散分類ではなく除算の分母が0に潰れることによる数値爆発そのものを
 * 防ぎたいので、分母側の「実質ゼロ」を approximatelyZero で捉えるのが目的に合致する。
 * UI 側でも a のスライダー可動域を [1.2, 4] とし a=1 近傍を構造的に除外する
 * (ExpLogExperiment.tsx 参照)ため、この分岐は主に UI 到達不能な境界・不変条件テストの
 * 安全網として働く。
 */
export function logBase(a: number, x: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(x, 'x');
	if (a <= 0) {
		throw new RangeError(`logBase requires a positive base a>0, got a=${a}`);
	}
	if (approximatelyZero(a - 1, 1)) {
		throw new RangeError(
			`logBase requires a base a≠1 (log(a)≈0 would cause division blow-up), got a=${a}`,
		);
	}
	if (x <= 0) {
		throw new RangeError(`logBase requires x>0 (logarithm undefined for x<=0), got x=${x}`);
	}
	return Math.log(x) / Math.log(a);
}
