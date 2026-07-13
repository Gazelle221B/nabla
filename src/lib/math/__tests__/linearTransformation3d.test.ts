import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	applyMatrix3,
	determinant3,
	determinant3BySarrus,
	multiplyMatrix3,
	transformUnitCube,
	signedVolumeOfParallelepiped,
	columnsOf,
	UNIT_CUBE_VERTICES,
	UNIT_CUBE_EDGES,
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

describe('applyMatrix3', () => {
	it('恒等行列は任意のベクトルをそのまま返す', () => {
		expect(applyMatrix3(IDENTITY, [2, -3, 5])).toEqual([2, -3, 5]);
	});

	it('既知例: 対角行列 diag(2,1,0.5) は各成分をそれぞれスケールする', () => {
		expect(applyMatrix3(LINEAR_TRANSFORM_3D_PRESETS.diagonal.matrix, [1, 1, 1])).toEqual([2, 1, 0.5]);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な行列成分 → RangeError`, () => {
			const m: Matrix3x3 = [[value, 0, 0], [0, 1, 0], [0, 0, 1]];
			expect(() => applyMatrix3(m, [1, 1, 1])).toThrow(RangeError);
		});
		it(`${label} なベクトル成分 → RangeError`, () => {
			expect(() => applyMatrix3(IDENTITY, [value, 0, 0])).toThrow(RangeError);
		});
	}
});

describe('determinant3(余因子展開)', () => {
	it('既知例: 恒等行列 → 1', () => {
		expect(determinant3(IDENTITY)).toBe(1);
	});

	it('既知例: 対角行列 diag(2,1,0.5) → 1(体積拡大率1、形は変わるが体積は保存される)', () => {
		expect(determinant3(LINEAR_TRANSFORM_3D_PRESETS.diagonal.matrix)).toBe(1);
	});

	it('既知例: z軸まわり45°回転 → 1(回転は角度によらず体積・向きを保つ)', () => {
		expect(determinant3(LINEAR_TRANSFORM_3D_PRESETS.rotationZ45.matrix)).toBe(1);
	});

	it('既知例: 鏡映(x軸方向に反転) → -1(体積比1のまま向きが反転)', () => {
		expect(determinant3(LINEAR_TRANSFORM_3D_PRESETS.reflectionX.matrix)).toBe(-1);
	});

	it('既知例: 退化(ランク2、xy平面へ押し潰す) → 0(空間が平面に潰れる)', () => {
		expect(determinant3(LINEAR_TRANSFORM_3D_PRESETS.degenerate.matrix)).toBe(0);
	});

	it('既知例: せん断 → 1(形を歪めるが体積は保存される)', () => {
		expect(determinant3(LINEAR_TRANSFORM_3D_PRESETS.shear.matrix)).toBe(1);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			const m: Matrix3x3 = [[value, 0, 0], [0, 1, 0], [0, 0, 1]];
			expect(() => determinant3(m)).toThrow(RangeError);
		});
	}
});

describe('determinant3BySarrus(サラスの法則、対角線和)', () => {
	it('既知例: 恒等行列 → 1', () => {
		expect(determinant3BySarrus(IDENTITY)).toBe(1);
	});

	it('既知例: 鏡映(x軸方向に反転) → -1', () => {
		expect(determinant3BySarrus(LINEAR_TRANSFORM_3D_PRESETS.reflectionX.matrix)).toBe(-1);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			const m: Matrix3x3 = [[value, 0, 0], [0, 1, 0], [0, 0, 1]];
			expect(() => determinant3BySarrus(m)).toThrow(RangeError);
		});
	}
});

describe('multiplyMatrix3', () => {
	it('恒等行列との積はもとの行列のまま', () => {
		const m: Matrix3x3 = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
		expect(multiplyMatrix3(m, IDENTITY)).toEqual(m);
		expect(multiplyMatrix3(IDENTITY, m)).toEqual(m);
	});

	it('既知例: 対角行列同士の積は対角成分ごとの積になる', () => {
		const d1: Matrix3x3 = [[2, 0, 0], [0, 3, 0], [0, 0, 4]];
		const d2: Matrix3x3 = [[5, 0, 0], [0, 6, 0], [0, 0, 7]];
		expect(multiplyMatrix3(d1, d2)).toEqual([[10, 0, 0], [0, 18, 0], [0, 0, 28]]);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			const m: Matrix3x3 = [[value, 0, 0], [0, 1, 0], [0, 0, 1]];
			expect(() => multiplyMatrix3(m, IDENTITY)).toThrow(RangeError);
			expect(() => multiplyMatrix3(IDENTITY, m)).toThrow(RangeError);
		});
	}
});

describe('transformUnitCube / UNIT_CUBE_VERTICES / UNIT_CUBE_EDGES', () => {
	it('単位立方体は8頂点を持つ', () => {
		expect(UNIT_CUBE_VERTICES).toHaveLength(8);
	});

	it('単位立方体は12辺を持ち、各辺は有効な頂点インデックス対を指す', () => {
		expect(UNIT_CUBE_EDGES).toHaveLength(12);
		for (const [i, j] of UNIT_CUBE_EDGES) {
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(8);
			expect(j).toBeGreaterThanOrEqual(0);
			expect(j).toBeLessThan(8);
		}
	});

	it('恒等行列で変換しても単位立方体の頂点は変わらない', () => {
		expect(transformUnitCube(IDENTITY)).toEqual(UNIT_CUBE_VERTICES);
	});

	it('既知例: 対角行列 diag(2,1,0.5) は各頂点の成分をスケールする', () => {
		const transformed = transformUnitCube(LINEAR_TRANSFORM_3D_PRESETS.diagonal.matrix);
		expect(transformed[7]).toEqual([2, 1, 0.5]); // 頂点 (1,1,1) の像
	});
});

describe('signedVolumeOfParallelepiped', () => {
	it('既知例: 標準基底 e1,e2,e3(単位立方体そのもの)の符号つき体積は1', () => {
		expect(signedVolumeOfParallelepiped([1, 0, 0], [0, 1, 0], [0, 0, 1])).toBe(1);
	});

	it('既知例: 2引数を入れ替えると符号が反転する(向きの反転)', () => {
		expect(signedVolumeOfParallelepiped([0, 1, 0], [1, 0, 0], [0, 0, 1])).toBe(-1);
	});

	it('退化例: 3ベクトルが同一平面上(z成分が全て0)なら体積0(例外なし)', () => {
		expect(signedVolumeOfParallelepiped([1, 0, 0], [0, 1, 0], [1, 1, 0])).toBe(0);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な成分 → RangeError`, () => {
			expect(() => signedVolumeOfParallelepiped([value, 0, 0], [0, 1, 0], [0, 0, 1])).toThrow(
				RangeError,
			);
		});
	}
});

describe('columnsOf', () => {
	it('行優先で格納された行列から列ベクトルを正しく取り出す', () => {
		const m: Matrix3x3 = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
		expect(columnsOf(m)).toEqual([
			[1, 4, 7],
			[2, 5, 8],
			[3, 6, 9],
		]);
	});
});

// fast-check 用の共通レンジ(seed 42、rule of three: linearTransformation.test.ts / 他単元の
// fast-check テストと同じ規約: entry 範囲を有界にし、退化・スケール発散を防ぐ)。
const entryArb = fc.double({ min: -6, max: 6, noNaN: true });
const matrixArb: fc.Arbitrary<Matrix3x3> = fc
	.tuple(
		entryArb, entryArb, entryArb,
		entryArb, entryArb, entryArb,
		entryArb, entryArb, entryArb,
	)
	.map(
		([a, b, c, d, e, f, g, h, i]) =>
			[
				[a, b, c],
				[d, e, f],
				[g, h, i],
			] as Matrix3x3,
	);

const vectorArb = fc.tuple(
	fc.double({ min: -6, max: 6, noNaN: true }),
	fc.double({ min: -6, max: 6, noNaN: true }),
	fc.double({ min: -6, max: 6, noNaN: true }),
) as fc.Arbitrary<Vector3>;

function transpose(m: Matrix3x3): Matrix3x3 {
	const [[a, b, c], [d, e, f], [g, h, i]] = m;
	return [
		[a, d, g],
		[b, e, h],
		[c, f, i],
	];
}

function swapRows(m: Matrix3x3, r1: number, r2: number): Matrix3x3 {
	const rows = [m[0], m[1], m[2]];
	const tmp = rows[r1];
	rows[r1] = rows[r2];
	rows[r2] = tmp;
	return [rows[0], rows[1], rows[2]];
}

function scaleMatrix(m: Matrix3x3, k: number): Matrix3x3 {
	return m.map((row) => row.map((x) => x * k)) as unknown as Matrix3x3;
}

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property: 余因子展開(determinant3)とサラスの法則(determinant3BySarrus)は独立な計算経路 ' +
			'だが常に一致する(C-7: どちらか一方の実装誤りを検出できる)',
		() => {
			fc.assert(
				fc.property(matrixArb, (m) => {
					const byExpansion = determinant3(m);
					const bySarrus = determinant3BySarrus(m);
					const scale = Math.max(1, Math.abs(byExpansion), Math.abs(bySarrus));
					return approximatelyZero(byExpansion - bySarrus, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property: 行列式=符号つき体積(determinant3(m) === signedVolumeOfParallelepiped(m の3列ベクトル)) ' +
			'——determinant3 を一切呼ばない独立実装(外積・内積)との突合。この単元の中核となる定理',
		() => {
			fc.assert(
				fc.property(matrixArb, (m) => {
					const det = determinant3(m);
					const [col1, col2, col3] = columnsOf(m);
					const volume = signedVolumeOfParallelepiped(col1, col2, col3);
					const scale = Math.max(1, Math.abs(det), Math.abs(volume));
					return approximatelyZero(det - volume, scale);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property: 単位立方体を変換した像から求めた体積(3辺ベクトルの三重積)も det(m) に一致する', () => {
		fc.assert(
			fc.property(matrixArb, (m) => {
				const transformed = transformUnitCube(m);
				// 頂点0=(0,0,0)を起点とする3辺: 頂点1,2,4(UNIT_CUBE_VERTICES の定義より
				// それぞれ x軸・y軸・z軸方向の単位辺に対応)。
				const origin = transformed[0];
				const edge1: Vector3 = [
					transformed[1][0] - origin[0],
					transformed[1][1] - origin[1],
					transformed[1][2] - origin[2],
				];
				const edge2: Vector3 = [
					transformed[2][0] - origin[0],
					transformed[2][1] - origin[1],
					transformed[2][2] - origin[2],
				];
				const edge4: Vector3 = [
					transformed[4][0] - origin[0],
					transformed[4][1] - origin[1],
					transformed[4][2] - origin[2],
				];
				const volume = signedVolumeOfParallelepiped(edge1, edge2, edge4);
				const det = determinant3(m);
				const scale = Math.max(1, Math.abs(det), Math.abs(volume));
				return approximatelyZero(det - volume, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 乗法性 det(AB) = det(A)・det(B)', () => {
		fc.assert(
			fc.property(matrixArb, matrixArb, (a, b) => {
				const ab = multiplyMatrix3(a, b);
				const lhs = determinant3(ab);
				const rhs = determinant3(a) * determinant3(b);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return approximatelyZero(lhs - rhs, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 転置不変 det(Aᵀ) = det(A)', () => {
		fc.assert(
			fc.property(matrixArb, (m) => {
				const lhs = determinant3(transpose(m));
				const rhs = determinant3(m);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return approximatelyZero(lhs - rhs, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 2つの行を交換すると行列式の符号が反転する', () => {
		fc.assert(
			fc.property(matrixArb, fc.constantFrom([0, 1] as const, [0, 2] as const, [1, 2] as const), (m, [r1, r2]) => {
				const swapped = swapRows(m, r1, r2);
				const lhs = determinant3(swapped);
				const rhs = -determinant3(m);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return approximatelyZero(lhs - rhs, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: スカラー倍 det(kA) = k³det(A)', () => {
		fc.assert(
			fc.property(matrixArb, fc.double({ min: -4, max: 4, noNaN: true }), (m, k) => {
				const lhs = determinant3(scaleMatrix(m, k));
				const rhs = k ** 3 * determinant3(m);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				return approximatelyZero(lhs - rhs, scale);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('property: 恒等変換は単位立方体のどの頂点も動かさない(恒等行列の具体例の一般化)', () => {
		fc.assert(
			fc.property(vectorArb, (v) => {
				const result = applyMatrix3(IDENTITY, v);
				return (
					approximatelyZero(result[0] - v[0], Math.max(1, Math.abs(v[0]))) &&
					approximatelyZero(result[1] - v[1], Math.max(1, Math.abs(v[1]))) &&
					approximatelyZero(result[2] - v[2], Math.max(1, Math.abs(v[2])))
				);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});
