import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	maclaurinCoefficient,
	maclaurinPartialSum,
	exactValue,
	type MaclaurinFunction,
} from '../maclaurin.js';
import { approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (derivativeFunction.test.ts /
// sequenceLimits.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const ALL_FUNCTIONS: readonly MaclaurinFunction[] = ['sin', 'cos', 'exp', 'log1p'];

describe('maclaurinCoefficient', () => {
	it('sin: 既知値(k=0→0, k=1→1, k=2→0, k=3→-1/6, k=5→1/120)', () => {
		expect(maclaurinCoefficient('sin', 0)).toBe(0);
		expect(maclaurinCoefficient('sin', 1)).toBe(1);
		expect(maclaurinCoefficient('sin', 2)).toBe(0);
		expect(maclaurinCoefficient('sin', 3)).toBeCloseTo(-1 / 6, 12);
		expect(maclaurinCoefficient('sin', 5)).toBeCloseTo(1 / 120, 12);
	});

	it('cos: 既知値(k=0→1, k=1→0, k=2→-1/2, k=4→1/24)', () => {
		expect(maclaurinCoefficient('cos', 0)).toBe(1);
		expect(maclaurinCoefficient('cos', 1)).toBe(0);
		expect(maclaurinCoefficient('cos', 2)).toBeCloseTo(-1 / 2, 12);
		expect(maclaurinCoefficient('cos', 4)).toBeCloseTo(1 / 24, 12);
	});

	it('exp: 既知値(k=0→1, k=1→1, k=2→1/2, k=3→1/6)', () => {
		expect(maclaurinCoefficient('exp', 0)).toBe(1);
		expect(maclaurinCoefficient('exp', 1)).toBe(1);
		expect(maclaurinCoefficient('exp', 2)).toBeCloseTo(1 / 2, 12);
		expect(maclaurinCoefficient('exp', 3)).toBeCloseTo(1 / 6, 12);
	});

	it('log1p: 既知値(k=0→0, k=1→1, k=2→-1/2, k=3→1/3)', () => {
		expect(maclaurinCoefficient('log1p', 0)).toBe(0);
		expect(maclaurinCoefficient('log1p', 1)).toBe(1);
		expect(maclaurinCoefficient('log1p', 2)).toBeCloseTo(-1 / 2, 12);
		expect(maclaurinCoefficient('log1p', 3)).toBeCloseTo(1 / 3, 12);
	});

	it('k が非負整数でない(負・非整数)→ RangeError', () => {
		expect(() => maclaurinCoefficient('sin', -1)).toThrow(RangeError);
		expect(() => maclaurinCoefficient('sin', 1.5)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		for (const fn of ALL_FUNCTIONS) {
			it(`${label} な k(fn=${fn})→ RangeError`, () => {
				expect(() => maclaurinCoefficient(fn, value)).toThrow(RangeError);
			});
		}
	}
});

describe('maclaurinPartialSum', () => {
	// 黄金値(手計算・再検算済み): sin の P3(0.5) = 0.5 - 0.5^3/6 = 0.5 - 0.125/6
	// = 115/240 = 23/48 = 0.479166666...
	it('黄金値(手計算・再検算済み): sin P3(0.5) = 115/240 = 0.479166666...', () => {
		expect(115 / 240).toBeCloseTo(0.4791666666666667, 12);
		expect(maclaurinPartialSum('sin', 3, 0.5)).toBeCloseTo(115 / 240, 12);
	});

	// 黄金値(手計算・再検算済み): exp の P2(1) = 1 + 1 + 1/2 = 2.5
	it('黄金値(手計算・再検算済み): exp P2(1) = 2.5', () => {
		expect(maclaurinPartialSum('exp', 2, 1)).toBe(2.5);
	});

	// 黄金値(手計算・再検算済み): log1p の P3(0.5) = 0.5 - 0.125 + 1/24
	// = 12/24 - 3/24 + 1/24 = 10/24 = 5/12 = 0.416666666...
	it('黄金値(手計算・再検算済み): log1p P3(0.5) = 5/12 = 0.416666666...', () => {
		expect(5 / 12).toBeCloseTo(0.4166666666666667, 12);
		expect(maclaurinPartialSum('log1p', 3, 0.5)).toBeCloseTo(5 / 12, 12);
	});

	it('degree=0 はどの関数も定数項のみ(sin/log1p→0, cos/exp→1)', () => {
		expect(maclaurinPartialSum('sin', 0, 100)).toBe(0);
		expect(maclaurinPartialSum('log1p', 0, 2)).toBe(0);
		expect(maclaurinPartialSum('cos', 0, 100)).toBe(1);
		expect(maclaurinPartialSum('exp', 0, 100)).toBe(1);
	});

	it('x=0 では degree によらず、定数項の値のまま(sin/log1p→0, cos/exp→1)', () => {
		for (const degree of [0, 1, 5, 12]) {
			expect(maclaurinPartialSum('sin', degree, 0)).toBe(0);
			expect(maclaurinPartialSum('cos', degree, 0)).toBe(1);
			expect(maclaurinPartialSum('exp', degree, 0)).toBe(1);
			expect(maclaurinPartialSum('log1p', degree, 0)).toBe(0);
		}
	});

	// 反例(発散の証拠、golden): log1p, x=1.5(収束半径1の外側)では、次数を
	// 4→8→12 と上げるほど誤差が拡大する(手計算・再検算済み: node で独立に検算し、
	// 誤差が 0.6819...→1.8244...→6.2682... と単調に増大することを確認済み)。
	it('反例(golden, 発散の証拠): log1p, x=1.5 で degree 4→8→12 と部分和の誤差が拡大する', () => {
		const x = 1.5;
		const exact = exactValue('log1p', x); // ln(2.5)
		const error4 = Math.abs(maclaurinPartialSum('log1p', 4, x) - exact);
		const error8 = Math.abs(maclaurinPartialSum('log1p', 8, x) - exact);
		const error12 = Math.abs(maclaurinPartialSum('log1p', 12, x) - exact);

		// 手計算(node で独立に再検算済み): P4(1.5)=0.234375, P8(1.5)≈-0.908078,
		// P12(1.5)≈-5.351878、真の値 ln(2.5)≈0.916291。
		expect(error4).toBeCloseTo(0.6819157318741551, 9);
		expect(error8).toBeCloseTo(1.8243682988384409, 9);
		expect(error12).toBeCloseTo(6.268168236693555, 9);

		expect(error4).toBeLessThan(error8);
		expect(error8).toBeLessThan(error12);
	});

	it('degree・x が非有限・不正 → RangeError', () => {
		expect(() => maclaurinPartialSum('sin', -1, 1)).toThrow(RangeError);
		expect(() => maclaurinPartialSum('sin', 2.5, 1)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な x → RangeError`, () => {
			expect(() => maclaurinPartialSum('sin', 3, value)).toThrow(RangeError);
		});
		it(`${label} な degree → RangeError`, () => {
			expect(() => maclaurinPartialSum('sin', value, 1)).toThrow(RangeError);
		});
	}
});

describe('exactValue', () => {
	it('既知値: sin(0)=0, cos(0)=1, exp(0)=1, log1p(0)=0', () => {
		expect(exactValue('sin', 0)).toBe(0);
		expect(exactValue('cos', 0)).toBe(1);
		expect(exactValue('exp', 0)).toBe(1);
		expect(exactValue('log1p', 0)).toBe(0);
	});

	it('log1p: x<=-1 → RangeError(真数が0以下になり定義されない)', () => {
		expect(() => exactValue('log1p', -1)).toThrow(RangeError);
		expect(() => exactValue('log1p', -2)).toThrow(RangeError);
	});

	it('log1p: x>-1 では例外なく計算できる(境界のすぐ内側 x=-0.999)', () => {
		expect(() => exactValue('log1p', -0.999)).not.toThrow();
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		for (const fn of ALL_FUNCTIONS) {
			it(`${label} な x(fn=${fn})→ RangeError`, () => {
				expect(() => exactValue(fn, value)).toThrow(RangeError);
			});
		}
	}
});

// 不変条件テスト(fast-check, seed 42)。C-7: lib/math の不変条件テストは自己確認的な検証
// (同じ式へ戻すだけ)を合格条件として認めない。ここでは
// (1) maclaurinPartialSum(級数の打ち切り) と exactValue(Math.sin/cos/exp/log1p という
//     独立実装のオラクル)という2つの別々の公開関数を突き合わせ、
// (2) 係数規則どうしの導関数関係という、打ち切り誤差とは無関係な恒等式を検証する。
describe('invariants (fast-check, seed 42)', () => {
	const DEGREE = 10;

	// テスト専用の独立した階乗(オラクル側の剰余上界を構成するためだけに使う、
	// maclaurinCoefficient の内部実装とは無関係な標準的な数学公式)。
	function factorialForBound(n: number): number {
		let result = 1;
		for (let i = 2; i <= n; i++) result *= i;
		return result;
	}
	const NEXT_FACTORIAL = factorialForBound(DEGREE + 1); // 11!

	// 浮動小数点演算そのものの丸め誤差の床(x が0に近いと理論上の剰余上界が
	// double の丸め誤差(machine epsilon オーダー)より小さくなり、理論値どうしの
	// 比較が意味をなさなくなるため、実務上無害な絶対誤差の床を設ける。node での
	// 大規模ランダムサンプリング(50万件)で 1e-12 の床があれば違反0件であることを
	// 事前に確認済み)。
	const BOUND_FLOOR = 1e-12;

	it(
		'property (a): オラクル突合 — |x|<=1, degree=10 で |partialSum-exactValue| は' +
			'剰余上界以下(sin/cos: ラグランジュの剰余 |x|^(d+1)/(d+1)!、|sin^(n)|,|cos^(n)|<=1' +
			'であることに基づく。exp: 同じくラグランジュの剰余に e^ξ<=e^|x|<=e(|x|<=1のため)を' +
			'掛けた e・|x|^(d+1)/(d+1)!。log1p: x∈[0,1] では係数が交代級数になり(項の符号が' +
			'k毎に反転し、項の絶対値 x^k/k は x<=1 で単調減少するため)、交代級数の剰余上界=' +
			'次に切り捨てた項の絶対値 x^(d+1)/(d+1) が使える。log1p は x<0 では交代級数に' +
			'ならない(このテストでは x∈[0,1] に限定し、負の x での挙動は golden の反例テスト' +
			'(x=1.5での発散)や記事の転用問題で別途扱う))',
		() => {
			const cases = fc.oneof(
				fc.record({ fn: fc.constant<MaclaurinFunction>('sin'), x: fc.double({ min: -1, max: 1, noNaN: true }) }),
				fc.record({ fn: fc.constant<MaclaurinFunction>('cos'), x: fc.double({ min: -1, max: 1, noNaN: true }) }),
				fc.record({ fn: fc.constant<MaclaurinFunction>('exp'), x: fc.double({ min: -1, max: 1, noNaN: true }) }),
				fc.record({ fn: fc.constant<MaclaurinFunction>('log1p'), x: fc.double({ min: 0, max: 1, noNaN: true }) }),
			);
			fc.assert(
				fc.property(cases, ({ fn, x }) => {
					const approx = maclaurinPartialSum(fn, DEGREE, x);
					const exact = exactValue(fn, x);
					const actualError = Math.abs(approx - exact);

					let bound: number;
					if (fn === 'sin' || fn === 'cos') {
						bound = Math.abs(x) ** (DEGREE + 1) / NEXT_FACTORIAL;
					} else if (fn === 'exp') {
						bound = Math.E * Math.abs(x) ** (DEGREE + 1) / NEXT_FACTORIAL;
					} else {
						bound = Math.abs(x) ** (DEGREE + 1) / (DEGREE + 1);
					}

					return actualError <= Math.max(bound, BOUND_FLOOR);
				}),
				{ seed: 42, numRuns: 300 },
			);
		},
	);

	it(
		'property (b): 微分関係の係数恒等式 — (k+1)・coeff_sin(k+1) === coeff_cos(k)' +
			'(sinの導関数がcosであることの係数版。両辺は maclaurinCoefficient の別々の呼び出し' +
			'であり、同じ式へ戻すだけの自己確認ではない。近似はEPSILON=1e-9相対のcompare.tsで判定)',
		() => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 30 }), (k) => {
					const lhs = (k + 1) * maclaurinCoefficient('sin', k + 1);
					const rhs = maclaurinCoefficient('cos', k);
					const scale = Math.max(Math.abs(lhs), Math.abs(rhs));
					return approximatelyZero(lhs - rhs, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (c): exp は自己微分 — (k+1)・coeff_exp(k+1) === coeff_exp(k)' +
			'(expの導関数が自分自身であることの係数版、独立した2呼び出しの突合)',
		() => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 30 }), (k) => {
					const lhs = (k + 1) * maclaurinCoefficient('exp', k + 1);
					const rhs = maclaurinCoefficient('exp', k);
					const scale = Math.max(Math.abs(lhs), Math.abs(rhs));
					return approximatelyZero(lhs - rhs, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (d): 非有限入力は maclaurinCoefficient / maclaurinPartialSum / exactValue いずれもRangeError', () => {
		fc.assert(
			fc.property(fc.constantFrom(...ALL_FUNCTIONS), fc.constantFrom(NaN, Infinity, -Infinity), (fn, bad) => {
				const coeffThrows = (() => {
					try {
						maclaurinCoefficient(fn, bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const partialSumThrows = (() => {
					try {
						maclaurinPartialSum(fn, 3, bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const exactValueThrows = (() => {
					try {
						exactValue(fn, bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				return coeffThrows && partialSumThrows && exactValueThrows;
			}),
			{ seed: 42, numRuns: 20 },
		);
	});
});
