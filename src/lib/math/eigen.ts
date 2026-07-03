import { approximatelyZero } from './compare.js';

// 2x2 行列と固有ベクトルの純粋数学モデル (AGENTS.md §5, docs/DESIGN.md §API/インターフェース境界)。
// React/Mafs 等の描画ライブラリを一切 import しない。
//
// 過去の実装事故(AGENTS.md §7): 要件定義の初稿で「単位行列・回転行列を特異行列と誤分類」した
// 実例がある。単位行列・回転行列はどちらも正則(行列式 ≠ 0、逆行列を持つ)であり、
// 「特異行列」という分類軸とは独立である。「実固有ベクトルを持たない(回転行列)」ことと
// 「特異である(行列式が 0)」ことを混同しないよう、本モジュールでは
// classifyEigenSystem が特異性の判定を一切行わない設計にしている。

export type Vector2 = readonly [number, number];
export type Matrix2x2 = readonly [readonly [number, number], readonly [number, number]];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (lib/math/pythagoras.ts の assertFinitePoint と同じ流儀)。
function assertFiniteVector(v: Vector2, name: string): void {
	if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
		throw new RangeError(`${name} must have finite components, got [${v[0]}, ${v[1]}]`);
	}
}

function assertFiniteMatrix(matrix: Matrix2x2, name: string): void {
	const [[a, b], [c, d]] = matrix;
	if (![a, b, c, d].every(Number.isFinite)) {
		throw new RangeError(`${name} must have finite entries, got [[${a}, ${b}], [${c}, ${d}]]`);
	}
}

function assertFiniteScalar(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/** 行列の作用: A v */
export function applyMatrix(matrix: Matrix2x2, v: Vector2): Vector2 {
	assertFiniteMatrix(matrix, 'matrix');
	assertFiniteVector(v, 'v');
	const [[a, b], [c, d]] = matrix;
	return [a * v[0] + b * v[1], c * v[0] + d * v[1]];
}

/** 2 次元ベクトルの内積 */
export function dotProduct2(v: Vector2, w: Vector2): number {
	assertFiniteVector(v, 'v');
	assertFiniteVector(w, 'w');
	return v[0] * w[0] + v[1] * w[1];
}

/** 2 次元ベクトルの外積(スカラー、符号付き面積)。0 なら平行。 */
export function crossProduct2(v: Vector2, w: Vector2): number {
	assertFiniteVector(v, 'v');
	assertFiniteVector(w, 'w');
	return v[0] * w[1] - v[1] * w[0];
}

/** 角度(ラジアン)から単位円上の単位ベクトルを作る (MATH_CONVENTIONS §5: 角度の内部単位はラジアン) */
export function unitVectorFromAngle(angleRadians: number): Vector2 {
	assertFiniteScalar(angleRadians, 'angleRadians');
	return [Math.cos(angleRadians), Math.sin(angleRadians)];
}

/**
 * v と w が(同じ向きまたは正反対の向きに)平行かどうかをスケール相対誤差で判定する。
 * 外積 v×w は |v||w| と同じ次元(長さの2乗)を持つため、scale には |v||w| を用いる
 * (MATH_CONVENTIONS §2 のスケール相対誤差と次元を一致させる)。
 * どちらかがゼロベクトルの場合は退化的に平行とみなす(外積が常に0のため)。
 */
export function isParallel(v: Vector2, w: Vector2): boolean {
	const cross = crossProduct2(v, w);
	const normV = Math.hypot(v[0], v[1]);
	const normW = Math.hypot(w[0], w[1]);
	return approximatelyZero(cross, normV * normW);
}

/**
 * 固有値 λ・固有ベクトル v の候補が Av = λv をどれだけ満たすかの残差(丸めない)。
 * Av − λv の 2 乗ノルムを返す(pythagoreanResidual と同様、点から作った式へ戻すだけの
 * 自己確認にならないよう、行列の作用という独立した計算経路で検証できる形にしてある)。
 */
export function eigenResidual(matrix: Matrix2x2, eigenvalue: number, eigenvector: Vector2): number {
	assertFiniteMatrix(matrix, 'matrix');
	assertFiniteScalar(eigenvalue, 'eigenvalue');
	assertFiniteVector(eigenvector, 'eigenvector');
	const image = applyMatrix(matrix, eigenvector);
	const dx = image[0] - eigenvalue * eigenvector[0];
	const dy = image[1] - eigenvalue * eigenvector[1];
	return dx * dx + dy * dy;
}

function normalize(v: Vector2): Vector2 {
	const norm = Math.hypot(v[0], v[1]);
	return norm === 0 ? v : [v[0] / norm, v[1] / norm];
}

// 実固有値 lambda に対応する固有ベクトルを (A - λI)v = 0 を解いて求める。
// b が無視できないなら 1 行目 (a-λ)x + by = 0 から v=(b, λ-a) が解。
// b が無視できて c が無視できないなら 2 行目から v=(λ-d, c) が解。
// 両方無視できる(対角行列)場合は、λ が a に近ければ (1,0)、d に近ければ (0,1)。
// entryScale は行列成分と同じ次元(長さ1乗)のスケールを渡す。
function eigenvectorFor(matrix: Matrix2x2, lambda: number, entryScale: number): Vector2 {
	const [[a, b], [c, d]] = matrix;
	if (!approximatelyZero(b, entryScale)) {
		return normalize([b, lambda - a]);
	}
	if (!approximatelyZero(c, entryScale)) {
		return normalize([lambda - d, c]);
	}
	return approximatelyZero(lambda - a, entryScale) ? [1, 0] : [0, 1];
}

export interface EigenSystemResult {
	/** tr(A) = a + d */
	readonly trace: number;
	/** det(A) = ad - bc */
	readonly determinant: number;
	/** 特性方程式 λ² − tr·λ + det = 0 の判別式 */
	readonly discriminant: number;
	/**
	 * 実固有値。要素数は分類によって変わる:
	 * 2 (相異なる実固有値) / 1 (重解) / 0 (複素共役、実固有値なし)。
	 */
	readonly realEigenvalues: readonly number[];
	/**
	 * 実固有値に対応する代表的な固有ベクトル(単位ベクトル)。
	 * 相異なる実固有値なら realEigenvalues と同じ順序で 2 本。
	 * 重解で固有空間が平面全体(スカラー行列)なら基底 2 本 (1,0),(0,1)。
	 * 重解で固有空間が 1 次元(Jordan 型)なら 1 本。
	 * 複素共役なら 0 本。
	 */
	readonly eigenvectors: readonly Vector2[];
	/** 複素共役固有値のとき、その一方 (実部, 虚部>0 側) を保持する。実固有値がある場合は null。 */
	readonly complexEigenvalue: { readonly re: number; readonly im: number } | null;
}

/**
 * 2x2 行列の固有系を計算する(数学的結果。丸めない)。
 * docs/DESIGN.md §API/インターフェース境界 の 3 分割の第 1 段。
 */
export function computeEigenSystem(matrix: Matrix2x2): EigenSystemResult {
	assertFiniteMatrix(matrix, 'matrix');
	const [[a, b], [c, d]] = matrix;
	const trace = a + d;
	const determinant = a * d - b * c;
	const discriminant = trace * trace - 4 * determinant;
	// discriminant は tr²・det と同じ次元(長さの2乗)。両項の大きさの和をスケールにする。
	const discriminantScale = trace * trace + 4 * Math.abs(determinant);
	// 行列成分の比較(b≈0 等)には行列成分と同じ次元(長さ1乗)のスケールを使う。
	const entryScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));

	if (discriminant < 0 && !approximatelyZero(discriminant, discriminantScale)) {
		return {
			trace,
			determinant,
			discriminant,
			realEigenvalues: [],
			eigenvectors: [],
			complexEigenvalue: { re: trace / 2, im: Math.sqrt(-discriminant) / 2 },
		};
	}

	if (approximatelyZero(discriminant, discriminantScale)) {
		const lambda = trace / 2;
		const isScalarMatrix =
			approximatelyZero(b, entryScale) &&
			approximatelyZero(c, entryScale) &&
			approximatelyZero(a - lambda, entryScale) &&
			approximatelyZero(d - lambda, entryScale);
		if (isScalarMatrix) {
			return {
				trace,
				determinant,
				discriminant,
				realEigenvalues: [lambda],
				eigenvectors: [
					[1, 0],
					[0, 1],
				],
				complexEigenvalue: null,
			};
		}
		return {
			trace,
			determinant,
			discriminant,
			realEigenvalues: [lambda],
			eigenvectors: [eigenvectorFor(matrix, lambda, entryScale)],
			complexEigenvalue: null,
		};
	}

	const sqrtDiscriminant = Math.sqrt(discriminant);
	const lambda1 = (trace - sqrtDiscriminant) / 2;
	const lambda2 = (trace + sqrtDiscriminant) / 2;
	return {
		trace,
		determinant,
		discriminant,
		realEigenvalues: [lambda1, lambda2],
		eigenvectors: [
			eigenvectorFor(matrix, lambda1, entryScale),
			eigenvectorFor(matrix, lambda2, entryScale),
		],
		complexEigenvalue: null,
	};
}

/**
 * 教材上の固有系の状態分類(4 状態)。docs/DESIGN.md §API/インターフェース境界 の 3 分割の第 2 段。
 * computeEigenSystem の結果の「形」だけで分類し、再計算はしない
 * (MATH_CONVENTIONS §10: 数学的真実の計算と教材上の分類を混在させない)。
 * 「特異行列」という軸は使わない(AGENTS.md §7 の過去の誤分類事故を踏まえた設計判断)。
 */
export type EigenClassification =
	| 'distinct-real' // 相異なる実固有値
	| 'repeated-full' // 重解・固有空間が平面全体(2次元、スカラー行列)
	| 'repeated-defective' // 重解・固有空間が1次元(Jordan型)
	| 'complex-conjugate'; // 複素共役固有値(実固有ベクトルなし)

export function classifyEigenSystem(result: EigenSystemResult): EigenClassification {
	if (result.complexEigenvalue !== null) return 'complex-conjugate';
	if (result.realEigenvalues.length === 2) return 'distinct-real';
	return result.eigenvectors.length >= 2 ? 'repeated-full' : 'repeated-defective';
}

// MATH_CONVENTIONS.md §7: -0 は表示直前で 0 に正規化する。符号反転で -0 が生まれうるのは
// この関数がまさに「表示上の便宜」を扱う箇所のため、ここで正規化する。
function normalizeZero(value: number): number {
	return Object.is(value, -0) ? 0 : value;
}

/**
 * 表示上の符号連続性のみを扱う(前フレームとの内積が負なら符号反転)。
 * docs/DESIGN.md §API/インターフェース境界 の 3 分割の第 3 段。
 * computeEigenSystem の数学的結果を変更しない、表示専用の便宜関数。
 */
export function stabilizeEigenvectorDirection(current: Vector2, previous: Vector2): Vector2 {
	assertFiniteVector(current, 'current');
	assertFiniteVector(previous, 'previous');
	const dot = current[0] * previous[0] + current[1] * previous[1];
	if (dot < 0) {
		return [normalizeZero(-current[0]), normalizeZero(-current[1])];
	}
	return current;
}
