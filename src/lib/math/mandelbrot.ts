// マンデルブロ集合(反復による「逃げるか、留まるか」の判定)の純粋 TypeScript モデル
// (AGENTS.md §5: React/Canvas 等の描画ライブラリを一切 import しない)。
//
// この単元の中核体験: 座標 (x, y) を「2乗して c を足す」というたった1つの2次式の規則で
// 繰り返し動かす。z_{n+1} = z_n^2 + c (複素数の式は、記事の形式的定義で導入する。この
// モデルは複素数型を持ち込まず、実部・虚部のペア (zx, zy) として実装する):
//   zx' = zx^2 - zy^2 + cx
//   zy' = 2 * zx * zy + cy
// z_0 = 0 から出発し、|z_n| がある閾値を超えて発散するか(逃げる)、有界に留まるか
// (留まる)で c を塗り分けたものがマンデルブロ集合。**拡大しても同じような複雑さが
// 現れ続ける**ことが、この単元で発見する事実(誤解=「どんな図形も拡大すればいつかは
// 滑らかな単純な線になる」の反証)。

function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

function assertPositiveInteger(value: number, name: string): void {
	assertFiniteNumber(value, name);
	if (!Number.isInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive integer, got ${value}`);
	}
}

/**
 * 逃げ出す反復回数(escape time)。z_0=0 から z_{n+1}=z_n^2+c を繰り返し、
 * |z_n|>2 (zx^2+zy^2>4) を最初に満たした反復回数 n を返す。maxIter まで
 * 一度も条件を満たさなければ maxIter を返す(「留まった」ものとして扱う近似——
 * 真に有界かどうかの証明ではなく、maxIter 回まで観測した結果であることに注意)。
 *
 * **|z|>2 なら必ず発散する根拠**(この関数が escape 条件として |z|>2 を使ってよい理由):
 * c が |c|<=2 の範囲にあるとする。ある反復で |z_n|>2 が観測されたとき、
 *   |z_{n+1}| = |z_n^2 + c| >= |z_n|^2 - |c| >= |z_n|^2 - 2
 * (三角不等式 |a+b|>=|a|-|b| を a=z_n^2, b=c に適用し、|c|<=2 を使った)。
 * |z_n|>2 なので |z_n|^2 > 2|z_n| であり、したがって
 *   |z_n|^2 - 2 > 2|z_n| - 2 - (|z_n| - 2) = |z_n|
 * (最後の変形は |z_n|-2>0 を使って 2|z_n|-2 と |z_n| を比較: 2|z_n|-2-|z_n| = |z_n|-2 > 0)。
 * つまり |z_{n+1}| > |z_n| > 2 が成り立ち、同じ議論を繰り返すと |z_n| は毎回真に
 * 増加し続ける。さらに |z_n|>=2 のとき |z_n|^2-2 >= |z_n|^2/2 (|z_n|^2>=4 と同値)
 * なので、少なくとも |z_{n+1}| >= |z_n|^2/2 という平方オーダーの増大が保証され、
 * 二度と半径2の円板に戻らず無限大へ発散する。
 *
 * **c が |c|<=2 の範囲外でも同じ式は正しく動く**: z_1 = z_0^2+c = c なので、|c|>2 なら
 * 最初の反復(n=1)で早くも |z_1|=|c|>2 となり escape が検出される(1〜2回で脱出するだけで、
 * 上の証明の前提「観測時点で |c|<=2」は escape 判定そのものには影響しない——
 * escape が検出された時点の c の大きさに関わらず、判定式 zx^2+zy^2>4 は同じ式で正しく動く)。
 */
export function escapeTime(cx: number, cy: number, maxIter: number): number {
	assertFiniteNumber(cx, 'cx');
	assertFiniteNumber(cy, 'cy');
	assertPositiveInteger(maxIter, 'maxIter');

	let zx = 0;
	let zy = 0;
	for (let iter = 0; iter < maxIter; iter++) {
		const zx2 = zx * zx;
		const zy2 = zy * zy;
		if (zx2 + zy2 > 4) return iter;
		const nextZx = zx2 - zy2 + cx;
		const nextZy = 2 * zx * zy + cy;
		zx = nextZx;
		zy = nextZy;
	}
	return maxIter;
}

/**
 * C-7 交差検証用の独立オラクル(1): 主カージオイド(main cardioid)の内部判定。
 * escapeTime の反復とは完全に別経路の閉形式(代数的に導かれた領域の内部判定式)。
 *
 * q = (cx - 1/4)^2 + cy^2 として、q・(q + (cx - 1/4)) < cy^2/4 を満たす点は主カージオイドの
 * 内部にあり、その軌道は(周期1の)吸引固定点へ収束するため maxIter に関わらず決して
 * escape しない(証明はこの単元の範囲外——記事では「反復せずに分かる領域がある」ことの
 * 提示に留める)。
 */
export function isInMainCardioid(cx: number, cy: number): boolean {
	assertFiniteNumber(cx, 'cx');
	assertFiniteNumber(cy, 'cy');
	const q = (cx - 0.25) ** 2 + cy * cy;
	return q * (q + (cx - 0.25)) < (cy * cy) / 4;
}

/**
 * C-7 交差検証用の独立オラクル(2): 周期2バルブ(period-2 bulb)の内部判定。
 * 中心 (-1, 0)・半径 1/4 の円の内部(閉形式)。この領域の軌道は周期2の吸引サイクルへ
 * 収束するため、こちらも maxIter に関わらず決して escape しない。
 */
export function isInPeriod2Bulb(cx: number, cy: number): boolean {
	assertFiniteNumber(cx, 'cx');
	assertFiniteNumber(cy, 'cy');
	return (cx + 1) ** 2 + cy * cy < 1 / 16;
}

/** 表示領域: 中心 (centerX, centerY) と半幅(math 単位)。縦横比は width/height から算出し、
 * 歪みなく表示する(halfHeight = halfWidth * height / width)。 */
export interface MandelbrotView {
	readonly centerX: number;
	readonly centerY: number;
	readonly halfWidth: number;
}

function assertValidView(view: MandelbrotView): void {
	assertFiniteNumber(view.centerX, 'view.centerX');
	assertFiniteNumber(view.centerY, 'view.centerY');
	assertFiniteNumber(view.halfWidth, 'view.halfWidth');
	if (view.halfWidth <= 0) {
		throw new RangeError(`view.halfWidth must be positive, got ${view.halfWidth}`);
	}
}

/**
 * 表示領域(view)から各ピクセルの escapeTime を求め、行優先(row-major、idx = py*width+px)の
 * Uint16Array で返す。**この関数までが lib/math であり、escapeTime(整数値)を色へ変換するのは
 * Scene 側の責務**(MATH_CONVENTIONS §9: 色は装飾であり意味は「脱出の速さ」)。
 *
 * ピクセル中心 (px+0.5, py+0.5) を数学座標へ写像する(ピクセルの角ではなく中心をサンプルする
 * ことで、格子の端で系統的に偏らないようにする)。行 0 がスクリーン最上段(数学的には y が
 * 最大)に対応するため、行→y の対応は上下反転が必要になる——本来 lib/math はスクリーン座標を
 * 意識しない設計(MATH_CONVENTIONS §5)だが、この関数はタスク仕様により「ピクセル格子への
 * ラスタライズそのもの」を lib/math 側の責務として明示的に負っており(Scene は色変換のみ行う)、
 * ここでの上下反転はその責務(ピクセル格子と数学平面の対応付け)に含まれる例外として扱う。
 *
 * maxIter は Uint16Array (0〜65535) に収まる前提(UI 上限は 500 のため十分な余裕がある)。
 */
export function renderEscapeGrid(
	view: MandelbrotView,
	width: number,
	height: number,
	maxIter: number,
): Uint16Array {
	assertValidView(view);
	assertPositiveInteger(width, 'width');
	assertPositiveInteger(height, 'height');
	assertPositiveInteger(maxIter, 'maxIter');
	if (maxIter > 65535) {
		throw new RangeError(`maxIter must fit in Uint16Array (<=65535), got ${maxIter}`);
	}

	const halfHeight = (view.halfWidth * height) / width;
	const xMin = view.centerX - view.halfWidth;
	const yMax = view.centerY + halfHeight;
	const dx = (2 * view.halfWidth) / width;
	const dy = (2 * halfHeight) / height;

	const grid = new Uint16Array(width * height);
	for (let py = 0; py < height; py++) {
		const y0 = yMax - (py + 0.5) * dy; // 行が進む(下へ)ほど数学的な y は減る
		for (let px = 0; px < width; px++) {
			const x0 = xMin + (px + 0.5) * dx;
			grid[py * width + px] = escapeTime(x0, y0, maxIter);
		}
	}
	return grid;
}
