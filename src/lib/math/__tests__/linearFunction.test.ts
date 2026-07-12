import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluate, yIntercept, slopeBetween, xRoot, type Point2 } from '../linearFunction.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(独立レビュー GrokBuild T1)。
import { EPSILON, approximatelyZero } from '../compare.js';

describe('evaluate', () => {
	it('y=2x+1, x=0: 1 (既知の整数値で検証)', () => {
		expect(evaluate(2, 1, 0)).toBe(1);
	});

	it('y=2x+1, x=1: 3', () => {
		expect(evaluate(2, 1, 1)).toBe(3);
	});

	it('y=-3x+5, x=2: -1', () => {
		expect(evaluate(-3, 5, 2)).toBe(-1);
	});

	it('a=0 (水平線): evaluate(0, 7, x) は x に依らず常に 7', () => {
		expect(evaluate(0, 7, 100)).toBe(7);
		expect(evaluate(0, 7, -100)).toBe(7);
	});

	it('NaN な a → RangeError (サイレントに NaN を伝播させない, MATH_CONVENTIONS §3)', () => {
		expect(() => evaluate(NaN, 1, 0)).toThrow(RangeError);
	});

	it('Infinity な x → RangeError', () => {
		expect(() => evaluate(2, 1, Infinity)).toThrow(RangeError);
	});

	it('NaN な b → RangeError (3引数それぞれを独立に検査している, GrokBuild T3)', () => {
		expect(() => evaluate(2, NaN, 0)).toThrow(RangeError);
	});

	it('Infinity な a → RangeError', () => {
		expect(() => evaluate(Infinity, 1, 0)).toThrow(RangeError);
	});

	it('property: すべての直線は (0, b) を通る (自己確認でない: evaluate は a*x+b を計算するだけで、この事実を直接コード化していない)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				(a, b) => evaluate(a, b, 0) === b,
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 水平線 (a=0) は x に依らず常に b を返す(退化ケースでも破綻せず有限値)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e6, max: 1e6, noNaN: true }),
				(b, x) => {
					const y = evaluate(0, b, x);
					return Number.isFinite(y) && y === b;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 傾き不変性 — 相異なる x1, x2 で (f(x2)-f(x1))/(x2-x1) ≈ a (evaluate の 2 回の独立な呼び出しから、コード化していない解析的事実 f\'=a を検証する)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: 0.01, max: 1e3, noNaN: true }),
				(a, b, x1, gap) => {
					const x2 = x1 + gap;
					const y1 = evaluate(a, b, x1);
					const y2 = evaluate(a, b, x2);
					const observedSlope = (y2 - y1) / (x2 - x1);
					return approximatelyZero(observedSlope - a, Math.max(1, Math.abs(a)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 垂直方向の平行移動 — b を k だけ増やすと y も k だけ増える', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				(a, b, x, k) => {
					const before = evaluate(a, b, x);
					const after = evaluate(a, b + k, x);
					return approximatelyZero(after - before - k, Math.max(1, Math.abs(k)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 水平方向の平行移動 — x を t だけ進め、切片を a*t だけ下げても y は変わらない', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				(a, b, x, t) => {
					const before = evaluate(a, b, x);
					const after = evaluate(a, b - a * t, x + t);
					const scale = Math.max(1, Math.abs(before), Math.abs(after));
					return approximatelyZero(after - before, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: スケール性質 — a, b をともに k 倍すると y も k 倍になる', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -10, max: 10, noNaN: true }),
				(a, b, x, k) => {
					const original = evaluate(a, b, x);
					const scaled = evaluate(k * a, k * b, x);
					return approximatelyZero(scaled - k * original, Math.max(1, Math.abs(k * original)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('yIntercept', () => {
	it('yIntercept(2, 1) = 1', () => {
		expect(yIntercept(2, 1)).toBe(1);
	});

	it('yIntercept(0, -5) = -5 (a=0 の退化ケースでも破綻しない)', () => {
		expect(yIntercept(0, -5)).toBe(-5);
	});

	it('NaN な b → RangeError', () => {
		expect(() => yIntercept(1, NaN)).toThrow(RangeError);
	});

	it('property: yIntercept(a, b) は evaluate(a, b, 0) に一致する(2つの独立した定義の整合性)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				(a, b) => yIntercept(a, b) === evaluate(a, b, 0),
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('slopeBetween', () => {
	it('slopeBetween([0,1],[2,5]) = 2 (既知の整数値)', () => {
		expect(slopeBetween([0, 1], [2, 5])).toBe(2);
	});

	it('slopeBetween([1,3],[4,3]) = 0 (水平)', () => {
		expect(slopeBetween([1, 3], [4, 3])).toBe(0);
	});

	it('x1 === x2 (垂直) → RangeError (傾きが未定義, MATH_CONVENTIONS §3)', () => {
		expect(() => slopeBetween([2, 0], [2, 5])).toThrow(RangeError);
	});

	it('x1 - x2 が実質ゼロ (approximatelyZero の境界 EPSILON/2) → RangeError', () => {
		expect(() => slopeBetween([2, 0], [2 + EPSILON / 2, 5])).toThrow(RangeError);
	});

	it('境界のすぐ外側 (2*EPSILON 離れている) なら RangeError にならない', () => {
		expect(() => slopeBetween([2, 0], [2 + 2 * EPSILON, 5])).not.toThrow();
	});

	it('NaN な座標 → RangeError', () => {
		expect(() => slopeBetween([NaN, 0], [1, 1])).toThrow(RangeError);
	});

	it('Infinity な座標 → RangeError', () => {
		expect(() => slopeBetween([0, 0], [Infinity, 1])).toThrow(RangeError);
	});

	it('property: 2点を通る直線 y=evaluate(a,b,x) 上のどの2点で slopeBetween を計算しても a に一致する', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: 0.1, max: 1e2, noNaN: true }),
				(a, b, x1, gap) => {
					const x2 = x1 + gap;
					const p1: Point2 = [x1, evaluate(a, b, x1)];
					const p2: Point2 = [x2, evaluate(a, b, x2)];
					return approximatelyZero(slopeBetween(p1, p2) - a, Math.max(1, Math.abs(a)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 2点の順序を入れ替えても傾きは変わらない (dy・dx がともに符号反転し相殺する)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				(x1, y1, x2, y2) => {
					fc.pre(!approximatelyZero(x2 - x1, 1));
					const p1: Point2 = [x1, y1];
					const p2: Point2 = [x2, y2];
					return slopeBetween(p1, p2) === slopeBetween(p2, p1);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('xRoot', () => {
	it('xRoot(2, -4) = 2 (2x-4=0 の解、既知の整数値)', () => {
		expect(xRoot(2, -4)).toBe(2);
	});

	it('xRoot(-1, 5) = 5 (-x+5=0 の解)', () => {
		expect(xRoot(-1, 5)).toBe(5);
	});

	it('a=0, b=0 → RangeError (すべての x が根であり、一意な数値を返せない)', () => {
		expect(() => xRoot(0, 0)).toThrow(RangeError);
	});

	it('a=0, b≠0 → RangeError (水平線が x 軸と交わらず根が存在しない)', () => {
		expect(() => xRoot(0, 3)).toThrow(RangeError);
	});

	it('a が実質ゼロ (approximatelyZero の境界 EPSILON/2) → RangeError', () => {
		expect(() => xRoot(EPSILON / 2, 1)).toThrow(RangeError);
	});

	it('NaN な b → RangeError', () => {
		expect(() => xRoot(1, NaN)).toThrow(RangeError);
	});

	it('Infinity な a → RangeError', () => {
		expect(() => xRoot(Infinity, 1)).toThrow(RangeError);
	});

	it('property: a≠0 のとき evaluate(a, b, xRoot(a,b)) ≈ 0 (xRoot と evaluate という独立した2つの計算経路の整合性)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e3, max: 1e3, noNaN: true }).filter((a) => Math.abs(a) > 0.01),
				fc.double({ min: -1e4, max: 1e4, noNaN: true }),
				(a, b) => {
					const root = xRoot(a, b);
					const y = evaluate(a, b, root);
					return approximatelyZero(y, Math.max(1, Math.abs(b)));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
