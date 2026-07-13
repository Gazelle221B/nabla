import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	cAdd,
	cSub,
	cMul,
	cDiv,
	argDeg,
	modulus,
	evaluateComplex,
	expectedWindingNumber,
	windingNumberAround,
	COMPLEX_FN_SINGULARITIES,
	type Complex,
	type ComplexFnId,
} from '../complexFunctions.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (mandelbrot.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const ONE: Complex = [1, 0];
const I: Complex = [0, 1];
const ZERO: Complex = [0, 0];

describe('cAdd / cSub / cMul (四則演算)', () => {
	it('cAdd: (1+2i)+(3+4i)=(4+6i)', () => {
		expect(cAdd([1, 2], [3, 4])).toEqual([4, 6]);
	});

	it('cSub: (1+2i)-(3+4i)=(-2-2i)', () => {
		expect(cSub([1, 2], [3, 4])).toEqual([-2, -2]);
	});

	it('cMul: 黄金値 i*i=-1(虚数単位の定義そのもの)', () => {
		expect(cMul(I, I)).toEqual([-1, 0]);
	});

	it('cMul: (1+2i)(3+4i)=(3-8)+(4+6)i=(-5+10i)(手計算・再検算済み)', () => {
		expect(cMul([1, 2], [3, 4])).toEqual([-5, 10]);
	});

	it('cMul は可換(fast-check, seed 42)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				(a0, a1, b0, b1) => {
					const a: Complex = [a0, a1];
					const b: Complex = [b0, b1];
					const ab = cMul(a, b);
					const ba = cMul(b, a);
					return ab[0] === ba[0] && ab[1] === ba[1];
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → cAdd/cSub/cMul いずれも RangeError`, () => {
			expect(() => cAdd([value, 0], ZERO)).toThrow(RangeError);
			expect(() => cSub([value, 0], ZERO)).toThrow(RangeError);
			expect(() => cMul([value, 0], ZERO)).toThrow(RangeError);
		});
	}
});

describe('cDiv(分母≈0でnullを返す設計判断)', () => {
	it('黄金値: (1+0i)/(1+0i)=1', () => {
		expect(cDiv(ONE, ONE)).toEqual([1, 0]);
	});

	it('黄金値: (1+0i)/(0+1i) = -i(手計算: 1/i = -i、i*(-i)=1で検算済み)', () => {
		const result = cDiv(ONE, I);
		expect(result).not.toBeNull();
		expect(result![0]).toBeCloseTo(0, 12);
		expect(result![1]).toBeCloseTo(-1, 12);
	});

	it('分母が厳密にゼロ → null(極の表現)', () => {
		expect(cDiv(ONE, ZERO)).toBeNull();
	});

	it('分母が実質的にゼロ(スケール相対誤差の範囲内)→ null', () => {
		expect(cDiv(ONE, [1e-12, 0])).toBeNull();
	});

	it('分母が小さいが「実質ゼロ」の範囲外(有限の大きな値を返す、極ではないという判定)', () => {
		const result = cDiv(ONE, [1e-6, 0]);
		expect(result).not.toBeNull();
		expect(result![0]).toBeCloseTo(1e6, 0);
	});

	it(
		'C-7 交差検証: cDiv(a,b) が null でないとき、その結果に b を掛け戻す(cMul)と a に一致する' +
			'(除算は乗算の逆演算という、cMul(既存・別関数)を使った独立経路での確認、fast-check seed 42)',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: -50, max: 50, noNaN: true }),
					fc.double({ min: -50, max: 50, noNaN: true }),
					fc.double({ min: -50, max: 50, noNaN: true }),
					fc.double({ min: -50, max: 50, noNaN: true }),
					(a0, a1, b0, b1) => {
						const a: Complex = [a0, a1];
						const b: Complex = [b0, b1];
						const q = cDiv(a, b);
						if (q === null) return true; // 分母≈0(極)は対象外
						const back = cMul(q, b);
						const scale = Math.max(1, Math.abs(a0), Math.abs(a1));
						return (
							Math.abs(back[0] - a0) <= 1e-6 * scale && Math.abs(back[1] - a1) <= 1e-6 * scale
						);
					},
				),
				{ seed: 42, numRuns: 300 },
			);
		},
	);

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			expect(() => cDiv([value, 0], ONE)).toThrow(RangeError);
			expect(() => cDiv(ONE, [value, 0])).toThrow(RangeError);
		});
	}
});

describe('argDeg / modulus', () => {
	it('黄金値: arg(-1)=180度、|−1|=1', () => {
		expect(argDeg([-1, 0])).toBeCloseTo(180, 10);
		expect(modulus([-1, 0])).toBe(1);
	});

	it('黄金値: arg(i)=90度、|i|=1', () => {
		expect(argDeg(I)).toBeCloseTo(90, 10);
		expect(modulus(I)).toBe(1);
	});

	it('黄金値: |3+4i|=5(3-4-5の直角三角形)', () => {
		expect(modulus([3, 4])).toBe(5);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → argDeg/modulus いずれも RangeError`, () => {
			expect(() => argDeg([value, 0])).toThrow(RangeError);
			expect(() => modulus([value, 0])).toThrow(RangeError);
		});
	}
});

describe('evaluateComplex', () => {
	it('転用問題(1)黄金値: z=i での f(z)=z² は -1(偏角180度、絶対値1)', () => {
		const w = evaluateComplex('square', I);
		expect(w).not.toBeNull();
		expect(w![0]).toBeCloseTo(-1, 12);
		expect(w![1]).toBeCloseTo(0, 12);
		expect(argDeg(w!)).toBeCloseTo(180, 10);
		expect(modulus(w!)).toBeCloseTo(1, 12);
	});

	it('golden: z³−1 の3つの零点(1, -1/2+i√3/2, -1/2-i√3/2)で evaluateComplex ≈ 0', () => {
		const sqrt3over2 = Math.sqrt(3) / 2;
		const roots: Complex[] = [
			[1, 0],
			[-0.5, sqrt3over2],
			[-0.5, -sqrt3over2],
		];
		for (const root of roots) {
			const w = evaluateComplex('cubeMinusOne', root);
			expect(w).not.toBeNull();
			expect(modulus(w!)).toBeLessThan(1e-9);
		}
	});

	it('reciprocal: z=0 で null(極)', () => {
		expect(evaluateComplex('reciprocal', ZERO)).toBeNull();
	});

	it('reciprocal: z=1 で f(z)=1(黄金値)', () => {
		const w = evaluateComplex('reciprocal', ONE);
		expect(w).not.toBeNull();
		expect(w![0]).toBeCloseTo(1, 12);
		expect(w![1]).toBeCloseTo(0, 12);
	});

	it('mobius: z=1 で f(z)=0(零点)、z=-1 で null(極)', () => {
		const wAtOne = evaluateComplex('mobius', ONE);
		expect(wAtOne).not.toBeNull();
		expect(modulus(wAtOne!)).toBeLessThan(1e-12);
		expect(evaluateComplex('mobius', [-1, 0])).toBeNull();
	});

	it('mobius: z=0 で f(z)=(0-1)/(0+1)=-1(黄金値)', () => {
		const w = evaluateComplex('mobius', ZERO);
		expect(w).not.toBeNull();
		expect(w![0]).toBeCloseTo(-1, 12);
		expect(w![1]).toBeCloseTo(0, 12);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な入力 → RangeError`, () => {
			expect(() => evaluateComplex('square', [value, 0])).toThrow(RangeError);
		});
	}
});

describe('expectedWindingNumber (閉形式・独立オラクル)', () => {
	it('COMPLEX_FN_SINGULARITIES: square は原点に重複度2の零点のみ', () => {
		expect(COMPLEX_FN_SINGULARITIES.square).toEqual([{ point: [0, 0], kind: 'zero', order: 2 }]);
	});

	it('square: 原点を囲む円は期待巻き数2、囲まない円は0', () => {
		expect(expectedWindingNumber('square', [0, 0], 1)).toBe(2);
		expect(expectedWindingNumber('square', [10, 10], 1)).toBe(0);
	});

	it('cubeMinusOne: 各零点を単独で囲むと期待巻き数1', () => {
		expect(expectedWindingNumber('cubeMinusOne', [1, 0], 0.3)).toBe(1);
		expect(expectedWindingNumber('cubeMinusOne', [-0.5, Math.sqrt(3) / 2], 0.3)).toBe(1);
	});

	it('reciprocal: 極を囲むと期待巻き数-1', () => {
		expect(expectedWindingNumber('reciprocal', [0, 0], 1)).toBe(-1);
	});

	it('mobius: 零点(z=1)を囲むと+1、極(z=-1)を囲むと-1、両方囲むと0(+1と-1の合計)', () => {
		expect(expectedWindingNumber('mobius', [1, 0], 0.5)).toBe(1);
		expect(expectedWindingNumber('mobius', [-1, 0], 0.5)).toBe(-1);
		expect(expectedWindingNumber('mobius', [0, 0], 1.5)).toBe(0);
	});

	it('円周がちょうど特異点の上に乗る場合は RangeError(曖昧な巻き数を返さない)', () => {
		// square の特異点は原点。center=(1,0)・radius=1 で境界がちょうど原点を通る
		// (以前は radius=0 が事前検証で弾かれるだけの偽検証だった——GrokBuild 指摘の反映)。
		expect(() => expectedWindingNumber('square', [1, 0], 1)).toThrow(RangeError);
		// mobius の零点 (1,0) を境界に乗せるケース
		expect(() => expectedWindingNumber('mobius', [0, 0], 1)).toThrow(RangeError);
	});
});

describe('windingNumberAround (数値積分) と expectedWindingNumber (閉形式) の交差検証 (C-7)', () => {
	it('golden: square(z²)は原点周りで巻き数≈2(零点の重複度と一致)', () => {
		const w = windingNumberAround('square', [0, 0], 1, 720);
		expect(w).toBeCloseTo(2, 2);
		expect(Math.round(w)).toBe(expectedWindingNumber('square', [0, 0], 1));
	});

	it('golden: cubeMinusOne は各零点周りで巻き数≈1', () => {
		const roots: Complex[] = [
			[1, 0],
			[-0.5, Math.sqrt(3) / 2],
			[-0.5, -Math.sqrt(3) / 2],
		];
		for (const root of roots) {
			const w = windingNumberAround('cubeMinusOne', root, 0.3, 720);
			expect(w).toBeCloseTo(1, 2);
		}
	});

	it('golden: reciprocal(1/z)は極(原点)周りで巻き数≈-1(零点と逆回り)', () => {
		const w = windingNumberAround('reciprocal', [0, 0], 1, 720);
		expect(w).toBeCloseTo(-1, 2);
	});

	it('golden: mobius は零点(z=1)周りで+1、極(z=-1)周りで-1', () => {
		expect(windingNumberAround('mobius', [1, 0], 0.5, 720)).toBeCloseTo(1, 2);
		expect(windingNumberAround('mobius', [-1, 0], 0.5, 720)).toBeCloseTo(-1, 2);
	});

	it('囲む特異点がない円では巻き数≈0(全プリセット共通)', () => {
		const presets: ComplexFnId[] = ['square', 'cubeMinusOne', 'reciprocal', 'mobius'];
		for (const fnId of presets) {
			const w = windingNumberAround(fnId, [10, 7], 2, 360);
			expect(w).toBeCloseTo(0, 2);
		}
	});

	it(
		'property (1) 単独の零点/極をちょうど1つだけ囲む円では、数値巻き数(windingNumberAround)が' +
			'閉形式の期待値(expectedWindingNumber、完全に別経路)へ収束する(fast-check seed 42、' +
			'各プリセットの各特異点×ランダム半径)',
		() => {
			const cases: { fnId: ComplexFnId; point: Complex; maxRadius: number }[] = [
				{ fnId: 'square', point: [0, 0], maxRadius: 5 },
				{ fnId: 'cubeMinusOne', point: [1, 0], maxRadius: 0.8 },
				{ fnId: 'cubeMinusOne', point: [-0.5, Math.sqrt(3) / 2], maxRadius: 0.8 },
				{ fnId: 'cubeMinusOne', point: [-0.5, -Math.sqrt(3) / 2], maxRadius: 0.8 },
				{ fnId: 'reciprocal', point: [0, 0], maxRadius: 5 },
				{ fnId: 'mobius', point: [1, 0], maxRadius: 0.9 },
				{ fnId: 'mobius', point: [-1, 0], maxRadius: 0.9 },
			];
			fc.assert(
				fc.property(
					fc.constantFrom(...cases),
					fc.double({ min: 0.05, max: 1, noNaN: true }),
					(c, t) => {
						const radius = 0.05 + t * (c.maxRadius - 0.05);
						const numeric = windingNumberAround(c.fnId, c.point, radius, 480);
						const expected = expectedWindingNumber(c.fnId, c.point, radius);
						return Math.abs(numeric - expected) < 0.05;
					},
				),
				{ seed: 42, numRuns: 100 },
			);
		},
	);

	it('property (2) 特異点を1つも囲まない円では、数値巻き数・期待値ともに0(fast-check seed 42)', () => {
		const presets: ComplexFnId[] = ['square', 'cubeMinusOne', 'reciprocal', 'mobius'];
		fc.assert(
			fc.property(
				fc.constantFrom(...presets),
				fc.double({ min: 0.1, max: 3, noNaN: true }),
				fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
				(fnId, radius, theta) => {
					// 全プリセットの特異点は原点から距離1以内に集まっている(COMPLEX_FN_SINGULARITIES)。
					// 中心を距離10の円周上に置けば、半径3以下のどんな円も特異点を囲まない
					// (三角不等式: 特異点までの最短距離 >= 10 - 1 - 3 > 0)。
					const center: Complex = [10 * Math.cos(theta), 10 * Math.sin(theta)];
					const numeric = windingNumberAround(fnId, center, radius, 360);
					const expected = expectedWindingNumber(fnId, center, radius);
					return expected === 0 && Math.abs(numeric) < 0.05;
				},
			),
			{ seed: 42, numRuns: 100 },
		);
	});

	it('samples が8未満 → RangeError(意味のある巻き数計算に必要な最小サンプル数)', () => {
		expect(() => windingNumberAround('square', [0, 0], 1, 4)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な center/radius → windingNumberAround/expectedWindingNumber いずれも RangeError`, () => {
			expect(() => windingNumberAround('square', [value, 0], 1, 100)).toThrow(RangeError);
			expect(() => windingNumberAround('square', [0, 0], value, 100)).toThrow(RangeError);
			expect(() => expectedWindingNumber('square', [value, 0], 1)).toThrow(RangeError);
		});
	}

	it('radius が非正 → RangeError', () => {
		expect(() => windingNumberAround('square', [0, 0], 0, 100)).toThrow(RangeError);
		expect(() => windingNumberAround('square', [0, 0], -1, 100)).toThrow(RangeError);
		expect(() => expectedWindingNumber('square', [0, 0], -1)).toThrow(RangeError);
	});
});
