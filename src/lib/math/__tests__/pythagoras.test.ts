import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { squaredDistance, pythagoreanResidual, type Point2 } from '../pythagoras.js';

const EPSILON = 1e-9;

function approximatelyZero(value: number, scale: number): boolean {
	return Math.abs(value) <= EPSILON * Math.max(1, scale);
}

function rotatePoint(p: Point2, angle: number): Point2 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return [cos * p[0] - sin * p[1], sin * p[0] + cos * p[1]];
}

describe('squaredDistance', () => {
	it('同一点は 0', () => {
		expect(squaredDistance([0, 0], [0, 0])).toBe(0);
	});

	it('3-4-5: squaredDistance([0,0],[3,4]) = 25', () => {
		// 自己確認禁止(DESIGN.md): Math.hypot を使い回す形ではなく既知の整数値 25 で検証
		expect(squaredDistance([0, 0], [3, 4])).toBe(25);
	});

	it('平行移動後: squaredDistance([1,1],[4,5]) = 25', () => {
		expect(squaredDistance([1, 1], [4, 5])).toBe(25);
	});

	it('5-12-13: squaredDistance([0,0],[5,12]) = 169', () => {
		expect(squaredDistance([0, 0], [5, 12])).toBe(169);
	});

	it('NaN 入力 → RangeError (サイレントに NaN を伝播させない, MATH_CONVENTIONS §3)', () => {
		expect(() => squaredDistance([NaN, 0], [0, 0])).toThrow(RangeError);
	});

	it('Infinity 入力 → RangeError (非有限入力は事前条件違反, MATH_CONVENTIONS §3)', () => {
		expect(() => squaredDistance([Infinity, 0], [0, 0])).toThrow(RangeError);
	});

	it('property: squaredDistance(a,b) === squaredDistance(b,a)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -1e6, max: 1e6, noNaN: true }),
				fc.double({ min: -1e6, max: 1e6, noNaN: true }),
				fc.double({ min: -1e6, max: 1e6, noNaN: true }),
				fc.double({ min: -1e6, max: 1e6, noNaN: true }),
				(ax, ay, bx, by) => {
					const a: Point2 = [ax, ay];
					const b: Point2 = [bx, by];
					return squaredDistance(a, b) === squaredDistance(b, a);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('pythagoreanResidual', () => {
	it('3-4-5 直角三角形: 残差 = 0', () => {
		expect(pythagoreanResidual([0, 0], [3, 0], [0, 4])).toBe(0);
	});

	it('5-12-13 直角三角形: 残差 = 0', () => {
		expect(pythagoreanResidual([0, 0], [5, 0], [0, 12])).toBe(0);
	});

	it('共線三角形は残差 ≠ 0: |OA|²=9, |OB|²=16, |AB|²=1 → 残差=24', () => {
		// O=(0,0), A=(3,0), B=(4,0): 9+16-1=24 を既知の計算結果で検証
		expect(pythagoreanResidual([0, 0], [3, 0], [4, 0])).toBe(24);
	});

	it('ゼロ長辺(退化): 例外なし、有限値を返す', () => {
		// O=A=(0,0): |OA|²=0, |OB|²=16, |AB|²=16 → 残差=0
		const residual = pythagoreanResidual([0, 0], [0, 0], [0, 4]);
		expect(Number.isFinite(residual)).toBe(true);
		expect(residual).toBe(0);
	});

	it('極小辺 (1e-300): 例外なし、有限値を返す', () => {
		expect(Number.isFinite(pythagoreanResidual([0, 0], [1e-300, 0], [0, 4]))).toBe(true);
	});

	it('極大辺 (1e150, double 範囲内): 例外なし、有限値を返す', () => {
		// (1e150)²=1e300 < 1.8e308 なので double 範囲内
		expect(Number.isFinite(pythagoreanResidual([0, 0], [1e150, 0], [0, 1e150]))).toBe(true);
	});

	it('NaN 入力 → RangeError (サイレントに NaN を伝播させない, MATH_CONVENTIONS §3)', () => {
		expect(() => pythagoreanResidual([0, 0], [NaN, 0], [0, 4])).toThrow(RangeError);
	});

	it('Infinity 入力 → RangeError (非有限入力は事前条件違反, MATH_CONVENTIONS §3)', () => {
		expect(() => pythagoreanResidual([0, 0], [Infinity, 0], [0, 4])).toThrow(RangeError);
	});

	describe('invariants (fast-check, seed 42, numRuns 200)', () => {
		it('直角三角形 O=(tx,ty), A=(tx+a,ty), B=(tx,ty+b) の残差はスケール相対誤差内でゼロ', () => {
			fc.assert(
				fc.property(
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					(tx, ty, a, b) => {
						const O: Point2 = [tx, ty];
						const A: Point2 = [tx + a, ty];
						const B: Point2 = [tx, ty + b];
						const residual = pythagoreanResidual(O, A, B);
						const legA2 = squaredDistance(O, A);
						const legB2 = squaredDistance(O, B);
						const hyp2 = squaredDistance(A, B);
						return approximatelyZero(residual, legA2 + legB2 + hyp2);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('脚の交換: pythagoreanResidual(O,A,B) === pythagoreanResidual(O,B,A)', () => {
			// |OA|²+|OB|²-|AB|² = |OB|²+|OA|²-|BA|² (加算の可換性・|AB|²=|BA|²)
			fc.assert(
				fc.property(
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					fc.double({ min: -1e4, max: 1e4, noNaN: true }),
					(ox, oy, ax, ay, bx, by) => {
						const O: Point2 = [ox, oy];
						const A: Point2 = [ax, ay];
						const B: Point2 = [bx, by];
						return pythagoreanResidual(O, A, B) === pythagoreanResidual(O, B, A);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('平行移動不変: 三頂点を同じベクトルだけ平行移動しても残差は変わらない', () => {
			// 大きな平行移動では加算→減算の丸め誤差で完全一致しないため、
			// 残差の差分をスケール相対誤差で比較する(MATH_CONVENTIONS §2)
			fc.assert(
				fc.property(
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					fc.double({ min: -1e6, max: 1e6, noNaN: true }),
					fc.double({ min: -1e6, max: 1e6, noNaN: true }),
					(tx, ty, a, b, dx, dy) => {
						const O: Point2 = [tx, ty];
						const A: Point2 = [tx + a, ty];
						const B: Point2 = [tx, ty + b];
						const OT: Point2 = [tx + dx, ty + dy];
						const AT: Point2 = [tx + a + dx, ty + dy];
						const BT: Point2 = [tx + dx, ty + b + dy];
						const residual = pythagoreanResidual(O, A, B);
						const translated = pythagoreanResidual(OT, AT, BT);
						const scale =
							squaredDistance(OT, AT) + squaredDistance(OT, BT) + squaredDistance(AT, BT);
						return approximatelyZero(residual - translated, scale);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('回転不変: 任意角度だけ回転した直角三角形も残差はスケール相対誤差内でゼロ', () => {
			fc.assert(
				fc.property(
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: 0.1, max: 1e3, noNaN: true }),
					fc.double({ min: 0.1, max: 1e3, noNaN: true }),
					fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
					(tx, ty, a, b, angle) => {
						const O: Point2 = [tx, ty];
						const A: Point2 = [tx + a, ty];
						const B: Point2 = [tx, ty + b];
						const Or = rotatePoint(O, angle);
						const Ar = rotatePoint(A, angle);
						const Br = rotatePoint(B, angle);
						const residual = pythagoreanResidual(Or, Ar, Br);
						const legA2 = squaredDistance(Or, Ar);
						const legB2 = squaredDistance(Or, Br);
						const hyp2 = squaredDistance(Ar, Br);
						return approximatelyZero(residual, legA2 + legB2 + hyp2);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});

		it('スケーリング: k 倍後も残差はゼロ、各脚の 2 乗距離は k^2 倍', () => {
			fc.assert(
				fc.property(
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: -1e3, max: 1e3, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					fc.double({ min: 0.01, max: 1e3, noNaN: true }),
					fc.double({ min: 0.001, max: 100, noNaN: true }),
					(tx, ty, a, b, k) => {
						const O: Point2 = [tx, ty];
						const A: Point2 = [tx + a, ty];
						const B: Point2 = [tx, ty + b];
						const Os: Point2 = [k * tx, k * ty];
						const As: Point2 = [k * (tx + a), k * ty];
						const Bs: Point2 = [k * tx, k * (ty + b)];

						const legA2 = squaredDistance(O, A);
						const legA2s = squaredDistance(Os, As);
						const legB2 = squaredDistance(O, B);
						const legB2s = squaredDistance(Os, Bs);
						const scaledResidual = pythagoreanResidual(Os, As, Bs);
						const hyp2s = squaredDistance(As, Bs);
						const k2 = k * k;

						return (
							approximatelyZero(scaledResidual, legA2s + legB2s + hyp2s) &&
							approximatelyZero(legA2s - k2 * legA2, Math.max(legA2s, k2 * legA2)) &&
							approximatelyZero(legB2s - k2 * legB2, Math.max(legB2s, k2 * legB2))
						);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		});
	});
});
