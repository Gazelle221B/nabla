import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mean, variance, standardDeviation, covariance, correlation } from '../statistics.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を全引数について検証するための共通ヘルパー
// (combinatorics.test.ts / probability.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('mean', () => {
	it('黄金値: [1,2,3] の平均は2(手計算、再検算済み: (1+2+3)/3=2)', () => {
		expect(mean([1, 2, 3])).toBe(2);
	});

	it('n=1(点1つ)は退化例として例外にせず、平均=その値', () => {
		expect(mean([7])).toBe(7);
	});

	it('空配列 → RangeError(代表値が定義できない)', () => {
		expect(() => mean([])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} を含む配列 → RangeError`, () => {
			expect(() => mean([1, value, 3])).toThrow(RangeError);
		});
	}
});

describe('variance', () => {
	it('黄金値: [1,2,3] の分散は2/3(手計算、再検算済み: 偏差 -1,0,1 → 2乗和2 → 2/3)', () => {
		expect(variance([1, 2, 3])).toBeCloseTo(2 / 3, 12);
	});

	it('n=1(点1つ)は偏差が常に0なので分散0という退化例(例外にしない)', () => {
		expect(variance([5])).toBe(0);
	});

	it('全点同一値 → 分散はちょうど0', () => {
		expect(variance([4, 4, 4, 4])).toBe(0);
	});

	it('空配列 → RangeError', () => {
		expect(() => variance([])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} を含む配列 → RangeError`, () => {
			expect(() => variance([1, value, 3])).toThrow(RangeError);
		});
	}
});

describe('standardDeviation', () => {
	it('黄金値: [1,2,3] の標準偏差は√(2/3)(手計算、再検算済み)', () => {
		expect(standardDeviation([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3), 12);
	});

	it('分散0のとき標準偏差もちょうど0(負の分散にならないため Math.sqrt は常に安全)', () => {
		expect(standardDeviation([4, 4, 4])).toBe(0);
	});

	it('空配列 → RangeError', () => {
		expect(() => standardDeviation([])).toThrow(RangeError);
	});
});

describe('covariance', () => {
	it('黄金値: xs=[1,2,3], ys=[2,4,6] の共分散は4/3(手計算、再検算済み: 偏差積 2,0,2 → 和4 → 4/3)', () => {
		expect(covariance([1, 2, 3], [2, 4, 6])).toBeCloseTo(4 / 3, 12);
	});

	it('黄金値: xs=[1,2,3,4,5], ys=[2,3,5,4,6] の共分散は9/5=1.8(手計算、再検算済み)', () => {
		expect(covariance([1, 2, 3, 4, 5], [2, 3, 5, 4, 6])).toBeCloseTo(1.8, 12);
	});

	it('長さ不一致 → RangeError', () => {
		expect(() => covariance([1, 2, 3], [1, 2])).toThrow(RangeError);
	});

	it('空配列 → RangeError', () => {
		expect(() => covariance([], [])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`xs に ${label} を含む → RangeError`, () => {
			expect(() => covariance([1, value, 3], [1, 2, 3])).toThrow(RangeError);
		});
		it(`ys に ${label} を含む → RangeError`, () => {
			expect(() => covariance([1, 2, 3], [1, value, 3])).toThrow(RangeError);
		});
	}
});

describe('correlation', () => {
	it('黄金値: xs=[1,2,3], ys=[2,4,6](ys=2xs、完全な正の直線関係)は r=1(手計算、再検算済み)', () => {
		expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
	});

	it('黄金値: xs=[1,2,3], ys=[6,4,2](完全な負の直線関係)は r=-1(手計算、再検算済み)', () => {
		expect(correlation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 12);
	});

	it('黄金値: xs=[1,2,3,4,5], ys=[2,3,5,4,6] は r=0.9(手計算、再検算済み: cov=1.8, var(x)=var(y)=2 → 1.8/2=0.9)', () => {
		expect(correlation([1, 2, 3, 4, 5], [2, 3, 5, 4, 6])).toBeCloseTo(0.9, 12);
	});

	it('ys が全点同一値(分散0)→ r は定義されないため null(全点が横一直線に並ぶ状態。GrokBuild 指摘でコメント是正)', () => {
		expect(correlation([1, 2, 3], [5, 5, 5])).toBeNull();
	});

	it('xs が全点同一値(分散0)→ r は定義されないため null(全点が縦一直線に並ぶ状態。GrokBuild 指摘でコメント是正)', () => {
		expect(correlation([7, 7, 7], [1, 2, 3])).toBeNull();
	});

	it('長さ不一致 → RangeError', () => {
		expect(() => correlation([1, 2, 3], [1, 2])).toThrow(RangeError);
	});

	it('空配列 → RangeError', () => {
		expect(() => correlation([], [])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`xs に ${label} を含む → RangeError`, () => {
			expect(() => correlation([1, value, 3], [1, 2, 3])).toThrow(RangeError);
		});
		it(`ys に ${label} を含む → RangeError`, () => {
			expect(() => correlation([1, 2, 3], [1, value, 3])).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。値は -100〜100 に絞る(データ分析の教材が扱う現実的なスケールを
// カバーしつつ、大きすぎる値による桁落ち・オーバーフローの心配なく検証できる範囲)。
const valueArb = fc.double({ min: -100, max: 100, noNaN: true });
const xsArb = fc.array(valueArb, { minLength: 1, maxLength: 8 });
const cArb = fc.double({ min: -50, max: 50, noNaN: true });
const nonZeroFactorArb = fc.double({ min: -20, max: 20, noNaN: true }).filter((a) => Math.abs(a) > 0.01);

// 分散>0(非退化)を保証する配列: 整数かつ少なくとも2つの異なる値を含む(全点同一値ではない)。
// 相関係数関連の性質は分散>0を前提とするため、フィルタで退化ケースを除く必要があるが、
// 単に Set 化して distinct 値が2つ以上あることを条件にするだけでは不十分だった
// (実測: fc.double は非正規化数を生成しうり、例えば [0, -5e-324] は技術的には2つの
// 異なる値だが、その差は浮動小数点の分解能を下回るほど微小で、変換後の分散が
// spreadScale の相対誤差判定内で実質0になり、correlation が null を返してしまう
// ——「非退化」のつもりが実際には退化ケースを生成していたバグ)。整数かつ uniqueArray
// (要素間の差が必ず1以上)にすることで、常に意味のある散らばりを持つ配列だけを生成する。
const nonDegenerateArb = fc.uniqueArray(fc.integer({ min: -50, max: 50 }), { minLength: 2, maxLength: 6 });

// xs・ys が同じ長さの非退化配列のペア(長さを先に決めてから両方生成する、fc.chain による従属生成)。
const nonDegeneratePairArb = fc.integer({ min: 2, max: 6 }).chain((n) =>
	fc.tuple(
		fc.uniqueArray(fc.integer({ min: -50, max: 50 }), { minLength: n, maxLength: n }),
		fc.uniqueArray(fc.integer({ min: -50, max: 50 }), { minLength: n, maxLength: n }),
	),
);

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it('property (a-1) 平均の平行移動不変性: mean(xs+c) = mean(xs)+c', () => {
		fc.assert(
			fc.property(xsArb, cArb, (xs, c) => {
				const m = mean(xs);
				const translated = xs.map((x) => x + c);
				const scale = Math.max(1, Math.abs(m), Math.abs(c));
				return approximatelyZero(mean(translated) - (m + c), scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (a-2) 平均のスケール性: mean(c·xs) = c·mean(xs)', () => {
		fc.assert(
			fc.property(xsArb, cArb, (xs, c) => {
				const m = mean(xs);
				const scaled = xs.map((x) => c * x);
				const expected = c * m;
				const scale = Math.max(1, Math.abs(expected));
				return approximatelyZero(mean(scaled) - expected, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (b-1) 分散の平行移動不変性: variance(xs+c) = variance(xs)(平行移動しても散らばりは変わらない)', () => {
		fc.assert(
			fc.property(xsArb, cArb, (xs, c) => {
				const v = variance(xs);
				const translated = xs.map((x) => x + c);
				const scale = Math.max(1, v);
				return approximatelyZero(variance(translated) - v, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (b-2) 分散のスケール性: variance(c·xs) = c²·variance(xs)', () => {
		fc.assert(
			fc.property(xsArb, cArb, (xs, c) => {
				const v = variance(xs);
				const scaled = xs.map((x) => c * x);
				const expected = c * c * v;
				const scale = Math.max(1, Math.abs(expected));
				return approximatelyZero(variance(scaled) - expected, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (c) 相関の不変性: correlation(a·xs+b, ys) = sign(a)·correlation(xs,ys) (a≠0、xsのアフィン変換で符号以外は不変)', () => {
		fc.assert(
			fc.property(nonDegeneratePairArb, nonZeroFactorArb, cArb, ([xs, ys], a, b) => {
				const original = correlation(xs, ys);
				const transformed = correlation(
					xs.map((x) => a * x + b),
					ys,
				);
				// nonDegeneratePairArb は分散>0を保証しており、xs を a≠0 でアフィン変換しても
				// 分散>0のままなので、どちらも null にはならないはず(構造的に到達しないが
				// 念のため防御的に確認する)。
				if (original === null || transformed === null) return false;
				const expected = Math.sign(a) * original;
				return approximatelyZero(transformed - expected, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (d) 相関の範囲: |r| ≤ 1(コーシー・シュワルツの不等式)', () => {
		fc.assert(
			fc.property(nonDegeneratePairArb, ([xs, ys]) => {
				const r = correlation(xs, ys);
				if (r === null) return false; // nonDegeneratePairArb では null は起こらないはず
				// 浮動小数点の丸めによりごくわずかに1を超えうる余地だけスケール相対誤差で許容する。
				return Math.abs(r) <= 1 || approximatelyZero(Math.abs(r) - 1, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property (e) 完全な直線データでは r=sign(m)(構成的生成: ys=m·xs+c, m≠0 → |r|=1)', () => {
		fc.assert(
			fc.property(nonDegenerateArb, nonZeroFactorArb, cArb, (xs, m, c) => {
				const ys = xs.map((x) => m * x + c);
				const r = correlation(xs, ys);
				if (r === null) return false; // xs 非退化かつ m≠0 なら ys も非退化のはず
				return approximatelyZero(r - Math.sign(m), 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	// 分散の2定義 Σ(x−x̄)²/n(実装、variance.ts 本体)と E[x²]−x̄²(数学的に代数同値)の突合。
	// C-7: 自己確認的な検証を避けるため、E[x²]−x̄² はここでテスト側が variance() を一切呼ばずに
	// 独立に計算する(実装が分離された2経路の突合であって、同じ式へ戻すだけの確認ではない)。
	// 検出力についての限定: 両者は代数的に同値な式であり、実装のバグ(例: nで割り忘れ、
	// 符号の誤りなど)を検出できるが、分散の定義そのものが数学的に誤っている場合(そもそも
	// 母集団分散ではなく別の量を計算していた場合)は両実装が同じ誤りを共有しない限りにおいて
	// 検出できる、という意味での独立性である(過大に主張しない)。
	function independentMeanOfSquares(xs: readonly number[]): number {
		let sum = 0;
		for (const x of xs) sum += x * x;
		return sum / xs.length;
	}

	it('property (f) 分散の2定義の突合: Σ(x−x̄)²/n(実装)と E[x²]−x̄²(テスト側で独立に計算)が一致', () => {
		fc.assert(
			fc.property(xsArb, (xs) => {
				const m = mean(xs);
				const altVariance = independentMeanOfSquares(xs) - m * m;
				const implVariance = variance(xs);
				const scale = Math.max(1, Math.abs(altVariance), Math.abs(implVariance));
				return approximatelyZero(implVariance - altVariance, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

// 独立レビュー GrokBuild の指摘で追加: アフィン不変 property は xs 側のみだったため、
// ys 側の変換 correlation(xs, a·ys+b) = sign(a)·correlation(xs,ys) も対称に検証する。
describe('invariants (追加: ys 側のアフィン不変、fast-check seed 42)', () => {
	it('property: correlation(xs, a·ys+b) = sign(a)·correlation(xs, ys) (a≠0)', () => {
		fc.assert(
			fc.property(
				nonDegeneratePairArb,
				fc.double({ min: -5, max: 5, noNaN: true }).filter((a) => Math.abs(a) > 0.1),
				fc.double({ min: -10, max: 10, noNaN: true }),
				([xs, ys], a, b) => {
					const original = correlation(xs, ys) as number;
					const transformed = correlation(xs, ys.map((y) => a * y + b)) as number;
					const expected = Math.sign(a) * original;
					return approximatelyZero(transformed - expected, Math.max(1, Math.abs(expected)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
