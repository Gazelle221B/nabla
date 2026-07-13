import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	evaluatePoly,
	exactDerivativePoly,
	toDifferentiableFunction,
	type Polynomial,
} from '../derivativeFunction.js';
// derivative.ts の differenceQuotient / derivativeAt を「独立の検証経路」として使う
// (タスク厳守: exactDerivativePoly の係数規則をエコーせず、既存モジュールの h→0 収束
// との突合で検証する。C-7 の自己確認的テスト禁止に対応)。
import { differenceQuotient, derivativeAt } from '../derivative.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー
// (lawOfSinesCosines.test.ts と同じ方針: 一部の引数だけでなく全引数を網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('evaluatePoly', () => {
	it('f(x)=x^2, x=3 → 9 (既知値)', () => {
		expect(evaluatePoly([0, 0, 1], 3)).toBe(9);
	});

	it('f(x)=1+2x+3x^2, x=2 → 1+4+12=17 (ホーナー法の既知値検証)', () => {
		expect(evaluatePoly([1, 2, 3], 2)).toBe(17);
	});

	it('定数関数 f(x)=7 は x に依らず 7', () => {
		expect(evaluatePoly([7], -100)).toBe(7);
		expect(evaluatePoly([7], 100)).toBe(7);
	});

	it('係数がゼロだけでも有効 (退化ではなく通常値, MATH_CONVENTIONS §4)', () => {
		expect(evaluatePoly([0], 5)).toBe(0);
	});

	it('空配列 → RangeError (次数が定まらない不正値)', () => {
		expect(() => evaluatePoly([], 1)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な x → RangeError`, () => {
			expect(() => evaluatePoly([0, 0, 1], value)).toThrow(RangeError);
		});
		it(`${label} な係数 (coeffs[1]) → RangeError`, () => {
			expect(() => evaluatePoly([0, value, 1], 1)).toThrow(RangeError);
		});
	}
});

describe('exactDerivativePoly', () => {
	it('既知例: f(x)=x^2 → f\'(x)=2x (x=3→6, x=-2→-4)', () => {
		const derivCoeffs = exactDerivativePoly([0, 0, 1]);
		expect(evaluatePoly(derivCoeffs, 3)).toBe(6);
		expect(evaluatePoly(derivCoeffs, -2)).toBe(-4);
	});

	it('既知例: f(x)=x^3 → f\'(x)=3x^2 (x=2→12, x=-1→3)', () => {
		const derivCoeffs = exactDerivativePoly([0, 0, 0, 1]);
		expect(evaluatePoly(derivCoeffs, 2)).toBe(12);
		expect(evaluatePoly(derivCoeffs, -1)).toBe(3);
	});

	it('既知例: 定数関数 f(x)=5 → f\'(x)=0 (どの x でも)', () => {
		const derivCoeffs = exactDerivativePoly([5]);
		expect(evaluatePoly(derivCoeffs, -10)).toBe(0);
		expect(evaluatePoly(derivCoeffs, 10)).toBe(0);
	});

	it('空配列 → RangeError', () => {
		expect(() => exactDerivativePoly([])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な係数 → RangeError`, () => {
			expect(() => exactDerivativePoly([1, value, 3])).toThrow(RangeError);
		});
	}
});

describe('toDifferentiableFunction', () => {
	it('空配列 → RangeError', () => {
		expect(() => toDifferentiableFunction([])).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な係数 → RangeError`, () => {
			expect(() => toDifferentiableFunction([0, value])).toThrow(RangeError);
		});
	}

	it('f(x)=x^2 を包んだ DifferentiableFunction は derivative.ts の tangentLine 等にそのまま渡せる (重複実装しない設計の確認)', () => {
		const fn = toDifferentiableFunction([0, 0, 1]);
		expect(fn.evaluate(3)).toBe(9);
		expect(derivativeAt(fn, 3)).toBe(6);
	});
});

// 既知の2階微分の上界 (この単元で扱う多項式のみに限定, derivative.test.ts の
// SECOND_DERIVATIVE_BOUNDS と同じ考え方)。f(x)=a2 x^2 + a1 x + a0 なら f''=2a2 (定数)。
// f(x)=a3 x^3 + ... なら f''=6a3 x + 2a2 なので |x|<=5, |h|<=1 の探索域 (x+h∈[-6,6]) で
// max|f''| = 6*|a3|*6 + 2*|a2| という上界が立てられる。
const POLY_CASES: { coeffs: Polynomial; secondDerivativeBound: number; label: string }[] = [
	{ coeffs: [0, 0, 1], secondDerivativeBound: 2, label: 'x^2' }, // f''=2
	{ coeffs: [0, 0, 0, 1], secondDerivativeBound: 36, label: 'x^3' }, // f''=6x, |x|<=6 → 36
	{ coeffs: [5, -3, 2], secondDerivativeBound: 4, label: '2x^2-3x+5' }, // f''=4
	{ coeffs: [-1], secondDerivativeBound: 0, label: '定数 -1' }, // f''=0
];

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it('property: exactDerivativePoly の評価値は differenceQuotient (既存 derivative.ts, 独立経路) の' +
		'h→0 収束と平均値定理の剰余の範囲で一致する (核心の不変条件, C-7: 係数規則をエコーせず突合する)', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...POLY_CASES),
				fc.double({ min: -5, max: 5, noNaN: true }),
				fc.double({ min: 0.05, max: 1, noNaN: true }),
				fc.boolean(),
				({ coeffs, secondDerivativeBound }, x, hMag, negate) => {
					const h = negate ? -hMag : hMag;
					const fn = toDifferentiableFunction(coeffs);
					// derivativeAt は fn.derivative(x) = evaluatePoly(exactDerivativePoly(coeffs), x) を
					// 呼ぶ。これを、fn.evaluate だけを使う独立経路の differenceQuotient と突き合わせる。
					const trueSlope = derivativeAt(fn, x);
					const secant = differenceQuotient(fn, x, h);
					const err = Math.abs(secant - trueSlope);
					const errorBound = (Math.abs(h) / 2) * secondDerivativeBound;
					return err <= errorBound + 1e-9;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	// 線形性 (f+g)' = f'+g' の評価値での検証。加算はテスト側だけの局所ヘルパーとし
	// (lib/math 側には export しない, タスク指示の「必要最小限」に沿う)、
	// evaluatePoly/exactDerivativePoly という公開関数だけを経由して確かめる。
	function addPolynomials(p: Polynomial, q: Polynomial): Polynomial {
		const length = Math.max(p.length, q.length);
		const result: number[] = new Array(length).fill(0);
		for (let i = 0; i < p.length; i++) result[i] += p[i];
		for (let i = 0; i < q.length; i++) result[i] += q[i];
		return result;
	}

	const smallPolyArb = fc.array(fc.double({ min: -20, max: 20, noNaN: true }), {
		minLength: 1,
		maxLength: 4,
	});

	it('property: 線形性 (f+g)\' = f\'+g\' (評価値で確認)', () => {
		fc.assert(
			fc.property(smallPolyArb, smallPolyArb, fc.double({ min: -10, max: 10, noNaN: true }), (p, q, x) => {
				const sum = addPolynomials(p, q);
				const derivSumAtX = evaluatePoly(exactDerivativePoly(sum), x);
				const derivPAtX = evaluatePoly(exactDerivativePoly(p), x);
				const derivQAtX = evaluatePoly(exactDerivativePoly(q), x);
				const lhs = derivSumAtX;
				const rhs = derivPAtX + derivQAtX;
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return Math.abs(lhs - rhs) <= 1e-6 * scale;
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
