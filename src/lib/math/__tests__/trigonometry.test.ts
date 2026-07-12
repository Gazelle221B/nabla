import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { unitCirclePoint, sine, cosine, tangent, pythagoreanIdentityResidual } from '../trigonometry.js';
// 許容誤差判定は本番実装(compare.ts)を再利用する。テスト内で再実装すると EPSILON や
// スケール相対誤差の式が乖離しても境界テストが気づけない(quadraticFunction.test.ts と同じ方針、
// 独立レビュー GrokBuild T1 の学び)。
import { EPSILON, approximatelyZero } from '../compare.js';

// 非有限入力 (NaN / Infinity) を各関数の全引数それぞれについて検証するための共通ヘルパー。
// (前回レビューの学び: 非有限テストは一部の引数だけでなく全引数を NaN/Infinity それぞれで網羅する)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('非有限入力 (全関数・全引数で RangeError)', () => {
	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な theta → RangeError (unitCirclePoint)`, () => {
			expect(() => unitCirclePoint(value)).toThrow(RangeError);
		});
		it(`${label} な theta → RangeError (sine)`, () => {
			expect(() => sine(value)).toThrow(RangeError);
		});
		it(`${label} な theta → RangeError (cosine)`, () => {
			expect(() => cosine(value)).toThrow(RangeError);
		});
		it(`${label} な theta → RangeError (tangent)`, () => {
			expect(() => tangent(value)).toThrow(RangeError);
		});
		it(`${label} な theta → RangeError (pythagoreanIdentityResidual)`, () => {
			expect(() => pythagoreanIdentityResidual(value)).toThrow(RangeError);
		});
	}
});

describe('既知値 (e)', () => {
	it('theta=0 → unitCirclePoint = (1, 0)', () => {
		const [x, y] = unitCirclePoint(0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
	});

	it('theta=π/2 → unitCirclePoint = (0, 1)', () => {
		const [x, y] = unitCirclePoint(Math.PI / 2);
		expect(x).toBeCloseTo(0, 10);
		expect(y).toBeCloseTo(1, 10);
	});

	it('theta=π → unitCirclePoint = (-1, 0)', () => {
		const [x, y] = unitCirclePoint(Math.PI);
		expect(x).toBeCloseTo(-1, 10);
		expect(y).toBeCloseTo(0, 10);
	});

	it('theta=3π/2 → unitCirclePoint = (0, -1)', () => {
		const [x, y] = unitCirclePoint((3 * Math.PI) / 2);
		expect(x).toBeCloseTo(0, 10);
		expect(y).toBeCloseTo(-1, 10);
	});

	it('theta=π/6 (30°): cos=√3/2, sin=1/2 (既知の三角比)', () => {
		expect(cosine(Math.PI / 6)).toBeCloseTo(Math.sqrt(3) / 2, 10);
		expect(sine(Math.PI / 6)).toBeCloseTo(0.5, 10);
	});

	it('theta=π/3 (60°): cos=1/2, sin=√3/2 (既知の三角比)', () => {
		expect(cosine(Math.PI / 3)).toBeCloseTo(0.5, 10);
		expect(sine(Math.PI / 3)).toBeCloseTo(Math.sqrt(3) / 2, 10);
	});

	it('theta=π/4 (45°): cos=sin=√2/2、tan=1 (既知の三角比)', () => {
		expect(cosine(Math.PI / 4)).toBeCloseTo(Math.sqrt(2) / 2, 10);
		expect(sine(Math.PI / 4)).toBeCloseTo(Math.sqrt(2) / 2, 10);
		expect(tangent(Math.PI / 4)).toBeCloseTo(1, 10);
	});

	it('theta=0 → tangent = 0 (既知値)', () => {
		expect(tangent(0)).toBeCloseTo(0, 10);
	});

	it('theta=π/6 → tangent = 1/√3 (既知値)', () => {
		expect(tangent(Math.PI / 6)).toBeCloseTo(1 / Math.sqrt(3), 10);
	});
});

describe('property: 単位円上の点の大きさ ≈ 1 (b)', () => {
	it('unitCirclePoint(theta) は原点から常に距離 1 (自己確認的でない: cos/sin をそれぞれ独立に計算し、その組み合わせの大きさを検証する)', () => {
		fc.assert(
			fc.property(fc.double({ min: -1e3, max: 1e3, noNaN: true }), (theta) => {
				const [x, y] = unitCirclePoint(theta);
				const magnitude = Math.hypot(x, y);
				return approximatelyZero(magnitude - 1, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('property: ピタゴラス恒等式 sin²+cos²≈1 (a)', () => {
	it('pythagoreanIdentityResidual(theta) は常に ≈0 (単位円の定義そのものから導かれる不変条件、自己確認的でない: sin/cos の計算結果を突き合わせないと成立しない)', () => {
		fc.assert(
			fc.property(fc.double({ min: -1e3, max: 1e3, noNaN: true }), (theta) => {
				return approximatelyZero(pythagoreanIdentityResidual(theta), 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('property: tangent(theta) ≈ sine(theta)/cosine(theta) (c)', () => {
	it('cos がほぼ0でない範囲で、tangent は独立実装の Math.tan と一致する (自己確認的でない: tangent は内部で sine/cosine と同じ Math.sin/Math.cos の除算を行うため、テストで sin/cos を割り直すのは同語反復になる。別コードパスである Math.tan と突き合わせ、除算そのものの誤り〔分子分母の取り違え等〕を捕捉する — GrokBuild C-7)', () => {
		fc.assert(
			fc.property(
				fc
					.double({ min: -10, max: 10, noNaN: true })
					.filter((theta) => !approximatelyZero(Math.cos(theta), 1)),
				(theta) => {
					const fromTangent = tangent(theta);
					const reference = Math.tan(theta);
					const scale = Math.max(1, Math.abs(fromTangent), Math.abs(reference));
					return approximatelyZero(fromTangent - reference, scale);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('property: 周期性 (d)', () => {
	// 注(Antigravity 指摘): 2 * Math.PI は厳密な 2π ではなく浮動小数点近似なので、大きな theta
	// では丸め誤差がわずかに累積する。この不変条件は approximatelyZero にスケール
	// (Math.max(1, |値|)) を与えて相対誤差で許容している。
	it('sine(theta+2π) ≈ sine(theta)', () => {
		fc.assert(
			fc.property(fc.double({ min: -50, max: 50, noNaN: true }), (theta) => {
				const before = sine(theta);
				const after = sine(theta + 2 * Math.PI);
				return approximatelyZero(after - before, Math.max(1, Math.abs(before), Math.abs(after)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('cosine(theta+2π) ≈ cosine(theta)', () => {
		fc.assert(
			fc.property(fc.double({ min: -50, max: 50, noNaN: true }), (theta) => {
				const before = cosine(theta);
				const after = cosine(theta + 2 * Math.PI);
				return approximatelyZero(after - before, Math.max(1, Math.abs(before), Math.abs(after)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('tangent: cos≈0 での RangeError (f)', () => {
	it('theta=π/2 → RangeError (cos(π/2)≈0)', () => {
		expect(() => tangent(Math.PI / 2)).toThrow(RangeError);
	});

	it('theta=-π/2 → RangeError', () => {
		expect(() => tangent(-Math.PI / 2)).toThrow(RangeError);
	});

	it('theta=3π/2 → RangeError', () => {
		expect(() => tangent((3 * Math.PI) / 2)).toThrow(RangeError);
	});

	it('cos が実質ゼロ (approximatelyZero の境界 EPSILON/2 相当) → RangeError (acos で cos=EPSILON/2 となる theta を逆算)', () => {
		const thetaAtBoundary = Math.acos(EPSILON / 2);
		expect(() => tangent(thetaAtBoundary)).toThrow(RangeError);
	});

	it('境界のすぐ外側 (cos=2*EPSILON) なら RangeError にならず、有限の大きな値を返す (GrokBuild nit: Infinity を返す回帰も捕捉する)', () => {
		const thetaJustOutside = Math.acos(2 * EPSILON);
		expect(() => tangent(thetaJustOutside)).not.toThrow();
		expect(Number.isFinite(tangent(thetaJustOutside))).toBe(true);
	});
});
