import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluate, vertex, axisOfSymmetry, completeSquare } from '../quadraticFunction.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(linearFunction.test.ts と同じ方針、
// 独立レビュー GrokBuild T1 の学び)。
import { EPSILON, approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー。
// (前回レビューの学び: 非有限テストは一部の引数だけでなく全引数を NaN/Infinity それぞれで網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('evaluate', () => {
	it('y=(x-2)^2-3, x=2: -3 (頂点そのもの、既知の整数値)', () => {
		expect(evaluate(1, 2, -3, 2)).toBe(-3);
	});

	it('y=(x-2)^2-3, x=0: 1', () => {
		expect(evaluate(1, 2, -3, 0)).toBe(1);
	});

	it('y=-2(x-1)^2+4, x=3: -2*4+4=-4 (下に凸ではない a<0 の既知値)', () => {
		expect(evaluate(-2, 1, 4, 3)).toBe(-4);
	});

	it('a=0 (退化ケース、水平線): evaluate(0, 5, 7, x) は x に依らず常に 7', () => {
		expect(evaluate(0, 5, 7, 100)).toBe(7);
		expect(evaluate(0, 5, 7, -100)).toBe(7);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError (サイレントに伝播させない, MATH_CONVENTIONS §3)`, () => {
			expect(() => evaluate(value, 2, -3, 0)).toThrow(RangeError);
		});
		it(`${label} な p → RangeError`, () => {
			expect(() => evaluate(1, value, -3, 0)).toThrow(RangeError);
		});
		it(`${label} な q → RangeError`, () => {
			expect(() => evaluate(1, 2, value, 0)).toThrow(RangeError);
		});
		it(`${label} な x → RangeError`, () => {
			expect(() => evaluate(1, 2, -3, value)).toThrow(RangeError);
		});
	}

	it('property: 頂点の x 座標 (x=p) では常に評価値が q に一致する (自己確認でない: evaluate は a*(x-p)^2+q を計算するだけで、この事実を直接コード化していない)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				(a, p, q) => evaluate(a, p, q, p) === q,
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 軸対称性 — f(p+t) と f(p-t) は一致する(t は p とは独立なパラメータ)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				(a, p, q, t) => {
					const left = evaluate(a, p, q, p + t);
					const right = evaluate(a, p, q, p - t);
					const scale = Math.max(1, Math.abs(left), Math.abs(right));
					return approximatelyZero(left - right, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: a>0 のとき、頂点 q は任意の x に対する下界になる (f(x) >= q)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.01, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				(a, p, q, x) => {
					const y = evaluate(a, p, q, x);
					// スケール相対誤差の分だけ緩めて、浮動小数点の丸めで q をわずかに下回る
					// 境界ケース(x=p 近傍)を偽陽性で弾かないようにする。
					return y >= q - EPSILON * Math.max(1, Math.abs(q));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: a<0 のとき、頂点 q は任意の x に対する上界になる (f(x) <= q)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: -0.01, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e3, max: 1e3, noNaN: true }),
				(a, p, q, x) => {
					const y = evaluate(a, p, q, x);
					return y <= q + EPSILON * Math.max(1, Math.abs(q));
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: a をそのままに p, q をともに k, m だけ平行移動すると、x も k だけ進めれば同じ y になる', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }).filter((a) => Math.abs(a) > 0.01),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				(a, p, q, x, k, m) => {
					const before = evaluate(a, p, q, x);
					const after = evaluate(a, p + k, q + m, x + k);
					const scale = Math.max(1, Math.abs(before), Math.abs(after));
					return approximatelyZero(after - before - m, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('vertex / axisOfSymmetry', () => {
	it('vertex(1, 2, -3) = [2, -3] (既知の整数値)', () => {
		expect(vertex(1, 2, -3)).toEqual([2, -3]);
	});

	it('axisOfSymmetry(1, 2, -3) = 2', () => {
		expect(axisOfSymmetry(1, 2, -3)).toBe(2);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError (vertex)`, () => {
			expect(() => vertex(value, 1, 1)).toThrow(RangeError);
		});
		it(`${label} な p → RangeError (vertex)`, () => {
			expect(() => vertex(1, value, 1)).toThrow(RangeError);
		});
		it(`${label} な q → RangeError (vertex)`, () => {
			expect(() => vertex(1, 1, value)).toThrow(RangeError);
		});
		it(`${label} な a → RangeError (axisOfSymmetry)`, () => {
			expect(() => axisOfSymmetry(value, 1, 1)).toThrow(RangeError);
		});
		it(`${label} な p → RangeError (axisOfSymmetry)`, () => {
			expect(() => axisOfSymmetry(1, value, 1)).toThrow(RangeError);
		});
		it(`${label} な q → RangeError (axisOfSymmetry)`, () => {
			expect(() => axisOfSymmetry(1, 1, value)).toThrow(RangeError);
		});
	}

	it('property: 頂点の y は頂点 x での関数値に一致し、対称軸の両側で関数値が等しい(evaluate 経由の計算で検証。入力エコーでない: vy を q+1 等に、軸を誤った値にすると破綻する — GrokBuild C1/C-7)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: 0.1, max: 1e2, noNaN: true }),
				(a, p, q, t) => {
					const [vx, vy] = vertex(a, p, q);
					const axis = axisOfSymmetry(a, p, q);
					// 頂点の y は、頂点の x における関数値そのもの(vertex が y を誤って返せば破綻)。
					const yAtVertex = evaluate(a, p, q, vx);
					// 対称軸の両側で関数値が等しい(axisOfSymmetry が誤った軸を返せば破綻)。
					const left = evaluate(a, p, q, axis - t);
					const right = evaluate(a, p, q, axis + t);
					const scale = Math.max(1, Math.abs(vy), Math.abs(left));
					return (
						approximatelyZero(vy - yAtVertex, scale) && approximatelyZero(left - right, scale)
					);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('completeSquare', () => {
	it('y=x^2-4x+3 → {a:1, p:2, q:-1} (既知の整数値、頂点形式 (x-2)^2-1 に展開すると一致)', () => {
		const result = completeSquare(1, -4, 3);
		expect(result.a).toBe(1);
		expect(result.p).toBe(2);
		expect(result.q).toBe(-1);
	});

	it('y=2x^2+4x+5 → {a:2, p:-1, q:3}', () => {
		const result = completeSquare(2, 4, 5);
		expect(result.a).toBe(2);
		expect(result.p).toBe(-1);
		expect(result.q).toBe(3);
	});

	it('a=0 → RangeError (二次関数でない、MATH_CONVENTIONS §3 のゼロ除算方針)', () => {
		expect(() => completeSquare(0, 3, 1)).toThrow(RangeError);
	});

	it('a が実質ゼロ (approximatelyZero の境界 EPSILON/2) → RangeError', () => {
		expect(() => completeSquare(EPSILON / 2, 1, 1)).toThrow(RangeError);
	});

	it('境界のすぐ外側 (2*EPSILON) なら RangeError にならない', () => {
		expect(() => completeSquare(2 * EPSILON, 1, 1)).not.toThrow();
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な a → RangeError (completeSquare)`, () => {
			expect(() => completeSquare(value, 1, 1)).toThrow(RangeError);
		});
		it(`${label} な b → RangeError (completeSquare)`, () => {
			expect(() => completeSquare(1, value, 1)).toThrow(RangeError);
		});
		it(`${label} な c → RangeError (completeSquare)`, () => {
			expect(() => completeSquare(1, 1, value)).toThrow(RangeError);
		});
	}

	it('property: completeSquare で得た頂点形式を evaluate した値は、独立に計算した標準形 a*x^2+b*x+c に一致する(2つの独立した計算経路の整合性、自己確認的でない核心の不変条件)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }).filter((a) => Math.abs(a) > 0.05),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				(a, b, c, x) => {
					const { a: va, p, q } = completeSquare(a, b, c);
					const fromVertexForm = evaluate(va, p, q, x);
					// 標準形は completeSquare/evaluate を一切経由しない独立した計算式
					const fromStandardForm = a * x * x + b * x + c;
					const scale = Math.max(1, Math.abs(fromVertexForm), Math.abs(fromStandardForm));
					return approximatelyZero(fromVertexForm - fromStandardForm, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: completeSquare で得た頂点 (p, q) における評価値は q そのものに一致する(頂点が標準形の極値であることの間接検証)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e2, max: 1e2, noNaN: true }).filter((a) => Math.abs(a) > 0.05),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				fc.double({ min: -1e2, max: 1e2, noNaN: true }),
				(a, b, c) => {
					const { a: va, p, q } = completeSquare(a, b, c);
					return evaluate(va, p, q, p) === q;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
