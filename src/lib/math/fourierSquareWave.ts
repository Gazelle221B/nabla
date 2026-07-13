import { approximatelyZero } from './compare.js';

// 振幅±1・周期2πの方形波のフーリエ級数の純粋 TypeScript モデル (AGENTS.md §5: React/描画
// ライブラリを一切 import しない)。この単元の中核体験: 「滑らかなサイン波(奇数次高調波)だけを
// 足し重ねていくと、角ばった方形波にどこまで近づけるか」——N(項数)を増やすほど波形は方形波へ
// 寄っていく一方、不連続点(t=mπ)のすぐそばに残る「ツノ」(ギブス現象、ジャンプ幅の約9%の
// オーバーシュート)は N をどれだけ増やしても消えない、という「各点の収束」と「一様収束」の
// 違いを発見する。
//
// 対象の方形波(奇関数、フーリエ正弦級数のみを持つ):
//   square(t) = +1  (0 < t mod 2π < π のとき)
//             = -1  (π < t mod 2π < 2π のとき)
//             =  0  (t = mπ、不連続点。フーリエ級数の収束値である左右極限の平均に合わせる)
// フーリエ正弦係数は奇数次のみ非零: b_k = 4/(πk) (k 奇数)、0 (k 偶数)。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (sequenceLimits.ts / riemannSum.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** 高調波の次数 k の事前条件: 正の整数であること(0次・負の次数・非整数次は無意味)。 */
function assertValidHarmonicIndex(k: number, name: string): void {
	assertFiniteNumber(k, name);
	if (!Number.isInteger(k) || k <= 0) {
		throw new RangeError(`${name} must be a positive integer, got ${k}`);
	}
}

/**
 * 部分和が「非零項を何項足すか」を表す項数 nTerms の事前条件: 非負整数であること。
 * sequenceLimits.ts の assertValidPartialSumCount と同じ理由(MATH_CONVENTIONS.md §4: 退化
 * ケースは例外にせず明示的にハンドリングする)で nTerms=0(1項も足さない空和、S₀(t)=0)を
 * 有効な退化例とする。
 */
function assertValidTermCount(nTerms: number): void {
	assertFiniteNumber(nTerms, 'nTerms');
	if (!Number.isInteger(nTerms) || nTerms < 0) {
		throw new RangeError(`nTerms must be a non-negative integer, got ${nTerms}`);
	}
}

/**
 * 方形波 square(t) の exact 定義: sign(sin t)。ただし不連続点 t=mπ では 0
 * (フーリエ級数が収束する値=左右極限の平均、ディリクレ条件下での標準的な取り扱い)。
 *
 * 判定に approximatelyZero(compare.ts, |sin t|<=1e-9) を使う設計判断(sequenceLimits.ts の
 * r=1 判定が exact 等号を使ったのとは対照的に、ここでは意図的に近傍判定を使う——両者は
 * 異なる問題を解いている):
 *   - t=mπ をこの単元のUI・テストで渡すときは、実質的に Math.PI の整数倍として浮動小数点
 *     表現される。Math.sin(Math.PI) は数学的に0だが浮動小数点では ≈1.2246e-16 のような
 *     極小の非零値になる。これを exact 等号 (sin(t)===0) で判定すると、意図した不連続点
 *     ちょうどの入力ですら「不連続点でない」と誤判定してしまう。
 *   - 一方、t=mπ から真に離れた値(例: t=π+1e-7)では |sin t|≈1e-7 であり、1e-9 の許容帯
 *     には入らない——真に異なる t での square(t)=sign(sin t) の値をこの判定が誤って
 *     0 に丸めてしまうことはない(sequenceLimits.ts が懸念した「分類境界を鈍らせる」問題は
 *     ここでは起こらない。1e-9 は「浮動小数点表現誤差の吸収」にのみ効き、「数学的に異なる
 *     t」を巻き込むには狭すぎる)。
 */
export function squareWave(t: number): number {
	assertFiniteNumber(t, 't');
	const s = Math.sin(t);
	if (approximatelyZero(s, 1)) return 0;
	return Math.sign(s);
}

/**
 * 方形波のフーリエ正弦係数の閉形式: b_k = 4/(πk)(k奇数)、0(k偶数)。
 *
 * 導出(積分定義 b_k = (1/π)∫_{-π}^{π} square(t) sin(kt) dt = (2/π)∫_0^π sin(kt) dt、
 * square(t)=1 が (0,π) で成り立つことと sin の奇関数性を使って半区間に帰着させたもの):
 *   ∫_0^π sin(kt) dt = [-cos(kt)/k]_0^π = (1 - cos(kπ))/k = (1-(-1)^k)/k
 *   → k偶数のとき 0、k奇数のとき 2/k
 *   b_k = (2/π)・(1-(-1)^k)/k → k偶数で0、k奇数で (2/π)(2/k) = 4/(πk)
 *
 * この閉形式は computeCoefficientByQuadrature (積分定義そのものを数値積分する独立経路) と
 * 突き合わせる C-7 の要——同じ式を2回評価するだけの自己確認ではなく、「代数的に導いた公式」
 * と「定義に忠実な数値積分」という別々の経路の一致を検証する。
 */
export function squareWaveCoefficient(k: number): number {
	assertValidHarmonicIndex(k, 'k');
	if (k % 2 === 0) return 0;
	return 4 / (Math.PI * k);
}

/**
 * 部分和(方形波の近似) S_N(t) = Σ_{j=1}^{nTerms} b_{2j-1}・sin((2j-1)t)
 * (非零の奇数次高調波を nTerms 個、第1・第3・…・第(2・nTerms−1)高調波まで足したもの)。
 *
 * nTerms=0 は空和で S_0(t)=0(すべての t で恒等的に0、退化例)。
 */
export function fourierPartialSum(nTerms: number, t: number): number {
	assertValidTermCount(nTerms);
	assertFiniteNumber(t, 't');

	let sum = 0;
	for (let j = 1; j <= nTerms; j++) {
		const k = 2 * j - 1; // 第 (2j-1) 高調波(奇数次)
		sum += squareWaveCoefficient(k) * Math.sin(k * t);
	}
	assertFiniteNumber(sum, 'fourierPartialSum(nTerms, t)');
	return sum;
}

/**
 * フーリエ正弦係数 b_k を「閉形式の公式」を一切経由せず、積分の定義
 * b_k = (2/π)∫_0^π square(t)・sin(kt) dt そのものを合成シンプソン則で数値積分して求める、
 * squareWaveCoefficient とは完全に独立した経路(C-7)。
 *
 * 分割数 n=2000(偶数、合成シンプソン則の要件)の根拠: 被積分関数 square(t)・sin(kt) は
 * 区間 (0,π) の内部では square(t)≡1 のため sin(kt) に等しく、実質的に無限回微分可能な滑らかな
 * 関数として扱える(区間の両端 t=0, t=π では square の定義上の不連続候補点だが、そこでは
 * sin(k・0)=0 かつ sin(kπ)=0(整数 k)なので被積分関数の値そのものが 0 になり、square(0)や
 * square(π) の値(0)がどちらであっても積分の評価に影響しない——不連続性が「消える」特殊な
 * 配置になっている、事前に node で確認済み)。滑らかな関数に対するシンプソン則の誤差は
 * O(h⁴)(h=(π−0)/n)であり、n=2000 なら h≈1.57e-3、h⁴≈6.1e-12 で桁違いに小さく、
 * このテストで要求する精度(approximatelyZero, 相対誤差 1e-9 オーダー)を十分に満たす
 * (下記の不変条件テストで実測して固定済み)。
 */
export function computeCoefficientByQuadrature(k: number): number {
	assertValidHarmonicIndex(k, 'k');

	const lower = 0;
	const upper = Math.PI;
	const n = 2000; // 偶数(合成シンプソン則の要件)
	const h = (upper - lower) / n;

	const integrand = (t: number): number => squareWave(t) * Math.sin(k * t);

	let sum = integrand(lower) + integrand(upper);
	for (let i = 1; i < n; i++) {
		const t = lower + i * h;
		sum += (i % 2 === 0 ? 2 : 4) * integrand(t);
	}
	const integral = (h / 3) * sum;

	const result = (2 / Math.PI) * integral;
	assertFiniteNumber(result, 'computeCoefficientByQuadrature(k)');
	return result;
}
