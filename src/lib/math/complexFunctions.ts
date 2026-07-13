import { approximatelyZero } from './compare.js';

// 複素関数のドメインカラーリング(w=f(z) を「偏角=色相・絶対値=明るさ」で塗って見る)の
// 純粋 TypeScript モデル(AGENTS.md §5: React/Three.js を一切 import しない)。
//
// この単元の中核体験: 「複素関数は4次元が必要だからグラフに描けない」という誤解に対し、
// 色を使えば2次元の平面上に w=f(z) の全情報の要点(偏角・絶対値)を同時に見せられることを
// 示す。とりわけ、零点のまわりでは色相(偏角)が**重複度の回数だけ**一周し、極のまわりでは
// **逆回り**に一周する——この「色の渦の巻き数」という目に見える整数が、代数的な重複度と
// 一致するという発見がこの単元の核。
//
// 複素数は座標ペア [re, im] として扱う(mandelbrot.ts の zx, zy 前例と同じ思想。複素数の
// 専用型を持ち込まず、実部・虚部のタプルで演算する。MATH_CONVENTIONS §6: タプル型 +
// readonly をこのモジュールの型表現の既定とする)。

export type Complex = readonly [number, number];

function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

function assertFiniteComplex(z: Complex, name: string): void {
	assertFiniteNumber(z[0], `${name}[0] (re)`);
	assertFiniteNumber(z[1], `${name}[1] (im)`);
}

function assertPositiveNumber(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (value <= 0) {
		throw new RangeError(`${name} must be positive, got ${value}`);
	}
}

function assertPositiveInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive integer, got ${value}`);
	}
}

// ---------------------------------------------------------------------------
// 複素数の四則演算
// ---------------------------------------------------------------------------

/** (a+bi) + (c+di) = (a+c) + (b+d)i */
export function cAdd(a: Complex, b: Complex): Complex {
	assertFiniteComplex(a, 'a');
	assertFiniteComplex(b, 'b');
	return [a[0] + b[0], a[1] + b[1]];
}

/** (a+bi) − (c+di) = (a−c) + (b−d)i */
export function cSub(a: Complex, b: Complex): Complex {
	assertFiniteComplex(a, 'a');
	assertFiniteComplex(b, 'b');
	return [a[0] - b[0], a[1] - b[1]];
}

/** (a+bi)(c+di) = (ac−bd) + (ad+bc)i */
export function cMul(a: Complex, b: Complex): Complex {
	assertFiniteComplex(a, 'a');
	assertFiniteComplex(b, 'b');
	return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

/**
 * (a+bi)/(c+di) = (a+bi)(c−di) / (c²+d²)。
 *
 * **設計判断(分母≈0でnullを返す理由)**: 分母 b の絶対値が実質的にゼロ
 * (`approximatelyZero(|b|², 1)`——scale を固定の 1 にしているのは意図的: 極の判定は
 * 「分母が数として実質ゼロか」という絶対的な問いであり、分子のスケールに相対化すると
 * 「大きな数を小さな数で割る」正当なケースまで極扱いになるため。QA 指摘への回答)のときは、
 * 例外を投げて計算を止めるのではなく、明示的なセンチネル値 `null` を返す
 * (MATH_CONVENTIONS §3/§4: ゼロ除算になりうる箇所は事前に判定し専用の分岐を
 * 用意する——derivative.ts の垂直接線判定と同じ流儀。ゼロ長・退化ケースは
 * 「不正値」ではなく「退化例」として明示的にハンドリングする)。
 * これは「1/z の z=0」「(z−1)/(z+1) の z=−1」のような**極**を表現するための
 * 意図的な設計であり、呼び出し側(evaluateComplex・Scene・Experiment)は
 * `null` を「この点で関数は定義されない(極)」として扱う。代わりに非常に
 * 大きい有限値へクランプする実装にしなかったのは、そうすると「極」という
 * 数学的に意味のある事実がただの巨大な数へ埋もれてしまい、観察表で
 * 「未定義」と明示できなくなるため(教材としての可読性を優先した設計判断)。
 */
export function cDiv(a: Complex, b: Complex): Complex | null {
	assertFiniteComplex(a, 'a');
	assertFiniteComplex(b, 'b');
	const denom = b[0] * b[0] + b[1] * b[1];
	if (approximatelyZero(Math.sqrt(denom), 1)) {
		return null;
	}
	return [(a[0] * b[0] + a[1] * b[1]) / denom, (a[1] * b[0] - a[0] * b[1]) / denom];
}

/** 偏角 arg(w)(度、atan2 により [−180, 180](Math.atan2 の標準値域。−0 虚部の負実軸で −180 になりうる) の範囲で返す)。 */
export function argDeg(w: Complex): number {
	assertFiniteComplex(w, 'w');
	return (Math.atan2(w[1], w[0]) * 180) / Math.PI;
}

/** 絶対値 |w| = √(re² + im²)。 */
export function modulus(w: Complex): number {
	assertFiniteComplex(w, 'w');
	return Math.hypot(w[0], w[1]);
}

// ---------------------------------------------------------------------------
// プリセット関数
// ---------------------------------------------------------------------------

export type ComplexFnId = 'square' | 'cubeMinusOne' | 'reciprocal' | 'mobius';

export interface ComplexPreset {
	readonly id: ComplexFnId;
	readonly label: string;
	readonly formula: string;
}

/** UI のプリセット選択・記事の説明文で使う一覧(surfacePartial.ts の SURFACE_PRESETS と同じ位置づけ)。 */
export const COMPLEX_PRESETS: readonly ComplexPreset[] = [
	{ id: 'square', label: '2乗', formula: 'f(z) = z²' },
	{ id: 'cubeMinusOne', label: '3乗引く1', formula: 'f(z) = z³ − 1' },
	{ id: 'reciprocal', label: '逆数', formula: 'f(z) = 1/z' },
	{ id: 'mobius', label: '1次分数変換(メビウス変換)', formula: 'f(z) = (z − 1)/(z + 1)' },
];

const ONE: Complex = [1, 0];

/**
 * プリセット関数 f(z) の評価。cDiv が `null`(その点は極で定義されない)を返した場合は
 * そのまま伝播する——evaluateComplex 自体も「この点で f は定義されない」ことを
 * `null` で表現する(reciprocal の z=0、mobius の z=−1)。
 *
 * **GLSL との二重実装の注意(非対称性)**: `DomainColoringScene.tsx` のフラグメント
 * シェーダーは、この4式を GLSL でも独立に再実装している(ピクセルごとの計算を
 * CPU↔GPU 間で毎フレーム転送するのは非現実的なため)。つまり同じ数式が TS/GLSL の
 * 2箇所に存在する——意図的に共有しない非対称設計であり、**この TS 側
 * (evaluateComplex)が数学的検証の真実(windingNumberAround・観察表の実値・単体テスト
 * が拠り所にする経路)、GLSL 側は表示専用**という役割分担を明記する。二重実装が
 * ズレていないかは、E2E でシェーダー描画のプローブ点の色相と、この関数で計算した
 * 偏角の対応を1点検証することで検出する(smoke.spec.ts 参照)。
 */
export function evaluateComplex(fnId: ComplexFnId, z: Complex): Complex | null {
	assertFiniteComplex(z, 'z');
	switch (fnId) {
		case 'square':
			return cMul(z, z);
		case 'cubeMinusOne':
			return cSub(cMul(cMul(z, z), z), ONE);
		case 'reciprocal':
			return cDiv(ONE, z);
		case 'mobius':
			return cDiv(cSub(z, ONE), cAdd(z, ONE));
		default: {
			const exhaustive: never = fnId;
			throw new RangeError(`unknown complex fnId: ${JSON.stringify(exhaustive)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// C-7 交差検証: 巻き数(winding number)
// ---------------------------------------------------------------------------

export type SingularityKind = 'zero' | 'pole';

export interface ComplexSingularity {
	readonly point: Complex;
	readonly kind: SingularityKind;
	/** 零点の重複度、または極の位数(いずれも正の整数)。 */
	readonly order: number;
}

const SQRT3_OVER_2 = Math.sqrt(3) / 2;

/**
 * 独立オラクル(C-7): 各プリセットの零点・極の位置と重複度/位数(**手計算・再検算済み**、
 * windingNumberAround(数値積分による経路)とは完全に別の経路——複素解析の閉形式の知識
 * (偏角の原理、証明はこの単元の範囲外)をハードコードした定数であり、evaluateComplex を
 * 一切呼び出さない)。
 *
 * - **square**: f=z² は z=0 に**重複度2**の零点を持つ(z²=0 の重根、z² を微分すると
 *   2z で z=0 でも0になる=単純ではない)。
 * - **cubeMinusOne**: f=z³−1 の零点は1の3乗根 1, ω=(−1/2, √3/2), ω²=(−1/2, −√3/2)——
 *   z³−1=(z−1)(z−ω)(z−ω²) と相異なる1次式3つの積に因数分解できるため、いずれも
 *   **重複度1**(単純零点)。[手計算での確認: ω³=(e^{i2π/3})³=e^{i2π}=1 より ω³−1=0。
 *   同様に (ω²)³=e^{i4π}=1。]
 * - **reciprocal**: f=1/z は z=0 に**位数1の極**(単純極)を持つ。
 * - **mobius**: f=(z−1)/(z+1) は分子・分母がともに1次式で共通因子を持たない(z=1 と
 *   z=−1 は異なる点)ため約分は起きず、z=1 に重複度1の零点、z=−1 に位数1の極を持つ。
 */
export const COMPLEX_FN_SINGULARITIES: Record<ComplexFnId, readonly ComplexSingularity[]> = {
	square: [{ point: [0, 0], kind: 'zero', order: 2 }],
	cubeMinusOne: [
		{ point: [1, 0], kind: 'zero', order: 1 },
		{ point: [-0.5, SQRT3_OVER_2], kind: 'zero', order: 1 },
		{ point: [-0.5, -SQRT3_OVER_2], kind: 'zero', order: 1 },
	],
	reciprocal: [{ point: [0, 0], kind: 'pole', order: 1 }],
	mobius: [
		{ point: [1, 0], kind: 'zero', order: 1 },
		{ point: [-1, 0], kind: 'pole', order: 1 },
	],
};

function distance(a: Complex, b: Complex): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * 偏角の原理(argument principle、この単元では紹介のみ・証明は範囲外)による**閉形式**の
 * 期待巻き数: 中心 center・半径 radius の円が厳密に囲む(distance(singularity, center) <
 * radius)零点・極の重複度/位数を、零点は `+`・極は `−` で符号付けして合計する
 * (windingNumberAround の数値積分とは独立に、COMPLEX_FN_SINGULARITIES の定数だけから
 * 計算する——evaluateComplex を呼び出さない)。
 *
 * 円周がちょうど特異点の上に乗る(distance ≈ radius)退化ケースは「囲むか囲まないか」が
 * 定義できないため、サイレントに丸めず RangeError で弾く(この単元の実験ではプローブ半径を
 * 既知の零点・極どうしの最小距離より十分小さく選ぶ設計のため、通常は発生しない)。
 */
export function expectedWindingNumber(fnId: ComplexFnId, center: Complex, radius: number): number {
	assertFiniteComplex(center, 'center');
	assertPositiveNumber(radius, 'radius');
	let total = 0;
	for (const s of COMPLEX_FN_SINGULARITIES[fnId]) {
		const d = distance(s.point, center);
		if (approximatelyZero(d - radius, Math.max(1, radius))) {
			throw new RangeError(
				`expectedWindingNumber: circle boundary passes through a singularity of ${fnId} ` +
					`(ambiguous: distance=${d}, radius=${radius})`,
			);
		}
		if (d < radius) {
			total += s.kind === 'zero' ? s.order : -s.order;
		}
	}
	return total;
}

/**
 * 中心 center・半径 radius の円周を samples 点で等間隔にサンプリングし、f(z) の偏角の
 * 総変化量を 2π で割って返す(標準的な巻き数の数値計算: 隣接サンプル間の偏角の差を
 * (−π, π] へアンラップ〔位相接続〕してから積算する——samples が十分大きければ、
 * 理論上は整数へ収束する)。有限サンプルの数値近似であるため、呼び出し側は
 * `Math.round` する、または `expectedWindingNumber` との差が小さいことを確認する形で
 * 使う(この単元の実行時交差検証、C-7)。
 *
 * 円周上のサンプル点で f が定義されない(evaluateComplex が null を返す=サンプル点が
 * 特異点そのものに一致した)場合は RangeError(不正な半径・中心の組み合わせに対する防御。
 * この単元のプローブ半径では設計上起こらない)。
 */
export function windingNumberAround(
	fnId: ComplexFnId,
	center: Complex,
	radius: number,
	samples: number,
): number {
	assertFiniteComplex(center, 'center');
	assertPositiveNumber(radius, 'radius');
	assertPositiveInteger(samples, 'samples');
	if (samples < 8) {
		throw new RangeError(
			`samples must be at least 8 for a meaningful winding number, got ${samples}`,
		);
	}

	let totalDeltaRad = 0;
	let prevArgRad: number | null = null;
	for (let k = 0; k <= samples; k++) {
		const theta = (2 * Math.PI * k) / samples;
		const z: Complex = [center[0] + radius * Math.cos(theta), center[1] + radius * Math.sin(theta)];
		const w = evaluateComplex(fnId, z);
		if (w === null) {
			throw new RangeError(
				`windingNumberAround: f(${fnId}) is undefined (pole) exactly on the sampling circle (k=${k})`,
			);
		}
		const argRad = Math.atan2(w[1], w[0]);
		if (prevArgRad !== null) {
			let delta = argRad - prevArgRad;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta <= -Math.PI) delta += 2 * Math.PI;
			totalDeltaRad += delta;
		}
		prevArgRad = argRad;
	}
	return totalDeltaRad / (2 * Math.PI);
}
