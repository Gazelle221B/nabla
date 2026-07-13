// 「大量試行 — 大数の法則と中心極限定理」の純粋 TypeScript モデル (AGENTS.md §5: React/Pixi.js
// を一切 import しない)。この単元の中核体験:
//   (1) 大数の法則: サイコロ k 個の和を n 回試行したときの標本平均が、試行回数 n を
//       増やしていくと期待値 3.5k へ吸い付いていく(probability.ts/probabilityDistribution.ts
//       で扱った「多数回試行→収束」の続き)。
//   (2) 中心極限定理: k を増やしていくと、和の分布の形が「平ら(k=1、一様)→三角形(k=2)→
//       釣鐘(k が大きい)」に変形し、正規分布へ近づいていく。
//
// この単元の独立オラクル: exactSumDistribution(k) は「サイコロ k 個の和の厳密分布」を
// 動的計画法(畳み込み)で求める。シミュレーション(simulateDiceSums)や正規近似の妥当性を
// 検証する基準として使う——シミュレーションや近似の結果を、シミュレーション自身や近似式に
// 戻して確認するような自己確認的な検証は行わない(AGENTS.md §3 C-7)。
//
// 数値精度の方針(MATH_CONVENTIONS.md §1: 任意精度演算・BigIntは導入しない):
// サイコロ k 個の和の場合の数の総数は 6^k 通りである。k の上限を 12(UIのスライダー上限と
// 一致)に取ると 6^12 = 2,176,782,336 であり、これは Number.isSafeInteger の上限
// (2^53 = 9,007,199,254,740,992)よりも十分小さい。本ファイル内の平均・分散の厳密有理数演算
// (makeRational 等)で扱う中間値(重み付き和・分散の分子分母)も、後述の各コメントで桁数を
// 見積もった通りすべて 2^53 未満に収まるため、通常の number 演算だけで「厳密」演算が成立し、
// BigInt を導入する必要がない。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (probability.ts / probabilityDistribution.ts と同じ流儀。lib/math 内の各モジュールが
// それぞれ独立にこの極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

function assertFiniteInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name} must be an integer, got ${value}`);
	}
}

// サイコロの個数 k の許容範囲。UI のスライダー仕様(1〜12)と一致させる。上限 12 は
// 「厳密畳み込みの場合の数(6^k)が Number.isSafeInteger に収まる」という数値的制約に加え、
// k=12 まで動かせば一様(k=1)→三角形(k=2)→釣鐘(k が大きい)という CLT の中核体験を
// 十分に観察できる、という教材上の理由による(k をさらに増やしても学習上の追加の発見はない)。
const K_MIN = 1;
const K_MAX = 12;

function assertValidK(k: number): void {
	assertFiniteInteger(k, 'k');
	if (k < K_MIN || k > K_MAX) {
		throw new RangeError(`k must be an integer in [${K_MIN}, ${K_MAX}], got ${k}`);
	}
}

// ---------------------------------------------------------------------------
// 厳密有理数演算(平均・分散の2経路突合を丸め誤差なしで行うための最小限の実装)。
// ---------------------------------------------------------------------------

/** 既約分数(分母は常に正)。教材の「厳密」計算を丸め誤差なしで表現するための型。 */
export interface Rational {
	readonly numerator: number;
	readonly denominator: number;
}

function gcd(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b !== 0) {
		const t = b;
		b = a % b;
		a = t;
	}
	return a;
}

/** numerator/denominator を既約分数(分母は正)にして返す。分母0はRangeError。 */
export function makeRational(numerator: number, denominator: number): Rational {
	assertFiniteInteger(numerator, 'numerator');
	assertFiniteInteger(denominator, 'denominator');
	if (denominator === 0) {
		throw new RangeError('denominator must not be 0');
	}
	const sign = denominator < 0 ? -1 : 1;
	const n = numerator * sign;
	const d = denominator * sign;
	const g = gcd(n, d) || 1;
	return { numerator: n / g, denominator: d / g };
}

/** 有理数を(丸め誤差を含む)浮動小数点数に変換する。表示・近似計算専用。 */
export function rationalToNumber(r: Rational): number {
	return r.numerator / r.denominator;
}

/**
 * 2つの有理数(いずれも makeRational で既約化済みであることを仮定)が厳密に等しいかを、
 * 交差乗算(a.numerator*b.denominator と b.numerator*a.denominator の比較)で判定する。
 * 既約分数同士の比較であるため、本モジュールが扱う範囲(k≤12)では交差乗算の結果も
 * 2^53 未満に収まる(分母・分子とも数百〜千程度、詳細はREADME相当のモジュール冒頭コメント)。
 */
export function rationalEquals(a: Rational, b: Rational): boolean {
	return a.numerator * b.denominator === b.numerator * a.denominator;
}

// ---------------------------------------------------------------------------
// 厳密分布(独立オラクル)
// ---------------------------------------------------------------------------

/** サイコロ k 個の和の厳密分布。counts[i] は和が (k+i) になる場合の数(i は 0..5k)。 */
export interface SumDistribution {
	readonly k: number;
	/** 和 s = k+i (i=0..5k) の場合の数。長さは常に 5k+1。 */
	readonly counts: readonly number[];
	/** 場合の数の総数。常に 6^k に一致する(この不変条件はテストで別経路から検証する)。 */
	readonly total: number;
}

/**
 * サイコロ k 個の和の厳密分布を、動的計画法(1個ずつ畳み込む)で求める。
 * この単元の独立オラクル: シミュレーション(simulateDiceSums)・正規近似(normalPdf 経由)の
 * どちらとも異なるコードパスで、場合の数を数え上げる。
 *
 * k は 1〜12 の整数であることを要求する(非有限・非整数・範囲外は RangeError)。
 */
export function exactSumDistribution(k: number): SumDistribution {
	assertValidK(k);

	// k=1: 和1〜6がそれぞれ1通り。
	let counts: number[] = [1, 1, 1, 1, 1, 1];

	for (let dice = 2; dice <= k; dice++) {
		const prevMin = dice - 1; // 直前(dice-1個)の和の最小値
		const nextMin = dice; // dice個になったときの和の最小値
		const nextMax = 6 * dice;
		const next = new Array<number>(nextMax - nextMin + 1).fill(0);
		for (let i = 0; i < counts.length; i++) {
			const ways = counts[i];
			if (ways === 0) continue;
			const sumSoFar = prevMin + i;
			for (let face = 1; face <= 6; face++) {
				next[sumSoFar + face - nextMin] += ways;
			}
		}
		counts = next;
	}

	const total = counts.reduce((a, b) => a + b, 0);
	return { k, counts, total };
}

// ---------------------------------------------------------------------------
// 平均・分散の2経路(公式 / 厳密分布からの計算)
// ---------------------------------------------------------------------------

/** 平均・分散(丸めた number と、丸めていない厳密有理数の両方を持つ)。 */
export interface MeanVariance {
	readonly mean: number;
	readonly variance: number;
	readonly meanExact: Rational;
	readonly varianceExact: Rational;
}

/**
 * 経路A(公式): サイコロ1個の和の期待値3.5・分散35/12 から、k個の和の期待値 7k/2・
 * 分散 35k/12 を厳密有理数で返す(和の期待値・分散の線形性・独立性による公式。導出は
 * 記事の「形式的な定義」で扱う)。
 */
export function sumMeanVariance(k: number): MeanVariance {
	assertValidK(k);
	const meanExact = makeRational(7 * k, 2);
	const varianceExact = makeRational(35 * k, 12);
	return {
		mean: rationalToNumber(meanExact),
		variance: rationalToNumber(varianceExact),
		meanExact,
		varianceExact,
	};
}

/**
 * 経路B(厳密分布からの計算): exactSumDistribution が返す場合の数から、平均・分散を
 * 厳密有理数演算で直接計算する(公式を経由しない独立した経路。C-7: sumMeanVariance と
 * この関数が一致することをテストで突合する——同じ式へ戻すだけの自己確認にしない)。
 *
 * 分散の計算は E[S^2]-E[S]^2 の素朴な差ではなく、既約化した平均(分母は高々2)を使って
 * Σ(s·meanDen - meanNum)^2·count(s) / (meanDen^2·total) の形で行う。理由: E[S^2]·total と
 * E[S]^2 の桁数がそれぞれ大きく(k=12でE[S^2]の重み付き和は約3.9×10^12)、これらを
 * total(約2.18×10^9)倍してから引き算すると中間値が2^53を超えてしまう
 * (約8.5×10^21)。既約化した小さい平均を使う経路なら中間値は約3×10^11に収まり、
 * 2^53未満のまま厳密に計算できる(モジュール冒頭コメント参照)。
 */
export function meanVarianceFromDistribution(dist: SumDistribution): MeanVariance {
	const { k, counts, total } = dist;
	if (!Number.isInteger(total) || total <= 0) {
		throw new RangeError(`dist.total must be a positive integer, got ${total}`);
	}

	let weightedSum = 0; // Σ s·count(s)
	for (let i = 0; i < counts.length; i++) {
		weightedSum += (k + i) * counts[i];
	}
	const meanExact = makeRational(weightedSum, total);
	const { numerator: meanNum, denominator: meanDen } = meanExact;

	let varianceNumeratorScaled = 0; // Σ (s·meanDen - meanNum)^2 · count(s)
	for (let i = 0; i < counts.length; i++) {
		const s = k + i;
		const diff = s * meanDen - meanNum;
		varianceNumeratorScaled += diff * diff * counts[i];
	}
	const varianceExact = makeRational(varianceNumeratorScaled, meanDen * meanDen * total);

	return {
		mean: rationalToNumber(meanExact),
		variance: rationalToNumber(varianceExact),
		meanExact,
		varianceExact,
	};
}

// ---------------------------------------------------------------------------
// 正規密度・正規近似の当てはまり具合
// ---------------------------------------------------------------------------

/** 正規分布の確率密度関数。sigma は正であることを要求する。 */
export function normalPdf(x: number, mu: number, sigma: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(mu, 'mu');
	assertFiniteNumber(sigma, 'sigma');
	if (sigma <= 0) {
		throw new RangeError(`sigma must be positive, got ${sigma}`);
	}
	const z = (x - mu) / sigma;
	return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// 標準正規分布の累積分布関数(erf の Abramowitz–Stegun 7.1.26 近似、最大誤差 ≤ 1.5e-7)。
// maxAbsDeviationFromNormal 内部でのみ使う近似計算であり、教材の数式(normalPdf)とは
// 独立した補助関数のため export しない。
function erf(x: number): number {
	const sign = x < 0 ? -1 : 1;
	const ax = Math.abs(x);
	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;
	const t = 1 / (1 + p * ax);
	const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
	return sign * y;
}

function standardNormalCdf(z: number): number {
	return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * 厳密分布(標準化)と正規近似(標準正規分布)の最大絶対偏差(コルモゴロフ–スミルノフ統計量に
 * 相当)。厳密分布の累積分布関数(階段関数、左極限・右極限の両方を見る)と標準正規分布の
 * 累積分布関数を比較し、その最大絶対差を返す。k を増やすと単調に縮む(中心極限定理の
 * 「近づく」を定量化した実測値。証明ではない——事前に node で計算し golden 固定して検証する)。
 *
 * 標準化に使う平均・分散は sumMeanVariance(公式、経路A)の値を使う
 * (meanVarianceFromDistribution と数学的に一致することは centralLimit.test.ts で別途検証済み)。
 */
export function maxAbsDeviationFromNormal(k: number): number {
	assertValidK(k);
	const dist = exactSumDistribution(k);
	const { mean, variance } = sumMeanVariance(k);
	const sigma = Math.sqrt(variance);

	let cumulative = 0;
	let maxDeviation = 0;
	for (let i = 0; i < dist.counts.length; i++) {
		const s = k + i;
		const cdfBefore = cumulative / dist.total; // F_n(s の直前)
		cumulative += dist.counts[i];
		const cdfAfter = cumulative / dist.total; // F_n(s)(sを含む)
		const target = standardNormalCdf((s - mean) / sigma);
		maxDeviation = Math.max(maxDeviation, Math.abs(cdfBefore - target), Math.abs(cdfAfter - target));
	}
	return maxDeviation;
}

// ---------------------------------------------------------------------------
// シミュレーション(大数の法則の体験)
// ---------------------------------------------------------------------------

/**
 * サイコロ k 個の和を n 回試行する。乱数は呼び出し側が用意した rng(probability.ts の
 * createRng(seed) を想定、Math.random は使わない)を受け取る——シード管理は呼び出し側
 * (React Island)の責務とし、この純粋関数は「rng を叩いて和の列を作る」ことだけを行う。
 *
 * 戻り値は長さ n の配列で、各要素は k 個のサイコロの和(k以上6k以下の整数)。
 * n=0 は「1回も試行しない」有効な退化例として空配列を返す(probability.ts の
 * simulateDice と同じ方針)。
 */
export function simulateDiceSums(rng: () => number, k: number, n: number): readonly number[] {
	if (typeof rng !== 'function') {
		throw new RangeError('rng must be a function');
	}
	assertValidK(k);
	assertFiniteInteger(n, 'n');
	if (n < 0) {
		throw new RangeError(`n must be a non-negative integer, got ${n}`);
	}

	const sums = new Array<number>(n);
	for (let trial = 0; trial < n; trial++) {
		let sum = 0;
		for (let die = 0; die < k; die++) {
			// rng() ∈ [0,1) なので Math.floor(rng()*6) ∈ {0,...,5}(出目1〜6に対応)。
			sum += Math.floor(rng() * 6) + 1;
		}
		sums[trial] = sum;
	}
	return sums;
}

/**
 * simulateDiceSums の結果(和の列)を、exactSumDistribution と同じ添字規約
 * (counts[i] = 和(k+i)の度数、長さ5k+1)で集計する。Pixi Scene のドットヒストグラムと
 * 観察表(標本平均等)の両方が、この集計結果を共有できるようにするための橋渡し関数。
 * 範囲外の和(k未満・6k超)が混入していた場合は数学モデルの不整合としてRangeError。
 */
export function sumFrequencies(sums: readonly number[], k: number): readonly number[] {
	assertValidK(k);
	const size = 5 * k + 1;
	const freqs = new Array<number>(size).fill(0);
	for (let i = 0; i < sums.length; i++) {
		const s = sums[i];
		assertFiniteInteger(s, `sums[${i}]`);
		if (s < k || s > 6 * k) {
			throw new RangeError(`sums[${i}] must be in [${k}, ${6 * k}], got ${s}`);
		}
		freqs[s - k] += 1;
	}
	return freqs;
}

/** n>0 を要求した上で、和の列(simulateDiceSumsの戻り値)から標本平均を求める。 */
export function sampleMeanOfSums(sums: readonly number[]): number {
	if (sums.length === 0) {
		throw new RangeError('sums must be non-empty (sample mean of 0 trials is undefined)');
	}
	let total = 0;
	for (let i = 0; i < sums.length; i++) {
		assertFiniteInteger(sums[i], `sums[${i}]`);
		total += sums[i];
	}
	return total / sums.length;
}
