// 回転行列と基底変換(能動変換 vs 受動変換)の純粋 TypeScript モデル
// (AGENTS.md §5: React/Three.js を一切 import しない。ADR-005 §2: lib/math は Three.js の
// 型を使わない——描画層でのみ変換する)。
//
// linearTransformation3d.ts(3×3 行列・単位立方体の変換)の型(Matrix3x3/Vector3)と
// 関数(multiplyMatrix3, applyMatrix3, determinant3, rotationZMatrix)を再利用し、
// 3軸すべての回転行列(rotationXMatrix/rotationYMatrix)をそろえる同型拡張として実装する。
//
// この単元の中核体験: 同じ点(ベクトル)v は動かさず、座標軸(基底)だけを回転させると、
// v の「座標の数値」は基底が回転したのと逆向きに変わって見える——これは「点を能動的に
// 回転させる」変換 R と、「ものさし(基底)を回転させる」受動変換が、R と R⁻¹=Rᵀ という
// 互いに逆向きの関係にあるためである(直交行列の性質 Rᵀ=R⁻¹)。
//
// C-7(自己確認的検証の禁止)に対応する設計: 「基底変換後の座標」を計算する独立した
// 2つの経路を実装する。
//   (1) coordinatesInBasis — 基底が正規直交であることを利用し、Rᵀ を v に掛ける
//       (行列ベクトル積という代数的な経路。直交行列に限定される)。
//   (2) solveCoordinates   — クラメルの公式(3つの行列式の比)により連立方程式 B·x = v を
//       直接解く(行列式の比という幾何的な経路。正規直交でない一般の可逆基底でも成立する)。
// この2つは正規直交基底の上でのみ比較可能で、独立実装として cross-validate する
// (determinant3 を内部で使う点は共通だが、(1)は行列積、(2)は行列式比という
// アルゴリズム的に異なる導出であり、どちらか一方だけの実装誤りを検出できる)。

import {
	multiplyMatrix3,
	applyMatrix3,
	determinant3,
	rotationZMatrix,
	type Matrix3x3,
	type Vector3,
} from './linearTransformation3d.js';
import { approximatelyZero } from './compare.js';

// linearTransformation3d.ts の assertFiniteMatrix3/assertFiniteVector3 と同じ流儀
// (MATH_CONVENTIONS §3: 非有限入力は事前条件違反として例外にする)。各モジュールが
// 自分の入口でこの検証を行う既存の設計(2×2/3×3で別々に定義)にそろえる。
function assertFiniteMatrix3(matrix: Matrix3x3, name: string): void {
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			if (!Number.isFinite(matrix[r][c])) {
				throw new RangeError(
					`${name} must have finite entries, got ${name}[${r}][${c}] = ${matrix[r][c]}`,
				);
			}
		}
	}
}

function assertFiniteDegrees(thetaDegrees: number, name: string): void {
	if (!Number.isFinite(thetaDegrees)) {
		throw new RangeError(`${name} must be finite, got ${thetaDegrees}`);
	}
}

/**
 * x軸まわりの回転行列 Rx(θ)(θ は度)。rotationZMatrix(linearTransformation3d.ts)と
 * 同型の拡張で、3軸すべてをそろえる。
 */
export function rotationXMatrix(thetaDegrees: number): Matrix3x3 {
	assertFiniteDegrees(thetaDegrees, 'thetaDegrees');
	const t = (thetaDegrees * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	return [
		[1, 0, 0],
		[0, c, -s],
		[0, s, c],
	];
}

/**
 * y軸まわりの回転行列 Ry(θ)(θ は度)。rotationZMatrix と同型の拡張。
 */
export function rotationYMatrix(thetaDegrees: number): Matrix3x3 {
	assertFiniteDegrees(thetaDegrees, 'thetaDegrees');
	const t = (thetaDegrees * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	return [
		[c, 0, s],
		[0, 1, 0],
		[-s, 0, c],
	];
}

/**
 * 3×3 行列の転置 Mᵀ。
 */
export function transpose3(m: Matrix3x3): Matrix3x3 {
	assertFiniteMatrix3(m, 'm');
	const [[a, b, c], [d, e, f], [g, h, i]] = m;
	return [
		[a, d, g],
		[b, e, h],
		[c, f, i],
	];
}

/**
 * 行列 m が正規直交(mᵀm ≈ I)かどうかを判定する。回転行列 Rx/Ry/Rz は角度によらず常に
 * 正規直交であり、Rᵀ=R⁻¹(逆行列 = 転置)が成り立つ——これが「能動変換 R」と「受動変換
 * (基底を R で回す)」が互いに逆向きになる理由の代数的根拠。
 *
 * mᵀm(=multiplyMatrix3(transpose3(m), m))と単位行列 I の各成分をスケール相対誤差で
 * 突合する(MATH_CONVENTIONS §2)。I の成分は 0 か 1 なので scale=1 で十分。
 */
export function isOrthogonal(m: Matrix3x3): boolean {
	const mtm = multiplyMatrix3(transpose3(m), m);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const expected = r === c ? 1 : 0;
			if (!approximatelyZero(mtm[r][c] - expected, 1)) return false;
		}
	}
	return true;
}

/**
 * 正規直交基底(basis の3列 = e1', e2', e3'、世界座標で表した基底ベクトル)に対する
 * ベクトル v の座標を求める: basisᵀ·v。
 *
 * 設計判断(C-7 コメント): 正規直交性(isOrthogonal)は前提条件であり、成り立たない場合は
 * RangeError を投げず null を返す。理由: 非直交な基底は「不正な入力」ではなく「この関数の
 * 適用範囲外の有効な基底」(せん断基底等)であり、MATH_CONVENTIONS §4 の退化ケースの扱いに
 * ならい、例外で処理を止めるのではなく安全なセンチネル値で表現する。非直交でも可逆な
 * 基底一般の座標を求めたい場合は solveCoordinates(クラメルの公式)を使う——それがこの
 * 単元の C-7 交差検証(直交専用の経路 vs 一般可逆基底の経路)の設計そのものである。
 *
 * basis 自体の有限性検証は transpose3/applyMatrix3(内部で multiplyMatrix3/線形代数の
 * 各関数が assertFinite する)に委譲する。
 */
export function coordinatesInBasis(basis: Matrix3x3, v: Vector3): Vector3 | null {
	if (!isOrthogonal(basis)) return null;
	return applyMatrix3(transpose3(basis), v);
}

// basis(行優先 Matrix3x3)の列 col を v に置き換えた行列を作る(クラメルの公式の分子)。
// basis の列 i は [basis[0][i], basis[1][i], basis[2][i]](行優先ストレージからの列取り出し、
// linearTransformation3d.ts の columnsOf と同じ考え方を逆向きに使う)。
function replaceColumn(basis: Matrix3x3, col: 0 | 1 | 2, v: Vector3): Matrix3x3 {
	const rows: [number, number, number][] = [
		[basis[0][0], basis[0][1], basis[0][2]],
		[basis[1][0], basis[1][1], basis[1][2]],
		[basis[2][0], basis[2][1], basis[2][2]],
	];
	rows[0][col] = v[0];
	rows[1][col] = v[1];
	rows[2][col] = v[2];
	return [rows[0], rows[1], rows[2]];
}

/**
 * 連立方程式 basis·x = v をクラメルの公式(行列式3つの比)で解く。
 * x_i = det(basis の列 i を v に置き換えた行列) / det(basis)。
 *
 * coordinatesInBasis(basisᵀ·v という行列ベクトル積の経路)とはまったく異なる導出
 * (行列式の比という経路)であり、正規直交性を前提としない一般の可逆基底でも成り立つ
 * ——直交基底上でのみ両者が一致することを不変条件テストで突合する(この単元の C-7 の要)。
 *
 * 基底が特異(可逆でない、det ≈ 0)な場合は一意な解が存在しないため、RangeError ではなく
 * null を返す(MATH_CONVENTIONS §4 の退化ケースの扱いにならう。coordinatesInBasis の
 * null 設計と対称)。
 */
export function solveCoordinates(basis: Matrix3x3, v: Vector3): Vector3 | null {
	const det = determinant3(basis);
	if (approximatelyZero(det, 1)) return null;
	const x0 = determinant3(replaceColumn(basis, 0, v)) / det;
	const x1 = determinant3(replaceColumn(basis, 1, v)) / det;
	const x2 = determinant3(replaceColumn(basis, 2, v)) / det;
	return [x0, x1, x2];
}

export type RotationAxis = 'x' | 'y' | 'z';

/**
 * 回転軸(UI のラジオ選択)から回転行列を作る単一の定義(ADR-005 §4「座標変換の単一定義」の
 * 精神: 「どの軸がどの関数か」という対応関係を Experiment と Scene の両方で別々に
 * 再定義させない)。z軸は linearTransformation3d.ts の rotationZMatrix をそのまま再利用する。
 */
export function rotationMatrixForAxis(axis: RotationAxis, thetaDegrees: number): Matrix3x3 {
	switch (axis) {
		case 'x':
			return rotationXMatrix(thetaDegrees);
		case 'y':
			return rotationYMatrix(thetaDegrees);
		case 'z':
			return rotationZMatrix(thetaDegrees);
	}
}
