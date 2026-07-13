// 確率分布と期待値の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを一切 import
// しない)。この単元の中核体験:
//   (1) くじ引き(賞金額×本数の確率分布表)の期待値 E[X]=Σx·p が「札の合計÷本数」という
//       素朴な直感と一致すること。
//   (2) シード付きシミュレーションで n 回引いた標本平均が、n を増やすと E[X] へ落ち着くこと
//       (probability.ts で扱った「相対度数→理論確率」の発見の続き)。
//
// 乱数の再現性(タスク厳守事項): PRNG をこのファイルで再実装せず、probability.ts の
// createRng(シード付き決定的 mulberry32)をそのまま再利用する。

import { createRng } from './probability.js';
import { approximatelyZero } from './compare.js';

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (probability.ts / statistics.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** シード・試行回数・本数(度数)はいずれも整数であることに意味があるため、整数性も検証する。 */
function assertFiniteInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name} must be an integer, got ${value}`);
	}
}

function assertNonEmptyFiniteValues(values: readonly number[], name: string): void {
	if (values.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`);
	}
	values.forEach((value, i) => assertFiniteNumber(value, `${name}[${i}]`));
}

function assertSameLength(a: readonly unknown[], b: readonly unknown[], nameA: string, nameB: string): void {
	if (a.length !== b.length) {
		throw new RangeError(`${nameA} and ${nameB} must have the same length, got ${a.length} and ${b.length}`);
	}
}

/**
 * 期待値 E[X] = Σ xᵢ·pᵢ(値と確率の内積、丸めない)。
 *
 * probs の総和は 1 であることを要求する(確率分布の定義そのものであり、崩れていれば
 * 「期待値」という言葉自体が意味を失う)。ただし浮動小数点演算では正確に 1.0 にならない
 * ことがあるため、厳密な `=== 1` ではなく MATH_CONVENTIONS.md §2 のスケール相対誤差
 * (`approximatelyZero`)で判定する。scale には 1 を渡す——確率は次元を持たない
 * (dimensionless)量であり、定義上つねに [0,1] のオーダー(O(1))に収まるため、
 * 「他の量と同じ次元・オーダーのスケール」は常に 1 それ自体になる
 * (compare.ts の `Math.max(1, scale)` によりこの引数は事実上の下限としても働く)。
 *
 * 各確率は有限かつ非負であること、values と probs は同じ長さで少なくとも1件あることを要求する。
 */
export function expectedValue(values: readonly number[], probs: readonly number[]): number {
	assertNonEmptyFiniteValues(values, 'values');
	assertSameLength(values, probs, 'values', 'probs');
	probs.forEach((p, i) => {
		assertFiniteNumber(p, `probs[${i}]`);
		if (p < 0) {
			throw new RangeError(`probs[${i}] must be non-negative, got ${p}`);
		}
	});

	const sum = probs.reduce((a, b) => a + b, 0);
	if (!approximatelyZero(sum - 1, 1)) {
		throw new RangeError(`probs must sum to 1, got ${sum}`);
	}

	let expected = 0;
	for (let i = 0; i < values.length; i++) {
		expected += values[i] * probs[i];
	}
	return expected;
}

/**
 * 本数(度数)の配列から確率分布(各値の確率 = 本数 ÷ 総本数)を求める。
 * 「1等300円×1本・2等100円×2本・はずれ0円×3本、計6本」のような、くじの構成をそのまま
 * 確率分布へ変換するための橋渡し関数(この単元の中核体験(1)の入口)。
 *
 * 総本数が0(全ての本数が0、または配列が空)の場合は割り算が無意味になるため RangeError
 * (relativeFrequencies と同じ方針)。各本数は有限の非負整数であることを要求する。
 *
 * 戻り値は values と同じ順序・長さの確率配列であり、そのまま expectedValue(values, ここでの
 * 戻り値) へ渡せる——これが「Σx·(c/N)」経路(不変条件テストの2経路の一方)。
 */
export function distributionFromCounts(values: readonly number[], counts: readonly number[]): readonly number[] {
	assertNonEmptyFiniteValues(values, 'values');
	assertSameLength(values, counts, 'values', 'counts');
	counts.forEach((count, i) => {
		assertFiniteInteger(count, `counts[${i}]`);
		if (count < 0) {
			throw new RangeError(`counts[${i}] must be non-negative, got ${count}`);
		}
	});

	const total = counts.reduce((a, b) => a + b, 0);
	if (total <= 0) {
		throw new RangeError(`sum of counts must be positive, got ${total}`);
	}

	return counts.map((count) => count / total);
}

/** simulateDraws の戻り値: 標本平均と、各値がそれぞれ何回引かれたか(度数)。 */
export interface SimulationResult {
	/** n 回引いたときの標本平均(Σ values[j]·frequencies[j] / n、丸めない)。 */
	readonly sampleMean: number;
	/** values と同じ順序・長さの、各値が引かれた回数。合計は必ず n に一致する。 */
	readonly frequencies: readonly number[];
}

/**
 * シード付き決定的 PRNG(probability.ts の createRng を再利用、再実装しない)で、
 * 本数(counts)が表す構成のくじを n 回引き、標本平均を求める。
 *
 * 本数(度数)から重み付き抽選を行う: 総本数 total に対する一様乱数 u = rng()*total を
 * 引き、累積本数(0番目から順に足し上げた本数)が初めて u を超える値を選ぶ
 * (「1等300円が1本、2等100円が2本、はずれ0円が3本、計6本」の箱から1本引くのと同じ確率
 * 構造——本数が多い値ほど選ばれやすい)。
 *
 * n は標本平均を定義するために少なくとも1回の抽選が必要なため、正の整数であることを要求する
 * (n=0 では 0/0 になり標本平均が定義できない。simulateDice が n=0 を有効な退化例として
 * 許容するのとは異なる——あちらは「度数」を返すのに対し、こちらは「平均」を返すため)。
 */
export function simulateDraws(
	seed: number,
	n: number,
	values: readonly number[],
	counts: readonly number[],
): SimulationResult {
	assertFiniteInteger(n, 'n');
	if (n <= 0) {
		throw new RangeError(`n must be a positive integer (sample mean of 0 draws is undefined), got ${n}`);
	}
	assertNonEmptyFiniteValues(values, 'values');
	assertSameLength(values, counts, 'values', 'counts');
	counts.forEach((count, i) => {
		assertFiniteInteger(count, `counts[${i}]`);
		if (count < 0) {
			throw new RangeError(`counts[${i}] must be non-negative, got ${count}`);
		}
	});

	const total = counts.reduce((a, b) => a + b, 0);
	if (total <= 0) {
		throw new RangeError(`sum of counts must be positive, got ${total}`);
	}

	// createRng 自体が seed の非有限・非整数を検証する(probability.ts、再実装しない)。
	const rng = createRng(seed);
	const frequencies = new Array(values.length).fill(0) as number[];

	for (let draw = 0; draw < n; draw++) {
		const u = rng() * total;
		let cumulative = 0;
		let chosen = values.length - 1; // 浮動小数点の丸めで最後まで超えなかった場合の防御的フォールバック
		for (let i = 0; i < counts.length; i++) {
			cumulative += counts[i];
			if (u < cumulative) {
				chosen = i;
				break;
			}
		}
		frequencies[chosen] += 1;
	}

	let weightedSum = 0;
	for (let i = 0; i < values.length; i++) {
		weightedSum += values[i] * frequencies[i];
	}

	return { sampleMean: weightedSum / n, frequencies };
}
