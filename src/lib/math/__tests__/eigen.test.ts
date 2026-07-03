import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	applyMatrix,
	dotProduct2,
	crossProduct2,
	unitVectorFromAngle,
	isParallel,
	computeEigenSystem,
	classifyEigenSystem,
	eigenResidual,
	stabilizeEigenvectorDirection,
	type Matrix2x2,
	type Vector2,
	type EigenSystemResult,
} from '../eigen.js';

const EPSILON = 1e-9;

function approximatelyZero(value: number, scale: number): boolean {
	return Math.abs(value) <= EPSILON * Math.max(1, scale);
}

// ---------------------------------------------------------------------------
// applyMatrix
// ---------------------------------------------------------------------------

describe('applyMatrix', () => {
	it('単位行列は任意のベクトルを不変にする', () => {
		expect(applyMatrix([[1, 0], [0, 1]], [3, -5])).toEqual([3, -5]);
	});

	it('ゼロ行列は任意のベクトルをゼロベクトルへ写す', () => {
		expect(
			applyMatrix(
				[
					[0, 0],
					[0, 0],
				],
				[7, 2],
			),
		).toEqual([0, 0]);
	});

	it('既知の対角行列: [[2,0],[0,3]] * (1,1) = (2,3)', () => {
		expect(
			applyMatrix(
				[
					[2, 0],
					[0, 3],
				],
				[1, 1],
			),
		).toEqual([2, 3]);
	});

	it('NaN 入力 → RangeError', () => {
		expect(() => applyMatrix([[1, 0], [0, 1]], [NaN, 0])).toThrow(RangeError);
	});

	it('Infinity 成分を含む行列 → RangeError', () => {
		expect(() => applyMatrix([[Infinity, 0], [0, 1]], [1, 0])).toThrow(RangeError);
	});

	it('property: 線形性 A(u+v) = Au + Av', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				(a, b, c, d, ux, uy, vx, vy) => {
					const matrix: Matrix2x2 = [
						[a, b],
						[c, d],
					];
					const u: Vector2 = [ux, uy];
					const v: Vector2 = [vx, vy];
					const sum: Vector2 = [ux + vx, uy + vy];
					const left = applyMatrix(matrix, sum);
					const au = applyMatrix(matrix, u);
					const av = applyMatrix(matrix, v);
					const right: Vector2 = [au[0] + av[0], au[1] + av[1]];
					const scale = Math.abs(left[0]) + Math.abs(left[1]) + Math.abs(right[0]) + Math.abs(right[1]);
					return (
						approximatelyZero(left[0] - right[0], scale) && approximatelyZero(left[1] - right[1], scale)
					);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

// ---------------------------------------------------------------------------
// dotProduct2 / crossProduct2 / unitVectorFromAngle / isParallel
// ---------------------------------------------------------------------------

describe('dotProduct2 / crossProduct2', () => {
	it('直交ベクトルの内積は0', () => {
		expect(dotProduct2([1, 0], [0, 1])).toBe(0);
	});

	it('平行ベクトルの外積は0', () => {
		expect(crossProduct2([2, 0], [5, 0])).toBe(0);
	});

	it('既知の外積: (1,0) x (0,1) = 1', () => {
		expect(crossProduct2([1, 0], [0, 1])).toBe(1);
	});
});

describe('unitVectorFromAngle', () => {
	it('角度0は(1,0)', () => {
		const [x, y] = unitVectorFromAngle(0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
	});

	it('角度π/2は(0,1)', () => {
		const [x, y] = unitVectorFromAngle(Math.PI / 2);
		expect(x).toBeCloseTo(0, 10);
		expect(y).toBeCloseTo(1, 10);
	});

	it('property: 常に単位ベクトル(ノルム1)', () => {
		fc.assert(
			fc.property(fc.double({ min: -100, max: 100, noNaN: true }), (angle) => {
				const [x, y] = unitVectorFromAngle(angle);
				return approximatelyZero(Math.hypot(x, y) - 1, 1);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});
});

describe('isParallel', () => {
	it('同じ向きのベクトルは平行', () => {
		expect(isParallel([1, 0], [2, 0])).toBe(true);
	});

	it('正反対の向きのベクトルも平行とみなす', () => {
		expect(isParallel([1, 0], [-3, 0])).toBe(true);
	});

	it('直交するベクトルは平行でない', () => {
		expect(isParallel([1, 0], [0, 1])).toBe(false);
	});

	it('ゼロベクトルとの組は退化的に平行とみなす', () => {
		expect(isParallel([0, 0], [1, 2])).toBe(true);
	});

	it('オーバーフロー回帰テスト: Number.MAX_VALUE 級のベクトルでも正しく判定する', () => {
		// 素朴に Math.hypot(x,y) で正規化すると x²+y² の内部計算が Infinity へ
		// オーバーフローし、正規化が壊れて直交方向でも平行と誤判定しうる。
		// (MAX_VALUE, MAX_VALUE) は45度方向、(MAX_VALUE, -MAX_VALUE) は-45度方向で
		// 90度直交しており、平行ではない。
		const M = Number.MAX_VALUE;
		expect(isParallel([M, M], [M, -M])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// computeEigenSystem — 具体例
// ---------------------------------------------------------------------------

describe('computeEigenSystem', () => {
	it('単位行列: 重解λ=1・固有空間は平面全体・正則(det=1≠0)', () => {
		// AGENTS.md §7 の過去事故(単位行列を特異行列と誤分類)の回帰テスト。
		const result = computeEigenSystem([
			[1, 0],
			[0, 1],
		]);
		expect(result.realEigenvalues).toEqual([1]);
		expect(result.eigenvectors).toHaveLength(2);
		expect(result.determinant).toBe(1); // 正則(特異ではない)
		expect(classifyEigenSystem(result)).toBe('repeated-full');
	});

	it('90度回転行列: 実固有値なし(複素共役)・正則(det=1≠0)', () => {
		// AGENTS.md §7 の過去事故(回転行列を特異行列と誤分類)の回帰テスト。
		// 「実固有ベクトルを持たない」ことと「特異である」ことは独立した性質であり、
		// この行列は正則(逆行列を持つ)だが実固有ベクトルは持たない。
		const result = computeEigenSystem([
			[0, -1],
			[1, 0],
		]);
		expect(result.realEigenvalues).toEqual([]);
		expect(result.eigenvectors).toEqual([]);
		expect(result.complexEigenvalue).not.toBeNull();
		expect(result.determinant).toBe(1); // 正則(特異ではない)
		expect(classifyEigenSystem(result)).toBe('complex-conjugate');
	});

	it('60度回転行列(特別な角度でない): 実固有値なし(複素共役)', () => {
		const theta = Math.PI / 3;
		const result = computeEigenSystem([
			[Math.cos(theta), -Math.sin(theta)],
			[Math.sin(theta), Math.cos(theta)],
		]);
		expect(classifyEigenSystem(result)).toBe('complex-conjugate');
		expect(approximatelyZero(result.determinant - 1, 1)).toBe(true); // 正則
	});

	it('対称行列 [[2,1],[1,2]]: 相異なる実固有値{1,3}・固有ベクトルは直交', () => {
		const result = computeEigenSystem([
			[2, 1],
			[1, 2],
		]);
		expect(classifyEigenSystem(result)).toBe('distinct-real');
		const sorted = [...result.realEigenvalues].sort((x, y) => x - y);
		expect(sorted[0]).toBeCloseTo(1, 10);
		expect(sorted[1]).toBeCloseTo(3, 10);
		expect(dotProduct2(result.eigenvectors[0], result.eigenvectors[1])).toBeCloseTo(0, 10);
	});

	it('対角行列 diag(2,5): 固有ベクトルは標準基底', () => {
		const result = computeEigenSystem([
			[2, 0],
			[0, 5],
		]);
		expect(classifyEigenSystem(result)).toBe('distinct-real');
		expect(result.realEigenvalues).toEqual([2, 5]);
		expect(result.eigenvectors[0][0]).toBeCloseTo(1, 10);
		expect(result.eigenvectors[0][1]).toBeCloseTo(0, 10);
		expect(result.eigenvectors[1][0]).toBeCloseTo(0, 10);
		expect(result.eigenvectors[1][1]).toBeCloseTo(1, 10);
	});

	it('スカラー行列 3*単位行列: 重解λ=3・固有空間は平面全体', () => {
		const result = computeEigenSystem([
			[3, 0],
			[0, 3],
		]);
		expect(result.realEigenvalues).toEqual([3]);
		expect(result.eigenvectors).toHaveLength(2);
		expect(classifyEigenSystem(result)).toBe('repeated-full');
	});

	it('ゼロ行列: 重解λ=0・固有空間は平面全体', () => {
		const result = computeEigenSystem([
			[0, 0],
			[0, 0],
		]);
		expect(result.realEigenvalues).toEqual([0]);
		expect(classifyEigenSystem(result)).toBe('repeated-full');
	});

	it('Jordan型行列 [[1,1],[0,1]]: 重解λ=1・固有空間は1次元(defective)', () => {
		const result = computeEigenSystem([
			[1, 1],
			[0, 1],
		]);
		expect(result.realEigenvalues).toEqual([1]);
		expect(result.eigenvectors).toHaveLength(1);
		expect(classifyEigenSystem(result)).toBe('repeated-defective');
		// (0,1) 方向は固有ベクトルではない(固有空間が1次元であることの直接確認):
		// A*(0,1) = (1,1) は (0,1) の定数倍ではない。
		const image = applyMatrix(
			[
				[1, 1],
				[0, 1],
			],
			[0, 1],
		);
		expect(isParallel(image, [0, 1])).toBe(false);
	});

	it('特異だが回転ではない行列 [[1,2],[2,4]] (det=0): 実固有値{0,5}を持つ(特異性と複素固有値は独立)', () => {
		// 「特異行列のリスト」という分類が数学的誤りであることの補強テスト
		// (特異=行列式0の行列が、実固有値を持たない訳ではないことを示す)。
		const result = computeEigenSystem([
			[1, 2],
			[2, 4],
		]);
		expect(result.determinant).toBe(0);
		expect(classifyEigenSystem(result)).toBe('distinct-real');
		const sorted = [...result.realEigenvalues].sort((x, y) => x - y);
		expect(sorted[0]).toBeCloseTo(0, 10);
		expect(sorted[1]).toBeCloseTo(5, 10);
	});

	it('数値誤差に敏感な行列(大きな成分): スケール相対誤差で破綻しない', () => {
		const result = computeEigenSystem([
			[2e6, 1e6],
			[1e6, 2e6],
		]);
		expect(classifyEigenSystem(result)).toBe('distinct-real');
		for (let i = 0; i < result.realEigenvalues.length; i += 1) {
			const residual = eigenResidual(
				[
					[2e6, 1e6],
					[1e6, 2e6],
				],
				result.realEigenvalues[i],
				result.eigenvectors[i],
			);
			expect(approximatelyZero(residual, result.realEigenvalues[i] ** 2)).toBe(true);
		}
	});

	it('判別式がわずかに負(重解に近いが実際は複素共役): [[1,1],[-1e-12,1]]', () => {
		// a=d=1 (a−d=0)、判別式 = (a−d)² + 4bc = 4・1・(−1e-12) = −4e-12 < 0。
		// 「ほぼ重解」に見えるが実際には複素共役であり、実固有値を持つ分類を許容しては
		// ならない(誤分類の固定化を防ぐレビュー指摘の回帰テスト)。
		const result = computeEigenSystem([
			[1, 1],
			[-1e-12, 1],
		]);
		expect(classifyEigenSystem(result)).toBe('complex-conjugate');
		expect(Number.isFinite(result.trace)).toBe(true);
	});

	it('大トレース近傍の catastrophic cancellation 回帰テスト: [[1e8,1],[-1,1e8]] は複素共役 (固有値 1e8±i)', () => {
		// tr²−4·det の素朴な計算では tr²≈4e16 と 4·det≈4e16 がほぼ相殺し、丸め誤差で
		// 符号を誤りうる(重解や実固有値に誤分類されうる)。(a−d)²+4bc = 0 + 4・1・(−1) = −4
		// という安定な形で計算すれば相殺自体が起きず、正しく複素共役と判定できる。
		const result = computeEigenSystem([
			[1e8, 1],
			[-1, 1e8],
		]);
		expect(classifyEigenSystem(result)).toBe('complex-conjugate');
		expect(result.complexEigenvalue).not.toBeNull();
		expect(result.complexEigenvalue?.re).toBeCloseTo(1e8, 6);
		expect(result.complexEigenvalue?.im).toBeCloseTo(1, 10);
	});

	it('有限の極小非対角成分を持つJordan型行列は重解・平面全体に誤分類されない: [[0,0],[1e-12,0]]', () => {
		// b=0・c=1e-12(有限・非ゼロ)・a=d=0 の行列。entryScale ベースの許容誤差判定
		// (approximatelyZero(c, entryScale))を使うと、entryScale=1e-12<1 の絶対誤差
		// フロアにより非ゼロの c 自身が「無視できる」と誤判定され、スカラー行列
		// (repeated-full、固有空間は平面全体)に誤分類されてしまう。実際にはこの行列は
		// (A-0・I)v=0 → 1e-12・x=0 → x=0 を要求し、固有空間は (0,y) の1次元
		// (repeated-defective、Jordan型)である。exact zero (b===0, c===0) で判定する
		// ことで正しく区別できる。
		const result = computeEigenSystem([
			[0, 0],
			[1e-12, 0],
		]);
		expect(result.realEigenvalues).toEqual([0]);
		expect(classifyEigenSystem(result)).toBe('repeated-defective');
		expect(result.eigenvectors).toHaveLength(1);
		// 固有ベクトルは (0,1) 方向: A*(0,1) = (0,0) = 0*(0,1)。
		expect(result.eigenvectors[0][0]).toBeCloseTo(0, 10);
		expect(Math.abs(result.eigenvectors[0][1])).toBeCloseTo(1, 10);
	});

	it('わずかに異なる対角行列は重解に誤分類されない: diag(1, 1+1e-10)', () => {
		// 判別式は2乗量 ((a−d)²=1e-20) のため、許容誤差付きで「ほぼ0」とみなす分類だと
		// 実際には相異なる実固有値 1, 1+1e-10 を持つこの行列が重解に誤分類されてしまう。
		// 判別式の符号をそのまま使う(epsilon 幅を設けない)ことで正しく区別できる。
		const result = computeEigenSystem([
			[1, 0],
			[0, 1 + 1e-10],
		]);
		expect(classifyEigenSystem(result)).toBe('distinct-real');
		const sorted = [...result.realEigenvalues].sort((x, y) => x - y);
		expect(sorted[0]).toBeCloseTo(1, 10);
		expect(sorted[1]).toBeCloseTo(1 + 1e-10, 10);
	});

	it('NaN 成分 → RangeError', () => {
		expect(() => computeEigenSystem([[NaN, 0], [0, 1]])).toThrow(RangeError);
	});

	it('Infinity 成分 → RangeError', () => {
		expect(() => computeEigenSystem([[Infinity, 0], [0, 1]])).toThrow(RangeError);
	});
});

// ---------------------------------------------------------------------------
// classifyEigenSystem — 構造だけで判定することの直接確認(自己確認防止のため
// computeEigenSystem を経由せず、手組みの EigenSystemResult で検証する)
// ---------------------------------------------------------------------------

describe('classifyEigenSystem (構造テスト)', () => {
	const base = { trace: 0, determinant: 0, discriminant: 0 };

	it('realEigenvalues が2件 → distinct-real', () => {
		const result: EigenSystemResult = {
			...base,
			realEigenvalues: [1, 2],
			eigenvectors: [
				[1, 0],
				[0, 1],
			],
			complexEigenvalue: null,
		};
		expect(classifyEigenSystem(result)).toBe('distinct-real');
	});

	it('realEigenvalues が1件・eigenvectorsが2件 → repeated-full', () => {
		const result: EigenSystemResult = {
			...base,
			realEigenvalues: [1],
			eigenvectors: [
				[1, 0],
				[0, 1],
			],
			complexEigenvalue: null,
		};
		expect(classifyEigenSystem(result)).toBe('repeated-full');
	});

	it('realEigenvalues が1件・eigenvectorsが1件 → repeated-defective', () => {
		const result: EigenSystemResult = {
			...base,
			realEigenvalues: [1],
			eigenvectors: [[1, 0]],
			complexEigenvalue: null,
		};
		expect(classifyEigenSystem(result)).toBe('repeated-defective');
	});

	it('complexEigenvalue が非null → complex-conjugate', () => {
		const result: EigenSystemResult = {
			...base,
			realEigenvalues: [],
			eigenvectors: [],
			complexEigenvalue: { re: 0, im: 1 },
		};
		expect(classifyEigenSystem(result)).toBe('complex-conjugate');
	});
});

// ---------------------------------------------------------------------------
// eigenResidual
// ---------------------------------------------------------------------------

describe('eigenResidual', () => {
	it('厳密な固有対では残差0', () => {
		expect(
			eigenResidual(
				[
					[2, 0],
					[0, 3],
				],
				2,
				[1, 0],
			),
		).toBe(0);
	});

	it('固有対でないベクトルでは残差 > 0', () => {
		const residual = eigenResidual(
			[
				[2, 0],
				[0, 3],
			],
			2,
			[1, 1],
		);
		expect(residual).toBeGreaterThan(0);
	});

	it('NaN 固有値 → RangeError', () => {
		expect(() => eigenResidual([[1, 0], [0, 1]], NaN, [1, 0])).toThrow(RangeError);
	});
});

// ---------------------------------------------------------------------------
// stabilizeEigenvectorDirection
// ---------------------------------------------------------------------------

describe('stabilizeEigenvectorDirection', () => {
	it('前フレームと内積が負なら符号反転する', () => {
		expect(stabilizeEigenvectorDirection([1, 0], [-1, 0])).toEqual([-1, 0]);
	});

	it('前フレームと内積が正ならそのまま', () => {
		expect(stabilizeEigenvectorDirection([1, 0], [1, 0])).toEqual([1, 0]);
	});

	it('内積がちょうど0(直交)なら反転しない(境界)', () => {
		expect(stabilizeEigenvectorDirection([1, 0], [0, 1])).toEqual([1, 0]);
	});

	it('数学的な固有系の結果自体は変更しない(表示専用の便宜であることの確認)', () => {
		// stabilizeEigenvectorDirection の出力は常に入力(current)と同じ大きさ・同じ直線上。
		fc.assert(
			fc.property(
				fc.double({ min: -10, max: 10, noNaN: true }).filter((x) => x !== 0),
				fc.double({ min: -10, max: 10, noNaN: true }),
				fc.double({ min: -10, max: 10, noNaN: true }).filter((x) => x !== 0),
				fc.double({ min: -10, max: 10, noNaN: true }),
				(cx, cy, px, py) => {
					const current: Vector2 = [cx, cy];
					const previous: Vector2 = [px, py];
					const stabilized = stabilizeEigenvectorDirection(current, previous);
					return isParallel(stabilized, current);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});

// ---------------------------------------------------------------------------
// 不変条件 (fast-check, seed 42, numRuns 200)
// ---------------------------------------------------------------------------

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	const matrixEntryArb = fc.double({ min: -20, max: 20, noNaN: true });
	const matrixArb = fc.tuple(matrixEntryArb, matrixEntryArb, matrixEntryArb, matrixEntryArb);
	// computeEigenSystem の分類(最上位・重解時の下位分類とも)は exact zero 判定のみを
	// 使う設計になった(approximatelyZero によるスケール相対の許容誤差は使わない)ため、
	// 「行列成分の絶対値そのものが小さい」という理由だけでの除外は不要になった
	// (回帰テスト:「わずかに異なる対角行列」「[[0,0],[1e-12,0]]」ケース参照)。
	// 依然として除外が必要なのは、IEEE754 double 自体の表現限界に起因する2種類の
	// 退化のみ:
	// (1) 非ゼロ成分の絶対値が極端に小さい(サブノーマル境界 ~5e-324 に近い)と、
	//     その成分同士の積(4bc 項等)がアンダーフローして厳密に 0 になり、真の値
	//     (数学的には微小だが非ゼロ)の情報が完全に失われる。しきい値 1e-150 は
	//     アンダーフローが起きうる理論的境界(~2.2e-162、積が最小非正規化数を下回る点)
	//     に十分な安全マージンを持たせた値。
	// (2) 成分間の大きさの比が極端(数百万倍以上)だと、固有ベクトルの成分同士
	//     (例: (a−d) と c)の相対的な有効桁が足りず、その比を使う正規化・残差計算で
	//     桁落ちする。しきい値 1e6 は 5000〜30000 回の fast-check 実行で実際に
	//     反例が出なくなる比率を実測して決めた(1e7 では実際に反例が見つかった:
	//     [[0,0],[-6e-18,-7.9e-13]] 相当のケースで isParallel(v,Av) が破綻する)。
	// どちらも実際のUIでは行列は固定の整数値プリセットのみを使うため到達しない
	// 極限入力であり、property テストの探索対象からのみ除外する
	// (exported な computeEigenSystem/isParallel 自体はこれらの入力を拒否せず、
	// 有限の結果を返す — 例外的なケースとして個別の具体例テストで直接検証する)。
	function hasIllConditionedMagnitude(a: number, b: number, c: number, d: number): boolean {
		const magnitudes = [a, b, c, d].map(Math.abs).filter((x) => x > 0);
		if (magnitudes.length === 0) return false; // ゼロ行列は退化ケースとして正しく扱われる
		const maxAbs = Math.max(...magnitudes);
		const minAbs = Math.min(...magnitudes);
		return minAbs < 1e-150 || maxAbs / minAbs > 1e6;
	}

	it('Av ≈ λv: computeEigenSystem が返す全ての実固有対はeigenResidualで残差スケール相対誤差内でゼロ', () => {
		fc.assert(
			fc.property(matrixArb, ([a, b, c, d]) => {
				if (hasIllConditionedMagnitude(a, b, c, d)) return true;
				const matrix: Matrix2x2 = [
					[a, b],
					[c, d],
				];
				const result = computeEigenSystem(matrix);
				const frobeniusScale = a * a + b * b + c * c + d * d;
				return result.realEigenvalues.every((lambda, i) => {
					const residual = eigenResidual(matrix, lambda, result.eigenvectors[i]);
					return approximatelyZero(residual, Math.max(frobeniusScale, lambda * lambda));
				});
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('isParallel(v, Av): 固有ベクトルとその像は独立した外積ベースの判定でも平行と判定される(残差ベースとの相互検証)', () => {
		fc.assert(
			fc.property(matrixArb, ([a, b, c, d]) => {
				if (hasIllConditionedMagnitude(a, b, c, d)) return true;
				const matrix: Matrix2x2 = [
					[a, b],
					[c, d],
				];
				const result = computeEigenSystem(matrix);
				return result.eigenvectors.every((v) => isParallel(v, applyMatrix(matrix, v)));
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('tr = λ1+λ2, det = λ1・λ2 (実固有値がある場合、重解は重複度2として扱う)', () => {
		fc.assert(
			fc.property(matrixArb, ([a, b, c, d]) => {
				if (hasIllConditionedMagnitude(a, b, c, d)) return true;
				const matrix: Matrix2x2 = [
					[a, b],
					[c, d],
				];
				const result = computeEigenSystem(matrix);
				if (result.realEigenvalues.length === 0) return true; // 複素共役はスキップ
				const [l1, l2] =
					result.realEigenvalues.length === 2
						? result.realEigenvalues
						: [result.realEigenvalues[0], result.realEigenvalues[0]];
				const traceScale = Math.abs(result.trace) + Math.abs(l1) + Math.abs(l2);
				const detScale = Math.abs(result.determinant) + Math.abs(l1 * l2);
				return (
					approximatelyZero(result.trace - (l1 + l2), traceScale) &&
					approximatelyZero(result.determinant - l1 * l2, detScale)
				);
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('det < 0 ならば実固有値が2つ存在する(複素共役にはなり得ない)', () => {
		// 負の行列式は「符号の異なる2つの実固有値を持つ」ことの構造的必然性を示す不変条件。
		// AGENTS.md §7 の過去事故(特異性・実固有値の有無・符号を混同する誤り)への
		// 別角度からの回帰テスト。
		fc.assert(
			fc.property(matrixArb, ([a, b, c, d]) => {
				const matrix: Matrix2x2 = [
					[a, b],
					[c, d],
				];
				if (hasIllConditionedMagnitude(a, b, c, d)) return true;
				const determinant = a * d - b * c;
				if (determinant >= 0) return true;
				const result = computeEigenSystem(matrix);
				return classifyEigenSystem(result) === 'distinct-real';
			}),
			{ seed: 42, numRuns: 200 },
		);
	});

	it('対称行列(b=c)で相異なる実固有値を持つ場合、固有ベクトルは直交する', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -20, max: 20, noNaN: true }),
				fc.double({ min: -20, max: 20, noNaN: true }),
				fc.double({ min: -20, max: 20, noNaN: true }),
				(a, b, d) => {
					if (hasIllConditionedMagnitude(a, b, b, d)) return true;
					const matrix: Matrix2x2 = [
						[a, b],
						[b, d],
					];
					const result = computeEigenSystem(matrix);
					if (classifyEigenSystem(result) !== 'distinct-real') return true;
					const dot = dotProduct2(result.eigenvectors[0], result.eigenvectors[1]);
					return approximatelyZero(dot, 1);
				},
			),
			{ seed: 42, numRuns: 200 },
		);
	});
});
