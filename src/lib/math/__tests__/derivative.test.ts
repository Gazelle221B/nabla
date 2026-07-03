import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	differenceQuotient,
	derivativeAt,
	evaluateLine,
	secantLine,
	tangentLine,
	type DifferentiableFunction,
} from '../derivative.js';

const EPSILON = 1e-9;

function approximatelyZero(value: number, scale: number): boolean {
	return Math.abs(value) <= EPSILON * Math.max(1, Math.abs(scale));
}

// 既知の閉じた式を持つテスト用関数。derivative は「テストが独自に(手計算で)知っている
// 事実」として与える — derivative.ts の関数を呼び出して逆算したものではない
// (自己確認的テスト禁止, DESIGN.md §数学的正しさの検証規約)。
const SQUARE: DifferentiableFunction = { evaluate: (x) => x * x, derivative: (x) => 2 * x };
const CUBE: DifferentiableFunction = { evaluate: (x) => x * x * x, derivative: (x) => 3 * x * x };
const SIN: DifferentiableFunction = { evaluate: (x) => Math.sin(x), derivative: (x) => Math.cos(x) };

describe('differenceQuotient', () => {
	it('f(x)=x^2, x=1, h=1: (4-1)/1 = 3 (既知の整数値で検証)', () => {
		expect(differenceQuotient(SQUARE, 1, 1)).toBe(3);
	});

	it('f(x)=x^2, x=2, h=0.5: (6.25-4)/0.5 = 4.5', () => {
		expect(differenceQuotient(SQUARE, 2, 0.5)).toBeCloseTo(4.5, 12);
	});

	it('f(x)=x^3, x=1, h=1: (8-1)/1 = 7', () => {
		expect(differenceQuotient(CUBE, 1, 1)).toBe(7);
	});

	it('h=0 → RangeError (ゼロ除算は事前条件違反, MATH_CONVENTIONS §3)', () => {
		expect(() => differenceQuotient(SQUARE, 1, 0)).toThrow(RangeError);
	});

	it('h が実質ゼロ (approximatelyZero の境界 EPSILON/2) → RangeError', () => {
		// compare.ts の EPSILON と同じ値 (ファイル先頭の EPSILON 定数)。approximatelyZero(h,1) は
		// |h|<=EPSILON で真になるため、その内側 (EPSILON/2) は「実質ゼロ」としてゼロ除算と
		// 同様に扱われることを境界値として確認する。
		expect(() => differenceQuotient(SQUARE, 1, EPSILON / 2)).toThrow(RangeError);
		expect(() => differenceQuotient(SQUARE, 1, -EPSILON / 2)).toThrow(RangeError);
	});

	it('h が境界のすぐ外側 (2*EPSILON) なら RangeError にならない', () => {
		expect(() => differenceQuotient(SQUARE, 1, 2 * EPSILON)).not.toThrow();
	});

	it('NaN な x → RangeError', () => {
		expect(() => differenceQuotient(SQUARE, NaN, 1)).toThrow(RangeError);
	});

	it('Infinity な h → RangeError', () => {
		expect(() => differenceQuotient(SQUARE, 1, Infinity)).toThrow(RangeError);
	});

	it('x は有限で f(x) も有限だが f(x+h) がオーバーフローする → メッセージは "x" ではなく "x + h" を指す', () => {
		// x=1e150 は x 自身も f(x)=x^2=1e300 も有限。h=2e154 も有限で x+h=2.0001e154 も有限
		// (加算はオーバーフローしない)。しかし f(x+h)=(x+h)^2 は double の範囲を超え Infinity
		// になる。悪いのは x ではなく x+h (とその評価値) なので、エラーメッセージがそれを
		// 正しく示すことを確認する (Copilot レビュー指摘: evaluateAt に label 引数がない
		// 旧実装では常に "x" と表示され、実際には問題ない x を誤って指し示していた)。
		const x = 1e150;
		const h = 2e154;
		expect(Number.isFinite(x)).toBe(true);
		expect(Number.isFinite(x + h)).toBe(true);
		expect(() => differenceQuotient(SQUARE, x, h)).toThrow(/x \+ h/);
	});

	it('property: f(x)=x^2 の差分商は解析的に 2x+h に厳密一致する', () => {
		// (x+h)^2 - x^2 = 2xh + h^2 なので ((x+h)^2 - x^2)/h = 2x + h。
		// これは derivative.ts の内部実装を経由しない独立した代数的事実。
		// h を極端に小さくすると (x+h)^2 と x^2 の桁落ち(catastrophic cancellation)で
		// 浮動小数点誤差が |h| に反比例して増大するため、|h| の下限を実用域(UI の h
		// スライダー最小値と同オーダー)に保ち、許容誤差にも x^2 のスケールを含める。
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -10, max: 10, noNaN: true }).filter((h) => Math.abs(h) > 1e-3),
				(x, h) => {
					const q = differenceQuotient(SQUARE, x, h);
					const expected = 2 * x + h;
					return approximatelyZero(q - expected, Math.max(1, Math.abs(expected), x * x));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 差分商は始点と向きに依らない (割線の傾きは対称): Q(x,h) = Q(x+h,-h)', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(SQUARE, CUBE, SIN),
				fc.double({ min: -10, max: 10, noNaN: true }),
				fc.double({ min: 0.05, max: 5, noNaN: true }),
				fc.boolean(),
				(fn, x, hMag, negate) => {
					const h = negate ? -hMag : hMag;
					const forward = differenceQuotient(fn, x, h);
					const backward = differenceQuotient(fn, x + h, -h);
					return approximatelyZero(forward - backward, Math.max(1, Math.abs(forward)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('derivativeAt', () => {
	it('f(x)=x^2, x=3: 2*3=6', () => {
		expect(derivativeAt(SQUARE, 3)).toBe(6);
	});

	it('NaN な x → RangeError', () => {
		expect(() => derivativeAt(SQUARE, NaN)).toThrow(RangeError);
	});
});

describe('secantLine / tangentLine / evaluateLine', () => {
	it('f(x)=x^2 の x0=1, x1=3 を通る割線: 傾き=(9-1)/(3-1)=4, 切片=1-4*1=-3', () => {
		const line = secantLine(SQUARE, 1, 3);
		expect(line.slope).toBeCloseTo(4, 12);
		expect(line.intercept).toBeCloseTo(-3, 12);
	});

	it('f(x)=x^2 の x=2 における接線: 傾き=4, 切片=4-4*2=-4', () => {
		const line = tangentLine(SQUARE, 2);
		expect(line.slope).toBe(4);
		expect(line.intercept).toBe(-4);
	});

	it('x0 === x1 → RangeError (割線の傾きが未定義)', () => {
		expect(() => secantLine(SQUARE, 2, 2)).toThrow(RangeError);
	});

	it('x1 - x0 が実質ゼロ (approximatelyZero の境界 EPSILON/2) → RangeError', () => {
		expect(() => secantLine(SQUARE, 2, 2 + EPSILON / 2)).toThrow(RangeError);
	});

	it('NaN な x → RangeError (tangentLine)', () => {
		expect(() => tangentLine(SQUARE, NaN)).toThrow(RangeError);
	});

	it('property: 割線は自身を定義した 2 点をともに通る', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(SQUARE, CUBE, SIN),
				fc.double({ min: -10, max: 10, noNaN: true }),
				fc.double({ min: -10, max: 10, noNaN: true }).filter((h) => Math.abs(h) > 1e-3),
				(fn, x0, delta) => {
					const x1 = x0 + delta;
					const line = secantLine(fn, x0, x1);
					const y0 = fn.evaluate(x0);
					const y1 = fn.evaluate(x1);
					return (
						approximatelyZero(evaluateLine(line, x0) - y0, Math.max(1, Math.abs(y0))) &&
						approximatelyZero(evaluateLine(line, x1) - y1, Math.max(1, Math.abs(y1)))
					);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 接線は接点を通る', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(SQUARE, CUBE, SIN),
				fc.double({ min: -10, max: 10, noNaN: true }),
				(fn, x) => {
					const line = tangentLine(fn, x);
					const y = fn.evaluate(x);
					return approximatelyZero(evaluateLine(line, x) - y, Math.max(1, Math.abs(y)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	// 差分商の誤差上界: 平均値定理形の剰余(f が C^2 のとき)
	//   (f(x+h) - f(x))/h - f'(x) = (h/2) f''(ξ)  (ξ は x と x+h の間のどこか)
	// が成り立つため、|Q(x,h) - f'(x)| <= (|h|/2) * max|f''| という上界が導ける。
	// これは「h を縮めれば誤差が必ず減る」という経験的な単調性の仮定を一切使わない、
	// 独立に証明可能な数学的事実(SQUARE/CUBE は多項式なので剰余項は打ち切りなしの厳密恒等式、
	// SIN はテイラーの剰余定理そのもの)。x∈[-5,5], |h|<=1 の探索域では x+h∈[-6,6] に収まるため、
	// 各関数の secondDerivativeBound は max|f''| をこの範囲で評価した値。
	const SECOND_DERIVATIVE_BOUNDS: { fn: DifferentiableFunction; bound: number }[] = [
		{ fn: SQUARE, bound: 2 }, // f''(x) = 2 (定数)
		{ fn: CUBE, bound: 36 }, // f''(x) = 6x, |x| <= 6 → max|f''| = 36
		{ fn: SIN, bound: 1 }, // f''(x) = -sin(x), |f''| <= 1
	];

	it('property: 差分商と微分係数の誤差は |h|/2 * (2階微分の上界) で抑えられる (平均値定理の剰余、核心の不変条件)', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...SECOND_DERIVATIVE_BOUNDS),
				fc.double({ min: -5, max: 5, noNaN: true }),
				fc.double({ min: 0.05, max: 1, noNaN: true }),
				fc.boolean(),
				({ fn, bound }, x, hMag, negate) => {
					const h = negate ? -hMag : hMag;
					const trueSlope = derivativeAt(fn, x);
					const err = Math.abs(differenceQuotient(fn, x, h) - trueSlope);
					const errorBound = (Math.abs(h) / 2) * bound;
					// 浮動小数点の丸めの余地として小さな許容値を足す
					return err <= errorBound + 1e-9;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
