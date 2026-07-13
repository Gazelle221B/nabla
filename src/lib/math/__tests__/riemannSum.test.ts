import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { riemannSumLeft, exactIntegralPoly } from '../riemannSum.js';
// exactDerivativePoly (derivativeFunction.ts, 既存・独立実装) を「区間全体を覆う max|f'| の
// 粗い上界」を組み立てるためだけに使う。riemannSumLeft の係数規則をエコーするものではない
// (C-7: 自己確認的テスト禁止。riemannSumLeft は総和、exactIntegralPoly は係数規則という
// 2つの独立経路の突合が核)。
import { exactDerivativePoly, type Polynomial } from '../derivativeFunction.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (lawOfSinesCosines.test.ts / derivativeFunction.test.ts と同じ方針: 一部の引数だけでなく
// 全引数を網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('riemannSumLeft', () => {
	it('f(x)=1 (定数), [0,2], n=4 → 各長方形の高さ1・幅0.5 の合計 = 2 (既知値)', () => {
		expect(riemannSumLeft([1], 0, 2, 4)).toBeCloseTo(2, 12);
	});

	it('f(x)=x, [0,1], n=2: 左端点 0, 0.5 の高さ・幅0.5 → 0*0.5 + 0.5*0.5 = 0.25', () => {
		expect(riemannSumLeft([0, 1], 0, 1, 2)).toBeCloseTo(0.25, 12);
	});

	it('n=1 (長方形1本): 左端点だけの高さ×区間幅', () => {
		// f(x)=x^2, [0,2], n=1 → f(0)*2 = 0
		expect(riemannSumLeft([0, 0, 1], 0, 2, 1)).toBe(0);
	});

	it('n が大きいほど exactIntegralPoly に近づく (収束の方向性, f(x)=x^2, [0,1])', () => {
		const exact = exactIntegralPoly([0, 0, 1], 0, 1);
		const errN10 = Math.abs(riemannSumLeft([0, 0, 1], 0, 1, 10) - exact);
		const errN1000 = Math.abs(riemannSumLeft([0, 0, 1], 0, 1, 1000) - exact);
		expect(errN1000).toBeLessThan(errN10);
	});

	it('n=0 → RangeError (長方形0本は無意味)', () => {
		expect(() => riemannSumLeft([0, 0, 1], 0, 1, 0)).toThrow(RangeError);
	});

	it('n が負 → RangeError', () => {
		expect(() => riemannSumLeft([0, 0, 1], 0, 1, -3)).toThrow(RangeError);
	});

	it('n が非整数 → RangeError', () => {
		expect(() => riemannSumLeft([0, 0, 1], 0, 1, 2.5)).toThrow(RangeError);
	});

	it('lower === upper (区間の幅が0) → RangeError (退化)', () => {
		expect(() => riemannSumLeft([0, 0, 1], 1, 1, 4)).toThrow(RangeError);
	});

	it('lower > upper (逆向きの区間は未対応) → RangeError', () => {
		expect(() => riemannSumLeft([0, 0, 1], 1, 0, 4)).toThrow(RangeError);
	});

	it('空配列の coeffs → RangeError', () => {
		expect(() => riemannSumLeft([], 0, 1, 4)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な coeffs[0] → RangeError`, () => {
			expect(() => riemannSumLeft([value, 1], 0, 1, 4)).toThrow(RangeError);
		});
		it(`${label} な lower → RangeError`, () => {
			expect(() => riemannSumLeft([0, 0, 1], value, 1, 4)).toThrow(RangeError);
		});
		it(`${label} な upper → RangeError`, () => {
			expect(() => riemannSumLeft([0, 0, 1], 0, value, 4)).toThrow(RangeError);
		});
		it(`${label} な n → RangeError`, () => {
			expect(() => riemannSumLeft([0, 0, 1], 0, 1, value)).toThrow(RangeError);
		});
	}
});

describe('exactIntegralPoly', () => {
	it('既知例: ∫₀¹ x² dx = 1/3', () => {
		expect(exactIntegralPoly([0, 0, 1], 0, 1)).toBeCloseTo(1 / 3, 12);
	});

	it('既知例: ∫₀¹ x dx = 1/2', () => {
		expect(exactIntegralPoly([0, 1], 0, 1)).toBeCloseTo(0.5, 12);
	});

	it('既知例: ∫₀² 1 dx = 2 (定数関数)', () => {
		expect(exactIntegralPoly([1], 0, 2)).toBeCloseTo(2, 12);
	});

	it('既知例: ∫₋₁¹ x² dx = 2/3 (負の下限を含む区間)', () => {
		expect(exactIntegralPoly([0, 0, 1], -1, 1)).toBeCloseTo(2 / 3, 12);
	});

	it('空配列の coeffs → RangeError', () => {
		expect(() => exactIntegralPoly([], 0, 1)).toThrow(RangeError);
	});

	it('lower === upper (区間の幅が0) → RangeError', () => {
		expect(() => exactIntegralPoly([0, 0, 1], 1, 1)).toThrow(RangeError);
	});

	it('lower > upper → RangeError', () => {
		expect(() => exactIntegralPoly([0, 0, 1], 1, 0)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な coeffs[0] → RangeError`, () => {
			expect(() => exactIntegralPoly([value, 1], 0, 1)).toThrow(RangeError);
		});
		it(`${label} な lower → RangeError`, () => {
			expect(() => exactIntegralPoly([0, 0, 1], value, 1)).toThrow(RangeError);
		});
		it(`${label} な upper → RangeError`, () => {
			expect(() => exactIntegralPoly([0, 0, 1], 0, value)).toThrow(RangeError);
		});
	}
});

// max|f'(x)| (x∈[lower,upper]) の粗い上界。三角不等式による見積り:
// f'(x) = Σ dᵢxⁱ (dᵢ = exactDerivativePoly(coeffs)[i]) に対し、
// |f'(x)| <= Σ |dᵢ|・|x|ⁱ <= Σ |dᵢ|・Mⁱ  (M = max(|lower|, |upper|))。
// M は区間 [lower, upper] の両端の絶対値の大きい方であり、区間内の任意の x で |x|<=M が
// 成り立つため、この上界は評価区間全体 [lower, upper] を覆う (レビュー学習: 誤差上界の
// 較正は評価区間全体を覆うこと。前単元 C1 の教訓と同じ理由で、区間の「一部」だけを
// 見積もりの根拠にしない)。
function maxAbsDerivativeBound(coeffs: Polynomial, lower: number, upper: number): number {
	const derivCoeffs = exactDerivativePoly(coeffs);
	const scale = Math.max(Math.abs(lower), Math.abs(upper));
	let bound = 0;
	for (let i = 0; i < derivCoeffs.length; i++) {
		bound += Math.abs(derivCoeffs[i]) * scale ** i;
	}
	return bound;
}

// fast-check 用の小さな多項式 (次数最大3, 係数の絶対値5以内) と、幅0.1以上5以内の
// 順方向区間 [lower, upper]。derivativeFunction.test.ts と同じレンジ感覚で、
// 上界計算 (scale**i, i<=3) が扱いやすい大きさに留める。
const smallPolyArb = fc.array(fc.double({ min: -5, max: 5, noNaN: true }), {
	minLength: 1,
	maxLength: 4,
});

const intervalArb = fc
	.tuple(fc.double({ min: -5, max: 4, noNaN: true }), fc.double({ min: 0.1, max: 5, noNaN: true }))
	.map(([lower, width]) => [lower, lower + width] as const);

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 収束 — |riemannSumLeft − exactIntegralPoly| は左端点和の標準誤差上界 ' +
			'(upper−lower)²・max|f′|/(2n) 以内に収まる (核心の不変条件, C-7: riemannSumLeft(総和) と ' +
			'exactIntegralPoly(係数規則) という独立経路の突合)。' +
			'導出: 各小区間 [xᵢ, xᵢ+width] で f(x)=f(xᵢ)+f\'(ξ)(x−xᵢ) (ξ は xᵢ と x の間) と書けるので ' +
			'|∫f dx − f(xᵢ)・width| <= max|f\'|・width²/2。n個の小区間の合計で ' +
			'max|f\'|・width²・n/2 = max|f\'|・(upper−lower)²/(2n) (width=(upper−lower)/n を代入)。',
		() => {
			fc.assert(
				fc.property(smallPolyArb, intervalArb, fc.integer({ min: 1, max: 50 }), (coeffs, interval, n) => {
					const [lower, upper] = interval;
					const approx = riemannSumLeft(coeffs, lower, upper, n);
					const exact = exactIntegralPoly(coeffs, lower, upper);
					const err = Math.abs(approx - exact);
					const bound =
						((upper - lower) ** 2 * maxAbsDerivativeBound(coeffs, lower, upper)) / (2 * n) + 1e-9;
					return err <= bound;
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	// 線形性: ∫(f+g) = ∫f + ∫g。係数の和を取ってから積分するのと、それぞれ積分してから
	// 足すのが一致することを、exactIntegralPoly (係数規則) だけを経由して確かめる
	// (derivativeFunction.test.ts の「線形性 (f+g)'=f'+g'」と対になる不変条件)。
	function addPolynomials(p: Polynomial, q: Polynomial): Polynomial {
		const length = Math.max(p.length, q.length);
		const result: number[] = new Array(length).fill(0);
		for (let i = 0; i < p.length; i++) result[i] += p[i];
		for (let i = 0; i < q.length; i++) result[i] += q[i];
		return result;
	}

	it('property: 線形性 ∫(f+g) = ∫f + ∫g', () => {
		fc.assert(
			fc.property(smallPolyArb, smallPolyArb, intervalArb, (p, q, interval) => {
				const [lower, upper] = interval;
				const sum = addPolynomials(p, q);
				const lhs = exactIntegralPoly(sum, lower, upper);
				const rhs = exactIntegralPoly(p, lower, upper) + exactIntegralPoly(q, lower, upper);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return Math.abs(lhs - rhs) <= 1e-6 * scale;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	// 区間加法性: ∫ₐᵇ f + ∫ᵦᶜ f = ∫ₐᶜ f。exactIntegralPoly の独立性質 (riemannSumLeft を経由しない)。
	const orderedTripleArb = fc
		.tuple(
			fc.double({ min: -5, max: 3, noNaN: true }),
			fc.double({ min: 0.1, max: 3, noNaN: true }),
			fc.double({ min: 0.1, max: 3, noNaN: true }),
		)
		.map(([a, gap1, gap2]) => [a, a + gap1, a + gap1 + gap2] as const);

	it('property: 区間加法性 ∫ₐᵇ f + ∫ᵦᶜ f = ∫ₐᶜ f', () => {
		fc.assert(
			fc.property(smallPolyArb, orderedTripleArb, (coeffs, triple) => {
				const [a, b, c] = triple;
				const lhs = exactIntegralPoly(coeffs, a, b) + exactIntegralPoly(coeffs, b, c);
				const rhs = exactIntegralPoly(coeffs, a, c);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return Math.abs(lhs - rhs) <= 1e-6 * scale;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
