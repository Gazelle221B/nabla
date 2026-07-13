import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	factorial,
	permutations,
	combinations,
	enumeratePermutations,
	enumerateCombinations,
	MAX_SAFE_N,
	ENUMERATION_LIMIT,
} from '../combinatorics.js';

// 非有限入力 (NaN / Infinity) を全引数について検証するための共通ヘルパー
// (probability.test.ts / sequences.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('factorial', () => {
	it('黄金値: 0!=1, 1!=1, 4!=24, 5!=120(手計算値、再検算済み)', () => {
		expect(factorial(0)).toBe(1);
		expect(factorial(1)).toBe(1);
		expect(factorial(4)).toBe(24);
		expect(factorial(5)).toBe(120);
	});

	it('安全域の境界: 18! は Number.MAX_SAFE_INTEGER 以内の厳密値と一致する', () => {
		expect(factorial(18)).toBe(6402373705728000);
		expect(Number.isSafeInteger(factorial(18))).toBe(true);
	});

	it('19以上(オーバーフロー域)は RangeError', () => {
		expect(() => factorial(19)).toThrow(RangeError);
		expect(() => factorial(100)).toThrow(RangeError);
	});

	it('負・非整数 → RangeError', () => {
		expect(() => factorial(-1)).toThrow(RangeError);
		expect(() => factorial(2.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => factorial(value)).toThrow(RangeError);
		});
	}
});

describe('permutations (nPr)', () => {
	it('黄金値: 5P2=20, 4P4=24, 6P0=1(手計算値、再検算済み)', () => {
		expect(permutations(5, 2)).toBe(20);
		expect(permutations(4, 4)).toBe(24);
		expect(permutations(6, 0)).toBe(1);
	});

	it('境界: r=0 は常に1、r=n は n! に一致する', () => {
		expect(permutations(6, 0)).toBe(1);
		expect(permutations(6, 6)).toBe(factorial(6));
	});

	it('r>n → RangeError', () => {
		expect(() => permutations(3, 4)).toThrow(RangeError);
	});

	it('n が負・非整数 → RangeError', () => {
		expect(() => permutations(-1, 0)).toThrow(RangeError);
		expect(() => permutations(2.5, 1)).toThrow(RangeError);
	});

	it('r が負・非整数 → RangeError', () => {
		expect(() => permutations(5, -1)).toThrow(RangeError);
		expect(() => permutations(5, 1.5)).toThrow(RangeError);
	});

	it(`n が ${MAX_SAFE_N} を超える → RangeError`, () => {
		expect(() => permutations(MAX_SAFE_N + 1, 1)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => permutations(value, 1)).toThrow(RangeError);
		});
		it(`${label} な r → RangeError`, () => {
			expect(() => permutations(5, value)).toThrow(RangeError);
		});
	}
});

describe('combinations (nCr)', () => {
	it('黄金値: 5C2=10, 6C3=20, 4C0=1(手計算値、再検算済み)', () => {
		expect(combinations(5, 2)).toBe(10);
		expect(combinations(6, 3)).toBe(20);
		expect(combinations(4, 0)).toBe(1);
	});

	it('境界: r=0 と r=n はともに1', () => {
		expect(combinations(6, 0)).toBe(1);
		expect(combinations(6, 6)).toBe(1);
	});

	it('r>n → RangeError', () => {
		expect(() => combinations(3, 4)).toThrow(RangeError);
	});

	it('n が負・非整数 → RangeError', () => {
		expect(() => combinations(-1, 0)).toThrow(RangeError);
		expect(() => combinations(2.5, 1)).toThrow(RangeError);
	});

	it('r が負・非整数 → RangeError', () => {
		expect(() => combinations(5, -1)).toThrow(RangeError);
		expect(() => combinations(5, 1.5)).toThrow(RangeError);
	});

	it(`n が ${MAX_SAFE_N} を超える → RangeError`, () => {
		expect(() => combinations(MAX_SAFE_N + 1, 1)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な n → RangeError`, () => {
			expect(() => combinations(value, 1)).toThrow(RangeError);
		});
		it(`${label} な r → RangeError`, () => {
			expect(() => combinations(5, value)).toThrow(RangeError);
		});
	}
});

describe('enumeratePermutations / enumerateCombinations', () => {
	it('r=0 は空タプル1つ ([[]]) を返す(退化例、例外にしない)', () => {
		expect(enumeratePermutations(['A', 'B', 'C'], 0)).toEqual([[]]);
		expect(enumerateCombinations(['A', 'B', 'C'], 0)).toEqual([[]]);
	});

	it('r=n はちょうど1通りの組合せ(全選択)と n! 通りの順列になる', () => {
		expect(enumerateCombinations(['A', 'B', 'C'], 3)).toEqual([['A', 'B', 'C']]);
		expect(enumeratePermutations(['A', 'B'], 2)).toEqual(
			expect.arrayContaining([
				['A', 'B'],
				['B', 'A'],
			]),
		);
		expect(enumeratePermutations(['A', 'B'], 2)).toHaveLength(2);
	});

	it('既知の小例: 3個から2個の順列は6通り、組合せは3通り(手で列挙して再検算済み)', () => {
		const items = ['A', 'B', 'C'];
		const perms = enumeratePermutations(items, 2);
		const combos = enumerateCombinations(items, 2);
		expect(perms).toHaveLength(6);
		expect(combos).toEqual([
			['A', 'B'],
			['A', 'C'],
			['B', 'C'],
		]);
	});

	it('r>items.length → RangeError', () => {
		expect(() => enumeratePermutations(['A', 'B'], 3)).toThrow(RangeError);
		expect(() => enumerateCombinations(['A', 'B'], 3)).toThrow(RangeError);
	});

	it('r が負・非整数 → RangeError', () => {
		expect(() => enumeratePermutations(['A', 'B'], -1)).toThrow(RangeError);
		expect(() => enumerateCombinations(['A', 'B'], 1.5)).toThrow(RangeError);
	});

	it('列挙数上限を超える入力は RangeError(組合せ的爆発からの防御)', () => {
		// 18P10 は ENUMERATION_LIMIT (5000) を大きく超える。
		const items = Array.from({ length: 18 }, (_, i) => i);
		expect(permutations(18, 10)).toBeGreaterThan(ENUMERATION_LIMIT);
		expect(() => enumeratePermutations(items, 10)).toThrow(RangeError);
	});
});

// fast-check 用の共通レンジ。n∈[0,6] に絞る(UI の実運用域 n∈[2,6]をカバーしつつ、
// 列挙のバックトラッキングコストを 6!=720 以下に抑えて実行時間を安定させる)。
// r は n に依存するため fc.chain で従属生成する。
const nrArb = fc.integer({ min: 0, max: 6 }).chain((n) =>
	fc.integer({ min: 0, max: n }).map((r) => [n, r] as const),
);

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (a) 列挙の個数 === 公式の値(再帰列挙 vs 算術式という完全に独立な2経路の突合、C-7)',
		() => {
			fc.assert(
				fc.property(nrArb, ([n, r]) => {
					const items = Array.from({ length: n }, (_, i) => i);
					const permCount = enumeratePermutations(items, r).length;
					const comboCount = enumerateCombinations(items, r).length;
					return permCount === permutations(n, r) && comboCount === combinations(n, r);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (b) nPr === nCr × r!(常に厳密等価、整数演算のみで浮動小数を含まないため)', () => {
		fc.assert(
			fc.property(nrArb, ([n, r]) => permutations(n, r) === combinations(n, r) * factorial(r)),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (c) 対称性 nCr === nC(n−r)', () => {
		fc.assert(
			fc.property(nrArb, ([n, r]) => combinations(n, r) === combinations(n, n - r)),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (d) パスカルの規則 nCr = (n−1)C(r−1) + (n−1)Cr (1≤r≤n−1 の範囲)', () => {
		const pascalArb = fc
			.integer({ min: 2, max: 6 })
			.chain((n) => fc.integer({ min: 1, max: n - 1 }).map((r) => [n, r] as const));
		fc.assert(
			fc.property(pascalArb, ([n, r]) => {
				return combinations(n, r) === combinations(n - 1, r - 1) + combinations(n - 1, r);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (e) 列挙結果に重複がない(Set化して長さが不変)', () => {
		fc.assert(
			fc.property(nrArb, ([n, r]) => {
				const items = Array.from({ length: n }, (_, i) => i);
				const perms = enumeratePermutations(items, r);
				const combos = enumerateCombinations(items, r);
				const permKeys = new Set(perms.map((tuple) => tuple.join(',')));
				const comboKeys = new Set(combos.map((tuple) => tuple.join(',')));
				return permKeys.size === perms.length && comboKeys.size === combos.length;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 組合せの各要素は昇順(items の元の順序を保つ部分集合になっている)', () => {
		fc.assert(
			fc.property(nrArb, ([n, r]) => {
				const items = Array.from({ length: n }, (_, i) => i);
				const combos = enumerateCombinations(items, r);
				return combos.every((tuple) => tuple.every((v, i) => i === 0 || v > tuple[i - 1]));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

// 独立レビュー GrokBuild C1 で追加: 算術系の不変条件は列挙を伴わないため、
// n≤6(列挙突合の共通レンジ)に閉じる理由がない。MAX_SAFE_N=18 の全域で
// 「n≤18 なら厳密等価」というモデルの主張そのものを自動検証する。
describe('invariants (追加: 算術系を n≤18 全域で検証、fast-check seed 42)', () => {
	const fullNrArb = fc.integer({ min: 0, max: 18 }).chain((n) =>
		fc.integer({ min: 0, max: n }).map((r) => [n, r] as const),
	);

	it('property: nPr === nCr × r! が n≤18 の全域で厳密等価', () => {
		fc.assert(
			fc.property(fullNrArb, ([n, r]) => permutations(n, r) === combinations(n, r) * factorial(r)),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property: 対称性 nCr === nC(n−r) が n≤18 の全域で厳密等価', () => {
		fc.assert(
			fc.property(fullNrArb, ([n, r]) => combinations(n, r) === combinations(n, n - r)),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property: パスカルの規則が n≤18 の全域で厳密等価 (n≥1, 1≤r≤n−1)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 18 }).chain((n) =>
					fc.integer({ min: 1, max: n - 1 }).map((r) => [n, r] as const),
				),
				([n, r]) =>
					combinations(n, r) === combinations(n - 1, r - 1) + combinations(n - 1, r),
			),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('黄金値: 上限付近の大きな値も厳密一致 (18C9=48620, 18P10=18!/8!)', () => {
		expect(combinations(18, 9)).toBe(48620);
		expect(permutations(18, 10)).toBe(combinations(18, 10) * factorial(10));
		expect(permutations(18, 18)).toBe(factorial(18));
	});
});
