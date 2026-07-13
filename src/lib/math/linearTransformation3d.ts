// 一次変換(3×3 行列による空間全体の変換)と行列式=体積拡大率の純粋 TypeScript モデル
// (AGENTS.md §5: React/Three.js を一切 import しない。ADR-005 §2: lib/math は Three.js の
// Matrix3/Vector3 を使わない——描画層でのみ Three の型へ変換する)。
//
// linearTransformation.ts(2×2、平面版)の同型拡張: 2×2 で学んだ「行列式=面積拡大率」が、
// 3×3 では「行列式=体積拡大率」に拡張される。この単元の中核体験は、単位立方体を行列 A で
// 変換した平行六面体の体積が常に |det A| 倍になること、そして det A の符号が空間の向き
// (右手系/左手系)の反転を表すことを発見することにある。
//
// C-7(自己確認的検証の禁止)に対応する設計: 行列式には代数的には同一の式へ簡約される
// 独立した2つの計算経路を実装する。
//   (1) determinant3        — 余因子展開(第1行に沿った展開)
//   (2) determinant3BySarrus — サラスの法則(対角線和)
// さらに「行列式=符号付き体積」という定理そのものを、行列式(成分の式)とスカラー三重積
// (幾何的な体積の定義: a·(b×c))という異なる経路で二重に検証する
// (signedVolumeOfParallelepiped は determinant3 を一切呼ばない独立実装)。

export type Vector3 = readonly [number, number, number];
// 行優先(row-major): m[i] が第 i 行 [m[i][0], m[i][1], m[i][2]]。
// 2×2 の Matrix2x2(linearTransformation.ts)と同じ行優先の規約を 3×3 に拡張する。
export type Matrix3x3 = readonly [
	readonly [number, number, number],
	readonly [number, number, number],
	readonly [number, number, number],
];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (linearTransformation.ts の assertFiniteMatrix / assertFinitePoint と同じ流儀)。
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

function assertFiniteVector3(v: Vector3, name: string): void {
	if (!v.every(Number.isFinite)) {
		throw new RangeError(`${name} must have finite components, got [${v[0]}, ${v[1]}, ${v[2]}]`);
	}
}

/**
 * 3×3 行列 A(行優先)とベクトル v の積 Av。
 * 2×2 の applyMatrix(linearTransformation.ts / eigen.ts)と同型の拡張。
 */
export function applyMatrix3(matrix: Matrix3x3, v: Vector3): Vector3 {
	assertFiniteMatrix3(matrix, 'matrix');
	assertFiniteVector3(v, 'v');
	const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
	const [x, y, z] = v;
	return [a * x + b * y + c * z, d * x + e * y + f * z, g * x + h * y + i * z];
}

/**
 * 3×3 行列の行列式(第1行に沿った余因子展開):
 * det A = a(ei − fh) − b(di − fg) + c(dh − eg)。
 *
 * この単元の核心: 2×2 では「行列式=面積拡大率」だったが、3×3 では
 * 「行列式=単位立方体を変換した平行六面体の体積拡大率」に拡張される
 * (符号は空間の向き=右手系/左手系が保たれるか反転するかを表す)。
 *
 * C-7 対応: この式(余因子展開)と determinant3BySarrus(サラスの法則、対角線和)は
 * 代数的には同一の多項式に簡約されるが、実装経路(項の組み立て順序)が異なるため、
 * どちらか一方だけの実装誤り(項の符号取り違え・行/列の混同等)をテストで検出できる。
 */
export function determinant3(matrix: Matrix3x3): number {
	assertFiniteMatrix3(matrix, 'matrix');
	const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
	return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * 3×3 行列の行列式(サラスの法則、対角線和):
 * det A = aei + bfg + cdh − ceg − bdi − afh。
 *
 * determinant3(余因子展開)とは異なる計算経路による同じ行列式の独立実装
 * (C-7: 自己確認的な検証を避けるための2つ目の経路。テストでのみ突合に使う)。
 */
export function determinant3BySarrus(matrix: Matrix3x3): number {
	assertFiniteMatrix3(matrix, 'matrix');
	const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
	return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h;
}

/**
 * 3×3 行列同士の積 M1·M2(行優先)。乗法性 det(AB) = det(A)·det(B) の不変条件テストで使う
 * (2×2 単元では検証専用のローカル関数 matMul をテストファイル内に閉じていたが、3×3 では
 * この単元の中核体験そのものと関わりが深い公開 API として lib/math に置く)。
 */
export function multiplyMatrix3(m1: Matrix3x3, m2: Matrix3x3): Matrix3x3 {
	assertFiniteMatrix3(m1, 'm1');
	assertFiniteMatrix3(m2, 'm2');
	const [[a11, a12, a13], [a21, a22, a23], [a31, a32, a33]] = m1;
	const [[b11, b12, b13], [b21, b22, b23], [b31, b32, b33]] = m2;
	return [
		[
			a11 * b11 + a12 * b21 + a13 * b31,
			a11 * b12 + a12 * b22 + a13 * b32,
			a11 * b13 + a12 * b23 + a13 * b33,
		],
		[
			a21 * b11 + a22 * b21 + a23 * b31,
			a21 * b12 + a22 * b22 + a23 * b32,
			a21 * b13 + a22 * b23 + a23 * b33,
		],
		[
			a31 * b11 + a32 * b21 + a33 * b31,
			a31 * b12 + a32 * b22 + a33 * b32,
			a31 * b13 + a32 * b23 + a33 * b33,
		],
	];
}

// 単位立方体の8頂点(標準基底、[0,1]³)。頂点の並びはインデックス i の下位3ビットを
// (x,y,z) に対応させる(i の bit0=x, bit1=y, bit2=z)——2進数表現で機械的に導出でき、
// 描画層(Scene)がワイヤーフレームの辺を組み立てる際にも同じ順序をそのまま再利用できる
// (ADR-005 §4 のレビュー観点「座標変換の単一定義」に対応: 頂点の対応関係を lib/math 側の
// 単一の定義に閉じ込め、描画層で頂点順序を独自に再定義させない)。
export const UNIT_CUBE_VERTICES: readonly Vector3[] = [
	[0, 0, 0],
	[1, 0, 0],
	[0, 1, 0],
	[1, 1, 0],
	[0, 0, 1],
	[1, 0, 1],
	[0, 1, 1],
	[1, 1, 1],
];

// 単位立方体の12辺(UNIT_CUBE_VERTICES のインデックス対)。描画層(Scene)がワイヤーフレーム/
// 平行六面体の辺を組み立てる際の唯一の参照元(上記コメントと同じ理由)。
export const UNIT_CUBE_EDGES: readonly (readonly [number, number])[] = [
	[0, 1],
	[0, 2],
	[0, 4],
	[1, 3],
	[1, 5],
	[2, 3],
	[2, 6],
	[3, 7],
	[4, 5],
	[4, 6],
	[5, 7],
	[6, 7],
];

/**
 * 単位立方体の8頂点(UNIT_CUBE_VERTICES)を行列 A で変換した像(平行六面体の頂点)。
 * 順序は UNIT_CUBE_VERTICES と対応する(描画層が元の立方体との対応を保てるようにするため)。
 */
export function transformUnitCube(matrix: Matrix3x3): readonly Vector3[] {
	assertFiniteMatrix3(matrix, 'matrix');
	return UNIT_CUBE_VERTICES.map((v) => applyMatrix3(matrix, v));
}

/**
 * 3つのベクトル a, b, c が張る平行六面体の符号つき体積(スカラー三重積 a·(b×c))。
 *
 * この単元の C-7 の要: determinant3(行列式、成分の式)とはまったく異なる計算経路
 * (外積→内積という幾何的な定義)で「符号つき体積」を計算する。行列 A の3つの列ベクトルを
 * a, b, c として渡すと、signedVolumeOfParallelepiped(a, b, c) === determinant3(A) が
 * 常に成り立つ——これが「行列式=符号付き体積」という定理そのものであり、2つの独立実装の
 * 一致によって検証する(自己確認的な検証ではない: この関数は determinant3 を一切呼ばない)。
 *
 * 退化(3ベクトルが同一平面上に乗る、体積0)は不正値ではなく有効な退化例であり、
 * 例外を投げず0を返す(MATH_CONVENTIONS §4、linearTransformation.ts の signedPolygonArea と
 * 同じ方針)。
 */
export function signedVolumeOfParallelepiped(a: Vector3, b: Vector3, c: Vector3): number {
	assertFiniteVector3(a, 'a');
	assertFiniteVector3(b, 'b');
	assertFiniteVector3(c, 'c');
	// b × c (外積)
	const crossX = b[1] * c[2] - b[2] * c[1];
	const crossY = b[2] * c[0] - b[0] * c[2];
	const crossZ = b[0] * c[1] - b[1] * c[0];
	// a · (b × c) (内積)
	return a[0] * crossX + a[1] * crossY + a[2] * crossZ;
}

/**
 * 行列 matrix の3つの列ベクトル(行優先の格納から列を取り出す)。
 * signedVolumeOfParallelepiped(...columnsOf(matrix)) === determinant3(matrix) という
 * 「行列式=符号付き体積」の定理を、実験UI・不変条件テストの両方から同じ取り出し方で
 * 呼び出せるようにする補助(行列そのものの計算ではなく、成分の並べ替えのみを行う)。
 */
export function columnsOf(matrix: Matrix3x3): readonly [Vector3, Vector3, Vector3] {
	assertFiniteMatrix3(matrix, 'matrix');
	const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
	return [
		[a, d, g],
		[b, e, h],
		[c, f, i],
	];
}

export type PresetKey3d = 'identity' | 'diagonal' | 'rotationZ45' | 'reflectionX' | 'degenerate' | 'shear';

const COS_45 = Math.cos(Math.PI / 4);
const SIN_45 = Math.sin(Math.PI / 4);

// 既知例プリセット(手計算で golden 固定、C-7 の非自己確認テストと対応する具体例):
//   identity    : det = 1×1×1 = 1(変換なし)
//   diagonal    : det = 2×1×0.5 = 1(形は大きく変わるが体積は保存される——回転と対比させる例)
//   rotationZ45 : det = cos²45°+sin²45° = 1(回転は角度によらず常に体積を保つ)
//   reflectionX : det = (−1)×1×1 = −1(体積比は1のまま、向きだけが反転=鏡映)
//   degenerate  : det = 1×1×0 = 0(ランク2、z成分が常に0になり空間がxy平面に潰れる)
//   shear       : det = 1×1×1 = 1(せん断は形を歪めるが体積を保つ)
export const LINEAR_TRANSFORM_3D_PRESETS: Record<PresetKey3d, { label: string; matrix: Matrix3x3 }> = {
	identity: {
		label: '恒等行列(変換なし)',
		matrix: [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		],
	},
	diagonal: {
		label: '対角行列 diag(2, 1, 0.5)',
		matrix: [
			[2, 0, 0],
			[0, 1, 0],
			[0, 0, 0.5],
		],
	},
	rotationZ45: {
		label: 'z軸まわり45°回転',
		matrix: [
			[COS_45, -SIN_45, 0],
			[SIN_45, COS_45, 0],
			[0, 0, 1],
		],
	},
	reflectionX: {
		label: '鏡映(x軸方向に反転)',
		matrix: [
			[-1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		],
	},
	degenerate: {
		label: '退化(ランク2、xy平面へ押し潰す)',
		matrix: [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 0],
		],
	},
	shear: {
		label: 'せん断(z の大きさに応じて x をずらす)',
		matrix: [
			[1, 0, 1],
			[0, 1, 0],
			[0, 0, 1],
		],
	},
};
