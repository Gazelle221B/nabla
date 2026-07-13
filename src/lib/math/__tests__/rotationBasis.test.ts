import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	rotationXMatrix,
	rotationYMatrix,
	transpose3,
	isOrthogonal,
	coordinatesInBasis,
	solveCoordinates,
	rotationMatrixForAxis,
	type RotationAxis,
} from '../rotationBasis.js';
import {
	applyMatrix3,
	determinant3,
	multiplyMatrix3,
	rotationZMatrix,
	LINEAR_TRANSFORM_3D_PRESETS,
	type Matrix3x3,
	type Vector3,
} from '../linearTransformation3d.js';
import { approximatelyZero } from '../compare.js';

const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

const IDENTITY: Matrix3x3 = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

function matrixApproxEqual(a: Matrix3x3, b: Matrix3x3): boolean {
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const scale = Math.max(1, Math.abs(a[r][c]), Math.abs(b[r][c]));
			if (!approximatelyZero(a[r][c] - b[r][c], scale)) return false;
		}
	}
	return true;
}

function vectorApproxEqual(a: Vector3, b: Vector3): boolean {
	for (let i = 0; i < 3; i++) {
		const scale = Math.max(1, Math.abs(a[i]), Math.abs(b[i]));
		if (!approximatelyZero(a[i] - b[i], scale)) return false;
	}
	return true;
}

describe('rotationXMatrix / rotationYMatrix', () => {
	it('既知例: Rx(90) は (0,1,0)→(0,0,1) に写す', () => {
		const v = applyMatrix3(rotationXMatrix(90), [0, 1, 0]);
		expect(approximatelyZero(v[0], 1)).toBe(true);
		expect(approximatelyZero(v[1], 1)).toBe(true);
		expect(approximatelyZero(v[2] - 1, 1)).toBe(true);
	});

	it('既知例: Ry(90) は (0,0,1)→(1,0,0) に写す', () => {
		const v = applyMatrix3(rotationYMatrix(90), [0, 0, 1]);
		expect(approximatelyZero(v[0] - 1, 1)).toBe(true);
		expect(approximatelyZero(v[1], 1)).toBe(true);
		expect(approximatelyZero(v[2], 1)).toBe(true);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な角度 → RangeError(rotationXMatrix)`, () => {
			expect(() => rotationXMatrix(value)).toThrow(RangeError);
		});
		it(`${label} な角度 → RangeError(rotationYMatrix)`, () => {
			expect(() => rotationYMatrix(value)).toThrow(RangeError);
		});
	}
});

describe('transpose3', () => {
	it('既知例: 非対称行列の転置は行と列を入れ替える', () => {
		const m: Matrix3x3 = [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		];
		expect(transpose3(m)).toEqual([
			[1, 4, 7],
			[2, 5, 8],
			[3, 6, 9],
		]);
	});

	it('転置の転置はもとの行列に戻る', () => {
		const m: Matrix3x3 = [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		];
		expect(transpose3(transpose3(m))).toEqual(m);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			const m: Matrix3x3 = [[value, 0, 0], [0, 1, 0], [0, 0, 1]];
			expect(() => transpose3(m)).toThrow(RangeError);
		});
	}
});

describe('isOrthogonal', () => {
	it('恒等行列は正規直交', () => {
		expect(isOrthogonal(IDENTITY)).toBe(true);
	});

	it('回転行列(Rz(45))は正規直交', () => {
		expect(isOrthogonal(rotationZMatrix(45))).toBe(true);
	});

	it('せん断行列(非直交だが可逆)は正規直交ではない', () => {
		const shear: Matrix3x3 = [
			[1, 1, 0],
			[0, 1, 0],
			[0, 0, 1],
		];
		expect(isOrthogonal(shear)).toBe(false);
	});

	it('対角行列 diag(2,1,0.5)(直交でない)は正規直交ではない', () => {
		expect(isOrthogonal(LINEAR_TRANSFORM_3D_PRESETS.diagonal.matrix)).toBe(false);
	});
});

describe('coordinatesInBasis / solveCoordinates(golden)', () => {
	it('golden: Rz(90) を基底にすると、v=(1,0,0) の新基底での座標は (0,-1,0)', () => {
		const basis = rotationZMatrix(90);
		const coords = coordinatesInBasis(basis, [1, 0, 0]);
		expect(coords).not.toBeNull();
		expect(vectorApproxEqual(coords as Vector3, [0, -1, 0])).toBe(true);

		const cramer = solveCoordinates(basis, [1, 0, 0]);
		expect(cramer).not.toBeNull();
		expect(vectorApproxEqual(cramer as Vector3, [0, -1, 0])).toBe(true);
	});

	it('非直交基底(せん断)では coordinatesInBasis は null を返す', () => {
		const shear: Matrix3x3 = [
			[1, 1, 0],
			[0, 1, 0],
			[0, 0, 1],
		];
		expect(coordinatesInBasis(shear, [3, 2, 5])).toBeNull();
	});

	it('非直交だが可逆な基底(せん断)では solveCoordinates が座標を返す(手計算既知例)', () => {
		// 基底の列: e1'=(1,0,0), e2'=(1,1,0), e3'=(0,0,1)。
		// v=(3,2,5) = 1*e1' + 2*e2' + 5*e3' = (1+2, 2, 5) = (3,2,5) を満たす x=(1,2,5)。
		const shear: Matrix3x3 = [
			[1, 1, 0],
			[0, 1, 0],
			[0, 0, 1],
		];
		const coords = solveCoordinates(shear, [3, 2, 5]);
		expect(coords).not.toBeNull();
		expect(vectorApproxEqual(coords as Vector3, [1, 2, 5])).toBe(true);
	});

	it('特異な基底(退化、det=0)では solveCoordinates が null を返す', () => {
		const degenerate = LINEAR_TRANSFORM_3D_PRESETS.degenerate.matrix;
		expect(solveCoordinates(degenerate, [1, 1, 1])).toBeNull();
	});
});

describe('rotationMatrixForAxis', () => {
	it('z軸は linearTransformation3d.ts の rotationZMatrix と一致する', () => {
		expect(rotationMatrixForAxis('z', 37)).toEqual(rotationZMatrix(37));
	});
	it('x軸/y軸は rotationXMatrix/rotationYMatrix と一致する', () => {
		expect(rotationMatrixForAxis('x', 20)).toEqual(rotationXMatrix(20));
		expect(rotationMatrixForAxis('y', 20)).toEqual(rotationYMatrix(20));
	});
});

// fast-check 用の共通レンジ(seed 42、rule of three: linearTransformation3d.test.ts と同じ規約)。
const axisArb: fc.Arbitrary<RotationAxis> = fc.constantFrom('x', 'y', 'z');
const thetaArb = fc.double({ min: -720, max: 720, noNaN: true });
const vectorArb = fc.tuple(
	fc.double({ min: -6, max: 6, noNaN: true }),
	fc.double({ min: -6, max: 6, noNaN: true }),
	fc.double({ min: -6, max: 6, noNaN: true }),
) as fc.Arbitrary<Vector3>;

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it('property: 回転行列は角度・軸によらず常に正規直交', () => {
		fc.assert(
			fc.property(axisArb, thetaArb, (axis, theta) => {
				return isOrthogonal(rotationMatrixForAxis(axis, theta));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 回転行列の行列式は角度・軸によらず常に1(向きを保つ剛体回転)', () => {
		fc.assert(
			fc.property(axisArb, thetaArb, (axis, theta) => {
				return approximatelyZero(determinant3(rotationMatrixForAxis(axis, theta)) - 1, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: ノルム保存 |Rv| = |v|(回転は長さを変えない)', () => {
		fc.assert(
			fc.property(axisArb, thetaArb, vectorArb, (axis, theta, v) => {
				const R = rotationMatrixForAxis(axis, theta);
				const rv = applyMatrix3(R, v);
				const normV = Math.hypot(...v);
				const normRv = Math.hypot(...rv);
				return approximatelyZero(normV - normRv, Math.max(1, normV));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: Rᵀ = R⁻¹(RᵀR ≈ I、直交行列の定義そのもの)', () => {
		fc.assert(
			fc.property(axisArb, thetaArb, (axis, theta) => {
				const R = rotationMatrixForAxis(axis, theta);
				const rtr = multiplyMatrix3(transpose3(R), R);
				return matrixApproxEqual(rtr, IDENTITY);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property: クラメルの公式(solveCoordinates)と転置による座標(coordinatesInBasis)は ' +
			'まったく異なる導出だが、正規直交基底の上では常に一致する(C-7 交差検証)',
		() => {
			fc.assert(
				fc.property(axisArb, thetaArb, vectorArb, (axis, theta, v) => {
					const R = rotationMatrixForAxis(axis, theta);
					const viaTranspose = coordinatesInBasis(R, v);
					const viaCramer = solveCoordinates(R, v);
					if (viaTranspose === null || viaCramer === null) return false;
					return vectorApproxEqual(viaTranspose, viaCramer);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 回転の合成 Rz(a)Rz(b) = Rz(a+b)', () => {
		fc.assert(
			fc.property(thetaArb, thetaArb, (a, b) => {
				const composed = multiplyMatrix3(rotationZMatrix(a), rotationZMatrix(b));
				const direct = rotationZMatrix(a + b);
				return matrixApproxEqual(composed, direct);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 基底が正規直交でなければ coordinatesInBasis は必ず null(直交性の事前条件)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -3, max: 3, noNaN: true }).filter((x) => Math.abs(x) > 1e-3),
				vectorArb,
				(shearFactor, v) => {
					const shear: Matrix3x3 = [
						[1, shearFactor, 0],
						[0, 1, 0],
						[0, 0, 1],
					];
					return coordinatesInBasis(shear, v) === null;
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
