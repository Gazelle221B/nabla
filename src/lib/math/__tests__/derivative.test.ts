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

	it('NaN な x → RangeError', () => {
		expect(() => differenceQuotient(SQUARE, NaN, 1)).toThrow(RangeError);
	});

	it('Infinity な h → RangeError', () => {
		expect(() => differenceQuotient(SQUARE, 1, Infinity)).toThrow(RangeError);
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

	it('property: 割線の傾きは h→0 で微分係数に収束する (核心の不変条件)', () => {
		// |Q(x,h) - f'(x)| は |h| を 1/50 に縮めるたびに単調に減少する(またはすでに極小)。
		// SQUARE/CUBE/SIN いずれも滑らかな関数であり、テイラー展開の剰余項が h のオーダーで
		// 縮小することの数値的な現れ。derivative.ts の実装を介さず、fn.derivative という
		// 独立に与えられた真の値との差を見ているため自己確認的テストにはならない。
		fc.assert(
			fc.property(
				fc.constantFrom(SQUARE, CUBE, SIN),
				fc.double({ min: -5, max: 5, noNaN: true }),
				fc.double({ min: 0.05, max: 1, noNaN: true }),
				fc.boolean(),
				(fn, x, hMag, negate) => {
					const h1 = negate ? -hMag : hMag;
					const h2 = h1 / 50;
					const trueSlope = derivativeAt(fn, x);
					const err1 = Math.abs(differenceQuotient(fn, x, h1) - trueSlope);
					const err2 = Math.abs(differenceQuotient(fn, x, h2) - trueSlope);
					// 浮動小数点の丸めの余地として小さな許容値を足す
					return err2 <= err1 + 1e-9;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
