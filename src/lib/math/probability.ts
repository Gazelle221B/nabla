// 確率(単純な試行と相対度数)の純粋 TypeScript モデル (AGENTS.md §5: React/描画ライブラリを
// 一切 import しない)。この単元の中核体験: サイコロを振る回数 n を 1・10・100・1000…と
// 増やしていくと、各目の相対度数(出た回数 ÷ 試行回数)がばらつきながらも理論確率 1/6 へ
// 近づいていく——「確率とは、多数回の試行で現れる割合の落ち着き先である」という感覚を掴む。
//
// 乱数の再現性(MATH_CONVENTIONS の再現性方針・タスク厳守事項): lib/math では Math.random() を
// 使わない。同じシードなら必ず同じ試行列になる決定的 PRNG (mulberry32) を実装し、UI はシードを
// 状態として持つ。テストの再現性・「振り直す」ボタンでの意図的な再現不能性(=シード変更)の
// 両方を、この1つの仕組みで実現する。

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (sequences.ts / riemannSum.ts と同じ流儀。lib/math 内の各モジュールがそれぞれ独立に
// この極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** シード・試行回数・度数はいずれも整数であることに意味があるため、整数であることも検証する。 */
function assertFiniteInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name} must be an integer, got ${value}`);
	}
}

/** サイコロ1〜6の目それぞれの度数(出た回数)。目1の度数が index 0、目6の度数が index 5。 */
export type DiceFrequencies = readonly [number, number, number, number, number, number];

/**
 * シード付き決定的 PRNG (mulberry32) を生成する。同じ seed からは必ず同じ [0,1) の値の列が
 * 得られる(テスト再現性・「振り直す」でのシード変更による意図的な再現不能性の両方の土台)。
 * seed は任意の有限整数(符号・大きさに制約はなく、内部で 32bit 符号なし整数として扱う)。
 *
 * mulberry32 は教材・ツール開発で広く使われる小さく高速な PRNG で、暗号用途ではないが
 * この単元の目的(教材内での再現可能な多数回試行のシミュレーション)には十分な均一性を持つ。
 */
export function createRng(seed: number): () => number {
	assertFiniteInteger(seed, 'seed');

	let state = seed >>> 0;
	return function rng(): number {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * サイコロを n 回振ったときの、目1〜6それぞれの度数(出た回数)を返す。
 * n=0(1回も振らない)は「全ての目の度数が0」という有効な退化例として扱い、例外を投げない
 * (MATH_CONVENTIONS.md §4: ゼロ長・退化ケースは明示的にハンドリングする、という方針を
 * 「0回の試行」に当てはめたもの)。n が負・非整数・非有限、または seed が非有限・非整数の
 * 場合は事前条件違反として RangeError。
 */
export function simulateDice(seed: number, n: number): DiceFrequencies {
	assertFiniteInteger(seed, 'seed');
	assertFiniteInteger(n, 'n');
	if (n < 0) {
		throw new RangeError(`n must be a non-negative integer, got ${n}`);
	}

	const rng = createRng(seed);
	const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
	for (let i = 0; i < n; i++) {
		// rng() ∈ [0,1) なので Math.floor(rng()*6) ∈ {0,...,5}(目1〜6に対応)。
		const face = Math.floor(rng() * 6);
		counts[face] += 1;
	}
	return counts;
}

/**
 * 度数の配列(各目が出た回数など)を相対度数(度数 ÷ 合計)の配列に変換する。
 * 合計が0(全ての度数が0、または配列が空)の場合は割り算が無意味になるため RangeError。
 * 各度数は有限の非負整数であることを要求する(負の度数は意味を持たない)。
 */
export function relativeFrequencies(counts: readonly number[]): readonly number[] {
	counts.forEach((count, i) => {
		assertFiniteInteger(count, `counts[${i}]`);
		if (count < 0) {
			throw new RangeError(`counts[${i}] must be non-negative, got ${count}`);
		}
	});

	const total = counts.reduce((sum, count) => sum + count, 0);
	if (total <= 0) {
		throw new RangeError(`sum of counts must be positive, got ${total}`);
	}

	return counts.map((count) => count / total);
}

/**
 * 「同様に確からしい」場合の理論確率 = favorable(条件に合う場合の数) ÷ total(全ての場合の数)。
 * total は正の整数(全ての場合の数が0以下では確率が定義できない)、favorable は 0 以上 total
 * 以下の整数(条件に合う場合の数が全体の場合の数を超える・負であることはあり得ない)。
 */
export function theoreticalProbability(favorable: number, total: number): number {
	assertFiniteInteger(favorable, 'favorable');
	assertFiniteInteger(total, 'total');
	if (total <= 0) {
		throw new RangeError(`total must be a positive integer, got ${total}`);
	}
	if (favorable < 0) {
		throw new RangeError(`favorable must be non-negative, got ${favorable}`);
	}
	if (favorable > total) {
		throw new RangeError(`favorable (${favorable}) must not exceed total (${total})`);
	}

	return favorable / total;
}
