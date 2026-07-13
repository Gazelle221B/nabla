// 漸化式と計算量: フィボナッチ数列 fib(n) 自体の値ではなく、それを求めるために実際に
// 実行される「計算の回数」が主役の純粋 TypeScript モデル (AGENTS.md §5: React/描画
// ライブラリを一切 import しない)。
//
// 中核体験: 同じ数学的定義 fib(n) = fib(n−1) + fib(n−2)(fib(0)=0, fib(1)=1)でも、
// それを求める「計算のやり方」——素朴な二重再帰(定義をそのまま関数呼び出しにする)か、
// メモ化(一度計算した値をキャッシュして使い回す)か——によって、必要な手間が桁違いに
// 変わる。漸化式が「数の並び」だけでなく「アルゴリズムの効率」も記述できる、という
// 入口を作る。
//
// 独立2経路の設計(タスク厳守事項・C-7): fibonacci は素直な反復ループでフィボナッチ数
// そのものを計算するのに対し、naiveCallCount は「呼び出し回数」を数える別の漸化式
// C(n)=C(n−1)+C(n−2)+1 をボトムアップに計算する、完全に別の実装。両者は
// C(n) = 2・fib(n+1) − 1 という恒等式で結ばれる(下記コメント参照)。これを突き合わせる
// テストは自己確認的にならない、本物の独立オラクルである。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (combinatorics.ts / sequences.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** n(項番号・回数の対象)は非負整数であることに意味があるため、それも検証する。 */
function assertNonNegativeInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
	}
}

// フィボナッチ数が Number(IEEE754倍精度整数)の安全域(Number.MAX_SAFE_INTEGER =
// 2^53−1 = 9,007,199,254,740,991、2^53 = 9,007,199,254,740,992)に収まる最大の n。
// 反復ループで実際に計算し、手で確認した値(検算済み):
//   fib(78) = 8,944,394,323,791,464 → 2^53 未満(安全域内、正確に表現できる整数)。
//   fib(79) = 14,472,334,024,676,221 → 2^53 を超える(安全域外、丸め誤差が生じうる)。
// したがって n の上限を 78 とし、超える入力は「計算結果が不正確になりうる」事前条件違反
// として RangeError にする(オーバーフローをサイレントに許さない、MATH_CONVENTIONS §3)。
export const MAX_SAFE_FIB_N = 78;

/**
 * フィボナッチ数列の第 n 項(fib(0)=0, fib(1)=1, fib(n)=fib(n−1)+fib(n−2))。
 * **反復ループ実装**(再帰は使わない——この単元で「素朴な再帰」を対比材料として別途
 * naiveCallCount に実装するため、この関数自体が指数時間の再帰であってはならない)。
 * n は 0〜{@link MAX_SAFE_FIB_N} の整数のみ(範囲外・非整数・非有限は RangeError)。
 */
export function fibonacci(n: number): number {
	assertNonNegativeInteger(n, 'n');
	if (n > MAX_SAFE_FIB_N) {
		throw new RangeError(
			`n must not exceed ${MAX_SAFE_FIB_N} (fib(${MAX_SAFE_FIB_N + 1}) exceeds Number.MAX_SAFE_INTEGER and would lose integer precision), got ${n}`,
		);
	}
	if (n === 0) return 0;

	let prev = 0;
	let curr = 1;
	for (let i = 1; i < n; i++) {
		const next = prev + curr;
		prev = curr;
		curr = next;
	}
	return curr;
}

// naiveCallCount の定義域: C(n) = 2・fib(n+1) − 1(下記コメント参照)なので、fib(n+1)
// 自身が安全域に収まるだけでは足りない——「2倍して1引く」ことで C(n) は fib(n+1) の
// およそ2倍になり、実質的に安全域を1ビット分早く使い切る。反復ループで実際に計算し、
// 手で確認した値(検算済み):
//   C(75) = 2・fib(76) − 1 = 6,832,909,245,813,413 → 2^53 未満(安全域内)。
//   C(76) = 2・fib(77) − 1 = 11,055,879,401,769,513 → 2^53 を超える(安全域外)。
// (fib(78) 自身は安全域内でも、C(77)=2・fib(78)−1=17,888,788,647,582,927 は
// 2^53=9,007,199,254,740,992 を大きく超えてしまう——「fib(n+1) が安全か」だけを見て
// n の上限を MAX_SAFE_FIB_N−1(=77)とするのは誤りで、2倍する分だけさらに1つ手前
// (n=75)までに制限する必要がある)。したがって n の上限を 75 とする。
export const MAX_SAFE_NAIVE_CALL_N = 75;

/**
 * 「素朴な二重再帰」で fib(n) を計算するときに実際に発生する関数呼び出しの総回数 C(n)。
 * 定義: 素朴な再帰 `function fib(n) { if (n<=1) return n; return fib(n-1)+fib(n-2); }` を
 * 呼ぶたびに1回とカウントすると、C(0)=C(1)=1(それぞれ1回の呼び出しで即座に返る)、
 * n≥2 では「自分自身の呼び出し1回」+「fib(n-1) の呼び出し木の中の全呼び出し」+
 * 「fib(n-2) の呼び出し木の中の全呼び出し」なので C(n)=C(n−1)+C(n−2)+1 という、
 * fib 自体とよく似た漸化式に従う。
 *
 * **反復(ボトムアップ)で計算する**(この関数自身が指数回再帰したら本末転倒なため)。
 * n は 0〜{@link MAX_SAFE_NAIVE_CALL_N}(=75)の整数のみ(範囲外・非整数・非有限は
 * RangeError)。
 *
 * C-7 交差検証: 恒等式 C(n) = 2・fib(n+1) − 1 が成り立つ(帰納法で証明可能)。
 *   基底: C(0) = 2・fib(1) − 1 = 2・1 − 1 = 1 = C(0) の定義通り。
 *         C(1) = 2・fib(2) − 1 = 2・1 − 1 = 1 = C(1) の定義通り。
 *   帰納段: C(n) = C(n−1) + C(n−2) + 1
 *                = (2・fib(n) − 1) + (2・fib(n−1) − 1) + 1   (帰納法の仮定)
 *                = 2・(fib(n) + fib(n−1)) − 1
 *                = 2・fib(n+1) − 1                            (fib の定義そのもの)
 * この関数(漸化式の直接反復)と `2 * fibonacci(n + 1) - 1`(fibonacci という独立実装
 * から組み立てた閉形式)は完全に別の計算経路であり、__tests__/recurrence.test.ts の
 * fast-check で n∈[0,75] 全域を突き合わせる。両者とも整数演算のみ(浮動小数の丸めを
 * 経由しない)なので、比較は厳密等価(===)でよく、approximatelyZero のようなスケール
 * 相対誤差の判定は不要(MATH_CONVENTIONS §2 はここでは対象外)。
 */
export function naiveCallCount(n: number): number {
	assertNonNegativeInteger(n, 'n');
	if (n > MAX_SAFE_NAIVE_CALL_N) {
		throw new RangeError(
			`n must not exceed ${MAX_SAFE_NAIVE_CALL_N} (naiveCallCount(${MAX_SAFE_NAIVE_CALL_N + 1}) would require fib(${MAX_SAFE_NAIVE_CALL_N + 2}), which exceeds Number.MAX_SAFE_INTEGER), got ${n}`,
		);
	}
	if (n === 0 || n === 1) return 1;

	let c0 = 1; // C(n-2) の位置から開始(初期値 C(0))
	let c1 = 1; // C(n-1) の位置から開始(初期値 C(1))
	for (let i = 2; i <= n; i++) {
		const c2 = c0 + c1 + 1;
		c0 = c1;
		c1 = c2;
	}
	return c1;
}

/**
 * 「メモ化(トップダウン+キャッシュ)」で fib(n) を計算するときに実際に走る計算の回数。
 * メモ化では、fib(k) をキャッシュに問い合わせて未計算なら1回だけ計算してキャッシュに
 * 書き込む——同じ k に対する2回目以降の呼び出しはキャッシュを引くだけで「計算」は
 * 走らない。fib(n) を求めるには fib(0), fib(1), …, fib(n) の n+1 個の値がそれぞれ
 * ちょうど1回ずつ計算されるので、実際に計算が走る回数は **n+1** になる(素朴な再帰が
 * 同じ部分問題を指数個にわたって再計算するのに対し、メモ化は部分問題1つにつき計算1回
 * しか走らない、という違いがこの単元の核心)。
 *
 * n は 0〜{@link MAX_SAFE_FIB_N}(=78、fibonacci と同じ定義域——メモ化は概念的に
 * fib(0)〜fib(n) を計算するため)の整数のみ(範囲外・非整数・非有限は RangeError)。
 */
export function memoizedComputationCount(n: number): number {
	assertNonNegativeInteger(n, 'n');
	if (n > MAX_SAFE_FIB_N) {
		throw new RangeError(
			`n must not exceed ${MAX_SAFE_FIB_N} (memoization would need fib(${MAX_SAFE_FIB_N + 1}), which exceeds Number.MAX_SAFE_INTEGER), got ${n}`,
		);
	}
	return n + 1;
}
