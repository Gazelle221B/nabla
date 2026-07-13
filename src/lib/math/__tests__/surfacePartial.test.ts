import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	evaluateSurface,
	partialX,
	partialY,
	numericalPartialX,
	numericalPartialY,
	directionalDerivative,
	gradientMagnitude,
	gradientDirectionDeg,
	SURFACE_PRESETS,
	type SurfaceFnId,
} from '../surfacePartial.js';
import { EPSILON, approximatelyZero } from '../compare.js';

const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const FN_IDS: readonly SurfaceFnId[] = SURFACE_PRESETS.map((p) => p.id);

describe('evaluateSurface / partialX / partialY (既知例、手計算で確定)', () => {
	it('paraboloid f=x²+y²: (1,1) で f=2, ∂x=2, ∂y=2', () => {
		expect(evaluateSurface('paraboloid', 1, 1)).toBe(2);
		expect(partialX('paraboloid', 1, 1)).toBe(2);
		expect(partialY('paraboloid', 1, 1)).toBe(2);
	});

	it('saddle f=x²−y²: (1,1) で f=0, ∂x=2, ∂y=−2', () => {
		expect(evaluateSurface('saddle', 1, 1)).toBe(0);
		expect(partialX('saddle', 1, 1)).toBe(2);
		expect(partialY('saddle', 1, 1)).toBe(-2);
	});

	it('saddle: (1,0) では x方向に+2(登り)・y方向に0、(0,1)では y方向に−2(下り)——同じ曲面の' +
		'同じような点でも向きで正負すら変わる(よくある誤解の反証)', () => {
		expect(partialX('saddle', 1, 0)).toBe(2);
		// -2*0 は IEEE754 で -0 になる(数学的には0と同じ、rotationZMatrix golden と同じ既知の挙動)。
		// toBeCloseTo は符号なしの近さで比較するため -0/+0 の差を問題にしない。
		expect(partialY('saddle', 1, 0)).toBeCloseTo(0, 10);
		expect(partialX('saddle', 0, 1)).toBe(0);
		expect(partialY('saddle', 0, 1)).toBe(-2);
	});

	it('ridge f=x²(yに依存しない): ∂y は (x,y) によらず恒等的に0、f は y を変えても不変', () => {
		expect(partialY('ridge', 1, 5)).toBe(0);
		expect(partialY('ridge', -3, -100)).toBe(0);
		expect(evaluateSurface('ridge', 2, 0)).toBe(evaluateSurface('ridge', 2, 999));
		expect(partialX('ridge', 2, 0)).toBe(4);
	});

	it('plane f=x+2y: ∂x=1, ∂y=2 は (x,y) によらず定数', () => {
		expect(partialX('plane', 3, -7)).toBe(1);
		expect(partialY('plane', 3, -7)).toBe(2);
		expect(evaluateSurface('plane', 1, 2)).toBe(5);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な x → RangeError`, () => {
			expect(() => evaluateSurface('paraboloid', value, 0)).toThrow(RangeError);
			expect(() => partialX('paraboloid', value, 0)).toThrow(RangeError);
			expect(() => partialY('paraboloid', value, 0)).toThrow(RangeError);
		});
	}

	it('未知の fnId → RangeError', () => {
		expect(() => evaluateSurface('unknown' as SurfaceFnId, 0, 0)).toThrow(RangeError);
	});
});

describe('numericalPartialX / numericalPartialY (中心差分、解析解とは独立な経路)', () => {
	it('golden: paraboloid (1,1), h=0.1 で解析解(2,2)と一致する', () => {
		expect(numericalPartialX('paraboloid', 1, 1, 0.1)).toBeCloseTo(2, 10);
		expect(numericalPartialY('paraboloid', 1, 1, 0.1)).toBeCloseTo(2, 10);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な h → RangeError`, () => {
			expect(() => numericalPartialX('paraboloid', 0, 0, value)).toThrow(RangeError);
			expect(() => numericalPartialY('paraboloid', 0, 0, value)).toThrow(RangeError);
		});
	}

	it('h=0 → RangeError(0除算は未定義)', () => {
		expect(() => numericalPartialX('paraboloid', 0, 0, 0)).toThrow(RangeError);
		expect(() => numericalPartialY('paraboloid', 0, 0, 0)).toThrow(RangeError);
	});
});

describe('directionalDerivative / gradientMagnitude / gradientDirectionDeg', () => {
	it('golden: paraboloid (1,1) で方向微分の最大は 2√2(≈2.83)、勾配方向は45°', () => {
		expect(gradientMagnitude('paraboloid', 1, 1)).toBeCloseTo(2 * Math.SQRT2, 10);
		expect(directionalDerivative('paraboloid', 1, 1, 45)).toBeCloseTo(2 * Math.SQRT2, 10);
		expect(gradientDirectionDeg('paraboloid', 1, 1)).toBeCloseTo(45, 10);
	});

	it('golden: plane はどの点でも勾配 (1,2)、最大は √5(≈2.236)、勾配方向は約63.43°', () => {
		expect(gradientMagnitude('plane', 5, -3)).toBeCloseTo(Math.sqrt(5), 10);
		expect(gradientDirectionDeg('plane', 5, -3)).toBeCloseTo((Math.atan2(2, 1) * 180) / Math.PI, 10);
	});

	it('θ=0 で partialX と一致し、θ=90 で partialY とほぼ一致する(paraboloid (1,1))', () => {
		expect(directionalDerivative('paraboloid', 1, 1, 0)).toBeCloseTo(partialX('paraboloid', 1, 1), 10);
		expect(directionalDerivative('paraboloid', 1, 1, 90)).toBeCloseTo(partialY('paraboloid', 1, 1), 10);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な thetaDeg → RangeError`, () => {
			expect(() => directionalDerivative('paraboloid', 0, 0, value)).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ(seed 42、rule of three: linearTransformation3d.test.ts / 他単元の
// fast-check テストと同じ規約: entry 範囲を有界にする)。
const coordArb = fc.double({ min: -5, max: 5, noNaN: true });
const fnIdArb = fc.constantFrom(...FN_IDS);
// h は極端に小さくしない(浮動小数点の丸め誤差の増幅を避ける——理論誤差は0だが、
// h が極小だと f(x+h)-f(x-h) の桁落ちにより計算誤差が相対的に大きくなるため)。
const hArb = fc.double({ min: 0.01, max: 2, noNaN: true });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 中心差分(numericalPartialX/Y)は解析解(partialX/Y)と一致する——C=0(全プリセットは' +
			'各断面が高々2次の多項式のため3階導関数が恒等的に0。理論誤差 C·h² の C が厳密に0になる' +
			'特殊ケース、h の大小によらず成立する)',
		() => {
			fc.assert(
				fc.property(fnIdArb, coordArb, coordArb, hArb, (fnId, x, y, h) => {
					const analyticX = partialX(fnId, x, y);
					const numericX = numericalPartialX(fnId, x, y, h);
					const scaleX = Math.max(1, Math.abs(analyticX), Math.abs(numericX));
					const analyticY = partialY(fnId, x, y);
					const numericY = numericalPartialY(fnId, x, y, h);
					const scaleY = Math.max(1, Math.abs(analyticY), Math.abs(numericY));
					return (
						approximatelyZero(analyticX - numericX, scaleX) &&
						approximatelyZero(analyticY - numericY, scaleY)
					);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: θ=0 の方向微分は常に partialX に一致する', () => {
		fc.assert(
			fc.property(fnIdArb, coordArb, coordArb, (fnId, x, y) => {
				const d = directionalDerivative(fnId, x, y, 0);
				const gx = partialX(fnId, x, y);
				return approximatelyZero(d - gx, Math.max(1, Math.abs(gx)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: θ=90 の方向微分は常に partialY にほぼ一致する(cos90が厳密な0でないため近似)', () => {
		fc.assert(
			fc.property(fnIdArb, coordArb, coordArb, (fnId, x, y) => {
				const d = directionalDerivative(fnId, x, y, 90);
				const gy = partialY(fnId, x, y);
				return approximatelyZero(d - gy, Math.max(1, Math.abs(gy)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 方向微分はどの向きθでも |∇f| を超えない(コーシー・シュワルツの不等式)', () => {
		fc.assert(
			fc.property(
				fnIdArb,
				coordArb,
				coordArb,
				fc.double({ min: 0, max: 360, noNaN: true }),
				(fnId, x, y, theta) => {
					const d = directionalDerivative(fnId, x, y, theta);
					const mag = gradientMagnitude(fnId, x, y);
					const scale = Math.max(1, mag);
					return d <= mag + EPSILON * scale;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 勾配方向 θ=gradientDirectionDeg では方向微分が最大値 |∇f| に一致する', () => {
		fc.assert(
			fc.property(fnIdArb, coordArb, coordArb, (fnId, x, y) => {
				const mag = gradientMagnitude(fnId, x, y);
				const dir = gradientDirectionDeg(fnId, x, y);
				const d = directionalDerivative(fnId, x, y, dir);
				const scale = Math.max(1, mag);
				return approximatelyZero(d - mag, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: ridge(f=x²)は y をどう変えても f と ∂y が不変(yに依存しないことの一般化)', () => {
		fc.assert(
			fc.property(coordArb, coordArb, coordArb, (x, y1, y2) => {
				const f1 = evaluateSurface('ridge', x, y1);
				const f2 = evaluateSurface('ridge', x, y2);
				return (
					approximatelyZero(f1 - f2, Math.max(1, Math.abs(f1))) &&
					partialY('ridge', x, y1) === 0 &&
					partialY('ridge', x, y2) === 0
				);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
