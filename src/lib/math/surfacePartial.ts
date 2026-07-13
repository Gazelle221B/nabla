import { approximatelyZero } from './compare.js';

// 2変数関数 z=f(x,y) の曲面・偏微分・方向微分の純粋 TypeScript モデル
// (AGENTS.md §5: React/Three.js を一切 import しない)。
//
// 中核の数学的発見: 1変数の微分係数(1つの数)と違い、2変数関数では「進む向きによって傾きが
// 違う」——同じ点でも x 方向に進むか y 方向に進むかで傾き(偏微分)が異なり、一般の向き θ
// への傾き(方向微分)は勾配ベクトル (∂f/∂x, ∂f/∂y) との内積で決まる。
//
// derivative.ts / derivativeFunction.ts (1変数、calculus/derivative-function の前例) と同じ
// 思想: 「任意の関数を扱える」DSL を先行設計せず (rule of three)、4つのプリセット関数
// (paraboloid/saddle/ridge/plane) に限定した閉じた表現とする。各プリセットの解析的な偏導関数は
// 教科書的な式をそのままコード化した「数学的真実」であり (derivative.ts の
// DifferentiableFunction.derivative と同じ位置づけ)、中心差分による数値微分
// (numericalPartialX/Y) はこれとは完全に独立な経路として、C-7 の交差検証に使う。

export type SurfaceFnId = 'paraboloid' | 'saddle' | 'ridge' | 'plane';

interface SurfaceDefinition {
	readonly label: string;
	readonly formula: string;
	readonly evaluate: (x: number, y: number) => number;
	// 解析解(閉形式)。教科書的な偏微分の規則をそのままコード化したもの。
	readonly partialX: (x: number, y: number) => number;
	readonly partialY: (x: number, y: number) => number;
}

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (derivative.ts の assertFiniteNumber と同じ流儀。lib/math 内の各モジュールがそれぞれ
// 独立にこの極小ヘルパーを持つ既存の慣習に従う)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

// f=x²+y²(放物面): ∂f/∂x=2x, ∂f/∂y=2y。どちらの方向にも対称に登る「お椀」型の曲面。
// f=x²−y²(鞍点面/双曲放物面): ∂f/∂x=2x, ∂f/∂y=−2y。x方向とy方向で符号が逆——
//   「よくある誤解」の反証(同じ点でも向きで正負すら変わる)の中核例。
// f=x²(尾根面): ∂f/∂x=2x, ∂f/∂y=0——yにまったく依存しないため、y方向の偏微分は
//   恒等的に0(近似ではなく厳密な0)。
// f=x+2y(平面): ∂f/∂x=1, ∂f/∂y=2(定数、(x,y)によらない)。方向微分がθで単純に
//   変化する様子を確認するのに向く。
const SURFACE_DEFINITIONS: Record<SurfaceFnId, SurfaceDefinition> = {
	paraboloid: {
		label: '放物面',
		formula: 'f(x, y) = x² + y²',
		evaluate: (x, y) => x * x + y * y,
		partialX: (x) => 2 * x,
		partialY: (_x, y) => 2 * y,
	},
	saddle: {
		label: '鞍点面(双曲放物面)',
		formula: 'f(x, y) = x² − y²',
		evaluate: (x, y) => x * x - y * y,
		partialX: (x) => 2 * x,
		partialY: (_x, y) => -2 * y,
	},
	ridge: {
		label: '尾根面(yに依存しない)',
		formula: 'f(x, y) = x²',
		evaluate: (x) => x * x,
		partialX: (x) => 2 * x,
		partialY: () => 0,
	},
	plane: {
		label: '平面',
		formula: 'f(x, y) = x + 2y',
		evaluate: (x, y) => x + 2 * y,
		partialX: () => 1,
		partialY: () => 2,
	},
};

/** UI のプリセット選択・記事の説明文で使う一覧(SURFACE_DEFINITIONS から関数本体を除いた表示用メタデータ)。 */
export interface SurfacePreset {
	readonly id: SurfaceFnId;
	readonly label: string;
	readonly formula: string;
}

export const SURFACE_PRESETS: readonly SurfacePreset[] = (
	Object.keys(SURFACE_DEFINITIONS) as SurfaceFnId[]
).map((id) => ({
	id,
	label: SURFACE_DEFINITIONS[id].label,
	formula: SURFACE_DEFINITIONS[id].formula,
}));

function definitionOf(fnId: SurfaceFnId): SurfaceDefinition {
	const def = SURFACE_DEFINITIONS[fnId];
	if (!def) {
		throw new RangeError(`unknown surface fnId: ${JSON.stringify(fnId)}`);
	}
	return def;
}

/** 曲面の高さ z = f(x, y)。 */
export function evaluateSurface(fnId: SurfaceFnId, x: number, y: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(y, 'y');
	const z = definitionOf(fnId).evaluate(x, y);
	assertFiniteNumber(z, `evaluateSurface(${fnId}, x, y)`);
	return z;
}

/** ∂f/∂x の解析解(閉形式)。 */
export function partialX(fnId: SurfaceFnId, x: number, y: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(y, 'y');
	const v = definitionOf(fnId).partialX(x, y);
	assertFiniteNumber(v, `partialX(${fnId}, x, y)`);
	return v;
}

/** ∂f/∂y の解析解(閉形式)。 */
export function partialY(fnId: SurfaceFnId, x: number, y: number): number {
	assertFiniteNumber(x, 'x');
	assertFiniteNumber(y, 'y');
	const v = definitionOf(fnId).partialY(x, y);
	assertFiniteNumber(v, `partialY(${fnId}, x, y)`);
	return v;
}

// ---------------------------------------------------------------------------
// C-7 交差検証: 中心差分(解析解とは完全に別経路)による数値偏微分。
//
// 中心差分の理論誤差(標準的な数値解析の結果、テイラーの剰余項——ラグランジュの剰余を
// 使う形): 1変数関数 g を x で固定した断面とすると、
//   g(x+h) = g(x) + h g'(x) + (h²/2) g''(x) + (h³/6) g'''(ξ₊)   (ξ₊ は x と x+h の間のある点)
//   g(x-h) = g(x) - h g'(x) + (h²/2) g''(x) - (h³/6) g'''(ξ₋)   (ξ₋ は x-h と x の間のある点)
// を辺々引いて 2h で割ると
//   (g(x+h) - g(x-h)) / (2h) = g'(x) + (h²/12)(g'''(ξ₊) + g'''(ξ₋))
// となり、誤差は |h²/6 · max|g'''|| で抑えられる(中心差分は2次精度: 誤差 = C·h², C = max|g'''|/6)。
//
// この単元の4プリセットは、x を固定して y の1変数関数と見ても、y を固定して x の1変数関数と
// 見ても、すべて「高々2次の多項式」である:
//   - paraboloid: x方向の断面 x²+y₀²(定数) → 2次。y方向の断面 x₀²+y²(定数) → 2次。
//   - saddle:     同様にどちらの断面も2次(符号が違うだけ)。
//   - ridge:      x方向の断面は x²(2次)。y方向の断面は x₀²(定数、0次)。
//   - plane:      x+2y はどちらの断面も1次。
// 2次以下の多項式の3階導関数は恒等的に0(3階微分で消える)。したがって上記の誤差上界
// C = max|g'''|/6 は、この4関数×2方向のすべての組み合わせで厳密に C = 0 となる——
// 中心差分は h→0 の近似ではなく、任意の有限な h に対して解析解と理論上「厳密に」一致する
// (実際に計算機で観測される差は、この理論誤差 0 ではなく浮動小数点の丸め誤差のみに由来する)。
// このためテスト(surfacePartial.test.ts)では h を極端に小さくせず(丸め誤差の増幅を避ける)、
// 0.01〜2 程度の範囲で C=0 の一致を確認する。
// ---------------------------------------------------------------------------

function assertValidStep(h: number): void {
	assertFiniteNumber(h, 'h');
	if (approximatelyZero(h, 1)) {
		throw new RangeError(`h must be non-zero (got h=${h})`);
	}
}

/** 中心差分による ∂f/∂x の数値近似: (f(x+h,y) − f(x−h,y)) / (2h)。解析解とは独立な経路。 */
export function numericalPartialX(fnId: SurfaceFnId, x: number, y: number, h: number): number {
	assertValidStep(h);
	const zPlus = evaluateSurface(fnId, x + h, y);
	const zMinus = evaluateSurface(fnId, x - h, y);
	const result = (zPlus - zMinus) / (2 * h);
	assertFiniteNumber(result, `numericalPartialX(${fnId}, x, y, h)`);
	return result;
}

/** 中心差分による ∂f/∂y の数値近似: (f(x,y+h) − f(x,y−h)) / (2h)。解析解とは独立な経路。 */
export function numericalPartialY(fnId: SurfaceFnId, x: number, y: number, h: number): number {
	assertValidStep(h);
	const zPlus = evaluateSurface(fnId, x, y + h);
	const zMinus = evaluateSurface(fnId, x, y - h);
	const result = (zPlus - zMinus) / (2 * h);
	assertFiniteNumber(result, `numericalPartialY(${fnId}, x, y, h)`);
	return result;
}

/**
 * 方向微分 D_θf(x,y) = ∂f/∂x·cosθ + ∂f/∂y·sinθ(勾配ベクトルと単位方向ベクトルの内積)。
 * θ=0(x軸正方向)で partialX に、θ=90(y軸正方向)で partialY に一致する
 * (θ=90 は cos90 が浮動小数点で厳密な0にならないため、呼び出し側は approximatelyZero で
 * 突き合わせる——本モジュールは exact 一致を主張しない)。
 */
export function directionalDerivative(
	fnId: SurfaceFnId,
	x: number,
	y: number,
	thetaDeg: number,
): number {
	assertFiniteNumber(thetaDeg, 'thetaDeg');
	const theta = (thetaDeg * Math.PI) / 180;
	const gx = partialX(fnId, x, y);
	const gy = partialY(fnId, x, y);
	const result = gx * Math.cos(theta) + gy * Math.sin(theta);
	assertFiniteNumber(result, `directionalDerivative(${fnId}, x, y, thetaDeg)`);
	return result;
}

/** 勾配ベクトルの大きさ |∇f| = √((∂f/∂x)² + (∂f/∂y)²)。方向微分が取りうる最大値。 */
export function gradientMagnitude(fnId: SurfaceFnId, x: number, y: number): number {
	const gx = partialX(fnId, x, y);
	const gy = partialY(fnId, x, y);
	return Math.hypot(gx, gy);
}

/**
 * 方向微分が最大になる向き(勾配方向、度数、[0,360) に正規化)。勾配ベクトルが
 * (実質的に)ゼロベクトルの場合は向きが定義されないため、慣習として 0 を返す
 * (MATH_CONVENTIONS §4: ゼロ長辺相当の退化ケースは例外にせず有効な既定値を返す)。
 */
export function gradientDirectionDeg(fnId: SurfaceFnId, x: number, y: number): number {
	const gx = partialX(fnId, x, y);
	const gy = partialY(fnId, x, y);
	if (approximatelyZero(gx, 1) && approximatelyZero(gy, 1)) {
		return 0;
	}
	const deg = (Math.atan2(gy, gx) * 180) / Math.PI;
	return deg < 0 ? deg + 360 : deg;
}
