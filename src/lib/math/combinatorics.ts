// 場合の数(順列・組合せ)の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを
// 一切 import しない)。この単元の中核体験: n 個から r 個を「並べる」(順列 nPr)のと
// 「選ぶだけ」(組合せ nCr)の違いを、実際の列挙(数え上げ)の可視化で発見させる。
// nPr = nCr × r!(選んでから並べる)という関係が中核。
//
// 独立2経路の設計(タスク厳守事項・レビュー学習の先取り):
//   - 列挙系 (enumeratePermutations / enumerateCombinations) は実際にタプル・部分集合を
//     再帰的に生成するバックトラッキングであり、
//   - 算術系 (permutations / combinations) は積・階乗による閉じた式である。
// 両者はアルゴリズムとして完全に別実装であり、「列挙した個数」と「公式の値」を突き合わせる
// テストが自己確認的(C-7 違反)にならない、本物の独立オラクルになっている。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (probability.ts / sequences.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** n・r はいずれも整数であることに意味があるため、整数であることも検証する。 */
function assertFiniteInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name} must be an integer, got ${value}`);
	}
}

// 階乗が Number(IEEE754倍精度整数)の安全域(Number.MAX_SAFE_INTEGER = 2^53−1 =
// 9,007,199,254,740,991)に収まる最大の n。
//   18! = 6,402,373,705,728,000 → 安全域内(正確に表現できる整数)。
//   19! = 121,645,100,408,832,000 → 安全域を超え、丸め誤差で不正確な整数になる。
// したがって n の上限を 18 とし、超える入力は「計算結果が不正確になりうる」事前条件違反として
// RangeError にする(オーバーフローをサイレントに許さない)。permutations/combinations も
// この n の定義域を共有する(逐次積・逐次除算のいずれの中間値も高々 n! を超えないため、
// n≤18 なら同じ安全域の議論がそのまま成り立つ)。
export const MAX_SAFE_N = 18;

function assertValidN(n: number): void {
	assertFiniteInteger(n, 'n');
	if (n < 0) {
		throw new RangeError(`n must be non-negative, got ${n}`);
	}
	if (n > MAX_SAFE_N) {
		throw new RangeError(
			`n must not exceed ${MAX_SAFE_N} (${MAX_SAFE_N + 1}! exceeds Number.MAX_SAFE_INTEGER and would lose integer precision), got ${n}`,
		);
	}
}

function assertValidR(r: number, n: number): void {
	assertFiniteInteger(r, 'r');
	if (r < 0) {
		throw new RangeError(`r must be non-negative, got ${r}`);
	}
	if (r > n) {
		throw new RangeError(`r (${r}) must not exceed n (${n})`);
	}
}

/**
 * n の階乗(n!)。n は 0〜18 の整数(0 は「何もしない並べ方が1通り」という規約により 0!=1)。
 * n が範囲外・非整数・非有限なら RangeError(オーバーフロー根拠は MAX_SAFE_N のコメント参照)。
 */
export function factorial(n: number): number {
	assertValidN(n);

	let result = 1;
	for (let i = 2; i <= n; i++) {
		result *= i;
	}
	return result;
}

/**
 * n 個から r 個を選んで並べる順列の総数 nPr = n! / (n−r)!。
 * オーバーフロー回避: n!/(n−r)! を素直に計算せず、n×(n−1)×…×(n−r+1) を逐次積で計算する。
 * 各中間積は単調増加で最終値(≤ nPr ≤ n!)を超えないため、n≤MAX_SAFE_N(=18)である限り
 * すべての中間値が Number の安全域に収まる。
 */
export function permutations(n: number, r: number): number {
	assertValidN(n);
	assertValidR(r, n);

	let result = 1;
	for (let i = 0; i < r; i++) {
		result *= n - i;
	}
	return result;
}

/**
 * n 個から r 個を選ぶ(順序を区別しない)組合せの総数 nCr。
 *
 * 実装: permutations を再利用せず、乗法的公式(Pascal の三角形を横に辿る古典的手法)で
 * 独立に計算する: result を 1 から始め、i=0..r−1 について result ← result×(n−i)÷(i+1)。
 * この漸化式は各ステップ終了時点で result が厳密に C(n, i+1) という整数値になることが
 * 数学的に保証されている(二項係数は常に整数)。n,r≤MAX_SAFE_N(=18)の範囲では、割る前の
 * 積 result×(n−i) も高々 C(18,9)×18 程度(≈87万)に収まり安全域を大きく下回るため、
 * IEEE754 の除算は「割り切れる整数商」を誤差なく返す(割られる数・割る数がともに厳密表現
 * できる整数で、数学的な商が整数であれば、最近接丸めはその整数そのものになる)。
 * よって整数除算の正確性のために逐次的な約分以上の工夫は不要で、厳密等価(===)比較が使える。
 *
 * permutations とはアルゴリズムが異なる(積の対象・除算のタイミングが異なる)ため、
 * nPr === nCr × r! の不変条件テストは2つの独立実装を突き合わせる本物のクロスチェックになる。
 */
export function combinations(n: number, r: number): number {
	assertValidN(n);
	assertValidR(r, n);

	let result = 1;
	for (let i = 0; i < r; i++) {
		result = (result * (n - i)) / (i + 1);
	}
	return result;
}

// 列挙(実際にタプル・部分集合を生成する)は組合せ的爆発を起こしうるため、生成前に
// 見込み件数(permutations/combinations の閉じた式で算出)を確認し、上限を超える場合は
// RangeError にする(タスク厳守事項: 列挙数上限ガード)。UI は n∈[2,6] に絞るため
// 実際の最大値は 6P6=720 / 6C6=1 に収まり、この上限には遠く及ばない。
export const ENUMERATION_LIMIT = 5000;

function assertEnumerationSize(expectedCount: number, kind: string): void {
	if (expectedCount > ENUMERATION_LIMIT) {
		throw new RangeError(
			`${kind} would produce ${expectedCount} results, exceeding the enumeration guard (${ENUMERATION_LIMIT}); reduce n or r.`,
		);
	}
}

/**
 * items(小配列前提)から r 個を取り出して並べる順列を、実際にすべて列挙する
 * (再帰的なバックトラッキング。permutations/combinations の閉じた式とは別実装)。
 * items.length を n として、n・r の検証・オーバーフロー上限は permutations と共通。
 * r=0 は「並べ方が1通り(空のタプル)」という有効な退化例で [[]] を返す(例外にしない)。
 */
export function enumeratePermutations<T>(items: readonly T[], r: number): T[][] {
	const n = items.length;
	assertValidN(n);
	assertValidR(r, n);
	assertEnumerationSize(permutations(n, r), 'enumeratePermutations');

	const result: T[][] = [];
	const used = new Array<boolean>(n).fill(false);
	const current: T[] = [];

	function backtrack(): void {
		if (current.length === r) {
			result.push([...current]);
			return;
		}
		for (let i = 0; i < n; i++) {
			if (used[i]) continue;
			used[i] = true;
			current.push(items[i]);
			backtrack();
			current.pop();
			used[i] = false;
		}
	}

	backtrack();
	return result;
}

/**
 * items(小配列前提)から r 個を取り出す組合せ(順序を区別しない部分集合)を、実際にすべて
 * 列挙する(開始位置を単調に進める再帰で、同じ部分集合を2度生成しない)。
 * r=0 は「選び方が1通り(空集合)」という有効な退化例で [[]] を返す(例外にしない)。
 */
export function enumerateCombinations<T>(items: readonly T[], r: number): T[][] {
	const n = items.length;
	assertValidN(n);
	assertValidR(r, n);
	assertEnumerationSize(combinations(n, r), 'enumerateCombinations');

	const result: T[][] = [];
	const current: T[] = [];

	function backtrack(start: number): void {
		if (current.length === r) {
			result.push([...current]);
			return;
		}
		for (let i = start; i < n; i++) {
			current.push(items[i]);
			backtrack(i + 1);
			current.pop();
		}
	}

	backtrack(0);
	return result;
}
