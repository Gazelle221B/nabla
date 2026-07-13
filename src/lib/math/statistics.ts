// データの分析(平均・分散・相関)の純粋 TypeScript モデル (AGENTS.md §5: React/Mafs を
// 一切 import しない)。compare.ts (MATH_CONVENTIONS §2) のスケール相対誤差ヘルパーを、
// 相関係数の分母(標準偏差の積)が実質ゼロかどうかの判定にのみ使う。
//
// この単元の中核体験:
//   (1) 散布図上の1点(外れ値)を動かすと、平均・分散・相関係数がどう変化するかを発見する。
//   (2) 相関係数 r は「直線的な関係の強さ」だけを測る量であり、|r| が1に近いほど点が
//       直線に乗っていることを表す。
//
// 分散の定義は Σ(x−x̄)²/n(n で割る)を採用する。高校数学Iの教科書的な定義であり、
// 大学教養で扱う不偏分散(n−1 で割る、標本から母分散を推定するための補正)とは異なる
// (数学Iの範囲を超える不偏分散はこの単元では扱わない)。

import { approximatelyZero } from './compare.js';

/** 散布図上の1点 (x, y)。他の lib/math モジュールと同じ規約 (MATH_CONVENTIONS §6): タプル
 *  + readonly。ここでは平均・分散などが xs・ys の2本の数値配列に対して定義されるため、
 *  Point2 自体は Scene/Island 層が散布図の点を表現する際に使う補助的な型として公開する。 */
export type Point2 = readonly [number, number];

// MATH_CONVENTIONS §3: 非有限入力はサイレントに伝播させず、境界(この関数群の入口)で
// 事前条件違反として例外にする。空配列も「代表値が定義できない」ため同様に RangeError とする
// (MATH_CONVENTIONS §4 の「退化ケースは明示的にハンドリングする」の対象は変数の値であって、
// 空データという入力そのものの正当性ではない——長さ0の標本から平均は求まらない)。
function assertNonEmptyFinite(xs: readonly number[], name: string): void {
	if (xs.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`);
	}
	for (const x of xs) {
		if (!Number.isFinite(x)) {
			throw new RangeError(`${name} must contain only finite numbers, got ${x}`);
		}
	}
}

function assertSameLength(xs: readonly number[], ys: readonly number[]): void {
	if (xs.length !== ys.length) {
		throw new RangeError(`xs and ys must have the same length, got ${xs.length} and ${ys.length}`);
	}
}

/**
 * 平均 x̄ = (Σxᵢ) / n。
 * n=1(点1つ)は「平均=その値」という有効な退化例であり、例外を投げない
 * (MATH_CONVENTIONS §4)。n=0(空配列)は代表値が定義できないため RangeError。
 */
export function mean(xs: readonly number[]): number {
	assertNonEmptyFinite(xs, 'xs');
	let sum = 0;
	for (const x of xs) sum += x;
	return sum / xs.length;
}

/**
 * 分散 = Σ(xᵢ−x̄)² / n(母集団分散・n で割る定義。数学Iの教科書的定義)。
 * n=1 のときは偏差が常に0なので分散0という有効な退化例(例外にしない)。
 */
export function variance(xs: readonly number[]): number {
	assertNonEmptyFinite(xs, 'xs');
	const m = mean(xs);
	let sumSquaredDeviation = 0;
	for (const x of xs) {
		const deviation = x - m;
		sumSquaredDeviation += deviation * deviation;
	}
	return sumSquaredDeviation / xs.length;
}

/** 標準偏差 = √分散。分散は常に0以上(2乗和/nのため負にならない)なので Math.sqrt は安全。 */
export function standardDeviation(xs: readonly number[]): number {
	return Math.sqrt(variance(xs));
}

/**
 * 共分散 = Σ(xᵢ−x̄)(yᵢ−ȳ) / n。xs・ys は対応する点の列なので長さが一致していなければならない
 * (長さ不一致は「どの y がどの x に対応するか」が決まらない不正入力として RangeError)。
 */
export function covariance(xs: readonly number[], ys: readonly number[]): number {
	assertNonEmptyFinite(xs, 'xs');
	assertNonEmptyFinite(ys, 'ys');
	assertSameLength(xs, ys);
	const mx = mean(xs);
	const my = mean(ys);
	let sum = 0;
	for (let i = 0; i < xs.length; i++) {
		sum += (xs[i] - mx) * (ys[i] - my);
	}
	return sum / xs.length;
}

/**
 * データの散らばりの大きさ(x²と同じ次元・オーダーの量)を、分散そのものを経由せず xs から
 * 直接求める。相関係数の分母(標準偏差の積)が実質ゼロかどうかを判定する際の
 * スケール(MATH_CONVENTIONS §2)として使う。
 *
 * 設計判断: スケールに variance(xs) 自身を使うと「値がゼロに近いかを値自身に対する相対誤差で
 * 判定する」循環になり、退化ケースの検出力が薄まる。代わりに xs の値域の幅(最大−最小)の2乗を
 * 使う——これは分散と同じ「x²のオーダー」を持つが、平均や分散の計算を経由しない独立な量であり、
 * かつ大きな共通オフセット(例: 全点が100万前後に集まっている)があっても、実際の散らばりの
 * 大きさだけを反映する(E[x²]のような二乗平均をスケールに使うと、オフセットが大きいだけの
 * データで実際には無視できない分散まで「ほぼゼロ」と誤判定しかねないため採用しない)。
 */
function spreadScale(xs: readonly number[]): number {
	let lo = xs[0];
	let hi = xs[0];
	for (const x of xs) {
		if (x < lo) lo = x;
		if (x > hi) hi = x;
	}
	const range = hi - lo;
	return range * range;
}

/**
 * 相関係数 r = cov(xs, ys) / (sd(xs) × sd(ys))。
 *
 * 戻り値が number | null である理由: 分母 sd(xs)×sd(ys) が実質ゼロになるのは、xs または ys の
 * 全点が(実質的に)同一値の場合(定数列は分散0)。このとき r は 0/0 で数学的に定義されない。
 * この状態(たとえば散布図で全ての点が同じx座標に重なる、すなわち縦一直線に並ぶ)は、
 * 不正な入力ではなく UI 上到達可能で意味の明確な状態である(縦一直線には「傾き」も
 * 「直線的な関係の強さ」も定義しようがない、という数学的に正しい事実そのもの)。そのため
 * RangeError(事前条件違反)ではなく、安全な値として null を返す
 * (MATH_CONVENTIONS §4「退化ケースは明示的にハンドリングし、例外を投げて処理を止めない」の
 * 精神に沿う。ただし退化の結果は「有限値に丸め込む」のではなく「未定義であることを明示する
 * null」とする——中途半端な数値(例えば0)を返すと、読者が「相関がない」という誤った数学的
 * 結論を読み取ってしまうため)。
 *
 * ゼロ判定は「分散が exact に 0 かどうか」ではなく、スケール相対誤差(spreadScale による
 * 独立なスケール)で行う。理由: 浮動小数点演算では、点をドラッグして得られる値が意図的に
 * 完全に同一のつもりでも、経路によっては丸め誤差でexact 0からわずかに逸れることがある
 * (MATH_CONVENTIONS §2)。分散という連続量そのものに「近さ」の概念を認めつつ、
 * 「全点同一」という UI 上明確な状態を確実に検出する。
 */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
	assertNonEmptyFinite(xs, 'xs');
	assertNonEmptyFinite(ys, 'ys');
	assertSameLength(xs, ys);

	const varX = variance(xs);
	const varY = variance(ys);

	if (approximatelyZero(varX, spreadScale(xs)) || approximatelyZero(varY, spreadScale(ys))) {
		return null;
	}

	const cov = covariance(xs, ys);
	return cov / Math.sqrt(varX * varY);
}
