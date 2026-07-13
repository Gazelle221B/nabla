import { approximatelyZero } from './compare.js';

// 数列の極限(等比数列 aₙ=r^(n−1) の n→∞ での行き先)の純粋 TypeScript モデル (AGENTS.md §5:
// React/描画ライブラリを一切 import しない)。この単元の中核体験: 公比 r の値だけで、点列
// (n, r^(n−1)) の「行き先」が劇的に変わる——|r|<1 で 0 へ収束・r=1 で一定・r>1 で発散・
// r≤−1 で振動(収束しない)という4つの運命に分岐する。あわせて無限等比級数
// Σ_{k=0}^{∞} r^k = 1/(1−r)(|r|<1 のみ)が、部分和の列がジグザグに(あるいは単調に)
// 一定値へ落ち着く体験として発見できるようにする。
//
// 数III で初めて極限・収束・発散・lim を正式に使ってよい単元(タスク厳守事項)。ただし
// ε-N 論法は大学範囲のため使わない——ここでの「収束」は「n を大きくしたときに特定の値に
// 近づいていく」という直感的な記述に留め、形式的な定義は導入しない。
//
// 第n項そのもの(aₙ=r^(n−1))は再実装しない: sequences.ts の geometricTerm(a1, r, n) を
// a1=1 で呼び出せばそのまま得られる(タスク厳守事項: geometricTerm の再利用)。このファイルは
// 「極限の分類」「部分和」「(条件付きの)級数和」という、geometricTerm より一段上の概念だけを
// 追加する。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (sequences.ts / probability.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 部分和が「何項分の和か」を表す項数 n の事前条件: 非負整数であること。
 *
 * sequences.ts の assertValidTermIndex(n>0、「0番目の項」が無意味なため)とは異なり、ここでの
 * n は「項の番号」ではなく「足し合わせた項の個数」という別の量なので、n=0(1項も足さない
 * 空和 S₀=0)を退化例として有効にする(MATH_CONVENTIONS.md §4: 退化ケースは例外にせず
 * 明示的にハンドリングする)。この違いにより、不変条件テストで漸化式 S_{n+1}=S_n+r^n を
 * n=0 から出発して検証できる。
 */
function assertValidPartialSumCount(n: number): void {
	assertFiniteNumber(n, 'n');
	if (!Number.isInteger(n) || n < 0) {
		throw new RangeError(`n must be a non-negative integer, got ${n}`);
	}
}

/** 等比数列 aₙ=r^(n−1) の極限の分類(4状態)。 */
export type GeometricLimitClass = 'converges-to-zero' | 'constant' | 'diverges' | 'oscillates';

/**
 * 公比 r だけから、等比数列 aₙ=r^(n−1)(a₁=1 に正規化——a₁ の符号・大きさは「0に収束するか
 * どうか」「振動するかどうか」という分類そのものを変えない。a₁≠0 の一般の場合は
 * |a₁|・(この関数の分類結果)と考えれば足りるため、分類自体は r のみに依存させる)の
 * n→∞ での行き先を4つに分類する。
 *
 * 分類の粒度(タスク厳守事項の根拠): 数III の教科書的な等比数列の極限は次の4つに尽きる。
 *   - |r|<1        → 0 に収束('converges-to-zero')
 *   - r=1          → 常に 1(一定、'constant')
 *   - r>1          → ∞ に発散('diverges')
 *   - r≤−1         → 振動('oscillates'。r=−1 は値が 1,−1,1,−1,… を繰り返し収束しない。
 *                     r<−1 は絶対値が発散しながら符号が反転し続けるため、どちらも「特定の
 *                     値に近づかない」という点で同じ分類にまとめる——数III の教科書はこの
 *                     2つを区別せず「振動」と呼ぶ)
 * この4区間は ∪ すると実数全体を過不足なく覆う(r>1 ∪ {1} ∪ (−1,1) ∪ (−∞,−1] = ℝ)。
 *
 * r=1 の判定は **exact 等号**(近傍判定 approximatelyZero ではない)を使う。理由:
 * expLog.ts の logBase が a≈1 を近傍判定で弾いたのは「除算の分母が0に潰れて数値が爆発する」
 * ことを防ぐためだった(除算という連続操作の安定性の問題)。しかしここでの r=1 判定は
 * 除算を一切含まない**離散分類**の分岐点であり、quadraticEquation.ts の realRoots が
 * D=0 を exact で判定するのと同じ構造(「僅かに超えたら質的に別の分類になる」という
 * 分類境界そのものを鈍らせてはいけない)。r=1+1e-13 は数学的に「diverges」に属する
 * (真に1より大きい公比は必ず発散する)ので、ここを approximatelyZero で丸めて
 * 'constant' 側に寄せてしまうと分類が数学的に誤りになる。r≤−1 の境界も同じ理由で exact。
 */
export function classifyGeometricLimit(r: number): GeometricLimitClass {
	assertFiniteNumber(r, 'r');
	if (r > 1) return 'diverges';
	if (r === 1) return 'constant';
	if (r > -1) return 'converges-to-zero'; // -1 < r < 1
	return 'oscillates'; // r <= -1
}

/**
 * 「基準等比数列」1, r, r², …, r^(n−1)(初項1・公比r、sequences.ts の
 * geometricTerm(1, r, k) の k=1..n を並べたもの)の部分和 Sₙ = Σ_{k=1}^{n} r^{k-1}
 * = 1 + r + r² + … + r^{n-1}(n項の和。n=0 は空和で 0)。
 *
 * 閉形式 Sₙ=(1−r^n)/(1−r)(r≠1)を使う。r=1 のときは全項が1なので Sₙ=n(コード上も
 * 数学上もこちらが唯一正しい値——閉形式の分母 1−r が0になり定義できないため、n の直接計算に
 * 切り替える必要がある)。
 *
 * **r≈1(ただし exact に1ではない)の除算の扱い(expLog.ts logBase の学びを踏襲)**:
 * 分岐の判定には `r === 1` ではなく `approximatelyZero(r-1, 1)` を使う。理由:
 * r=1+1e-13 のような「ほぼ1」の値で閉形式 (1−r^n)/(1−r) を評価すると、分母
 * (1−r)≈−1e-13 が極小のため、分子の丸め誤差(1−r^n の計算で生じる桁落ち)が
 * 除算で桁違いに増幅され、真の値から大きく外れた実務上無意味な数値を返しうる
 * (expLog.ts の logBase が a≈1 で ln(a)≈0 の除算を避けたのと全く同じ「除算の分母が
 * 実質0に潰れる」問題)。r が exact に 1 でなくとも、この極めて狭い近傍
 * (|r−1|≤1e-9)では真の Sₙ も n との差が 1e-9 のオーダーでしかない(下記の不変条件
 * テストで検証)ため、n をそのまま返しても数学的な精度を実質的に損なわない。
 * これは classifyGeometricLimit の r=1 判定(離散分類の境界、除算を含まないため exact
 * が必須)とは性質が異なる別の設計判断であり、両者を混同しない。
 */
export function geometricPartialSum(r: number, n: number): number {
	assertFiniteNumber(r, 'r');
	assertValidPartialSumCount(n);

	// n=0(空和)は r の値によらず常にちょうど 0(1項も足していない)。閉形式
	// (1-r^0)/(1-r) = 0/(1-r) でも数学的には同じ値になるが、r>1 のとき分子0・分母が負に
	// なり IEEE 754 の符号付きゼロ規則で -0 を返してしまう(MATH_CONVENTIONS.md §7)。
	// 空和という自明なケースをわざわざ符号付きゼロの罠に晒す必要はないため、先に確定した
	// +0 を返す。
	if (n === 0) return 0;

	if (approximatelyZero(r - 1, 1)) {
		return n;
	}

	const result = (1 - r ** n) / (1 - r);
	assertFiniteNumber(result, 'geometricPartialSum(r, n)');
	return result;
}

/**
 * 無限等比級数 Σ_{k=0}^{∞} r^k = 1/(1−r) の和(初項1・公比rの「基準等比数列」、
 * geometricPartialSum の n→∞ での極限)。
 *
 * |r|<1 のときのみ収束し、値は 1/(1−r)。|r|≥1(r=1 の一定・r>1 の発散・r≤−1 の振動の
 * いずれも)は級数として収束しないため RangeError にする——「収束しない」ことを暗黙の
 * Infinity/NaN で表さず、呼び出し側に例外として明示する(MATH_CONVENTIONS.md §3 の
 * 「サイレントに伝播させない」方針を、収束判定という数学的性質そのものに適用したもの)。
 */
export function geometricSeriesSum(r: number): number {
	assertFiniteNumber(r, 'r');
	if (Math.abs(r) >= 1) {
		throw new RangeError(
			`geometricSeriesSum requires |r|<1 for the series to converge, got r=${r}`,
		);
	}
	return 1 / (1 - r);
}
