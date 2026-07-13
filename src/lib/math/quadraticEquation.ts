import { approximatelyZero } from './compare.js';
import { completeSquare } from './quadraticFunction.js';

// 二次方程式 ax^2+bx+c=0 と判別式 D=b^2-4ac の純粋 TypeScript モデル
// (AGENTS.md §5: React/Mafs を一切 import しない)。
//
// この単元の中核体験: 放物線 y=ax^2+bx+c を上下に動かす(c を変える)と、x 軸との交点の
// 個数(2/1/0)が判別式 D の符号(正/ゼロ/負)と完全に対応する。「解の公式の √D が実在するか」
// という見方——D>0 なら √D は実数として存在し2つの異なる解、D=0 なら √D=0 で1つの解
// (重解)、D<0 なら実数の範囲では √D が存在せず実数解がない(数I の範囲。複素数は扱わない)。
//
// 重複実装しない(タスク厳守事項): 頂点形式への変換(p = -b/(2a), q = c-b^2/(4a))は
// quadraticFunction.ts の completeSquare と全く同じ式なので、ここで再実装せずそのまま再利用する
// (realRoots・vertexFromStandard の内部で使う)。一方 evaluateStandard は「標準形の多項式を
// 直接評価する」独立した式であり、completeSquare 経由の頂点形式評価とは別の計算経路を意図的に
// 保つ(下記コメント参照: 解を検証する非自己確認テストの独立オラクルとして必要なため、
// completeSquare を経由させると検証が循環してしまう)。

/** 標準形 y=ax^2+bx+c の頂点 (p, q)。quadraticFunction.ts の completeSquare にそのまま委譲する。 */
export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (quadraticFunction.ts の assertFiniteNumber と同じ流儀。モジュールをまたいだ共有はせず
// 各モジュールが自身の検証ヘルパーを持つ既存の流儀を踏襲する — eigen.ts / linearTransformation.ts
// も同様に各自 assertFinite* を持つ)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 標準形の多項式 y=ax^2+bx+c を x で直接評価する。
 *
 * quadraticFunction.ts の evaluate(a,p,q,x) は頂点形式(a,p,q)を引数に取るため、標準形
 * (a,b,c) をそのまま評価するにはシグネチャが合わない。ここで ax^2+bx+c を直接計算するのは、
 * completeSquare を経由せず独立に多項式を評価する意図的な設計判断——realRoots が
 * completeSquare 由来の p を使って解を導出するのに対し、この関数が同じ completeSquare を
 * 経由してしまうと「解を代入して0に戻るか」という検証(不変条件テストの核心、C-7)が
 * 同じ式を2回計算するだけの自己確認になってしまう。evaluateStandard は解の導出とは
 * 独立した計算経路を保つために、あえて頂点形式を経由しない生の多項式評価を新設する。
 * a=0(二次でない退化)でも例外を投げず有限値を返す(quadraticFunction.evaluate と同じ方針、
 * MATH_CONVENTIONS §4)。
 */
export function evaluateStandard(a: number, b: number, c: number, x: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	assertFiniteNumber(c, 'c');
	assertFiniteNumber(x, 'x');
	return a * x * x + b * x + c;
}

/**
 * 判別式 D = b^2 - 4ac。
 *
 * a≈0 は「二次方程式ではない」(一次方程式 bx+c=0、またはb=0なら定数)退化ケースであり、
 * completeSquare(quadraticFunction.ts)と全く同じ理由(a≠0 を要求する二次関数/二次方程式の
 * 定義から外れる質的に異なるケース)で RangeError にする。閾値判定も completeSquare と
 * 同じ approximatelyZero(a, 1) を使い、両モジュールで「二次でない」の境界を一致させる。
 */
export function discriminant(a: number, b: number, c: number): number {
	assertFiniteNumber(a, 'a');
	assertFiniteNumber(b, 'b');
	assertFiniteNumber(c, 'c');
	if (approximatelyZero(a, 1)) {
		throw new RangeError(
			`discriminant is undefined for a=0: ${b}*x+${c}=0 is not a quadratic equation (a≠0 required)`,
		);
	}
	return b * b - 4 * a * c;
}

/**
 * 標準形の頂点 (p, q)。quadraticFunction.ts の completeSquare にそのまま委譲する薄いラッパー
 * (重複実装しない: p=-b/(2a), q=c-b^2/(4a) の式自体は completeSquare 側にのみ存在する)。
 * Scene 層が viewBox の中心や描画範囲を決める際に使う。
 */
export function vertexFromStandard(a: number, b: number, c: number): Point2 {
	const { p, q } = completeSquare(a, b, c);
	return [p, q];
}

/**
 * 実数解を求める(解の公式)。
 *
 * 分類は判別式の符号を **exact zero** で行う(epsilon 幅を設けない)。根拠(M3 eigen.ts の
 * computeEigenSystem と同じ設計判断): discriminant は「数学的結果を丸めない」契約
 * (MATH_CONVENTIONS §10)の関数であり、ここに approximatelyZero を持ち込むと契約と矛盾する。
 * さらに D は2乗差を含む量であり、わずかな係数の差に許容誤差を適用すると、2乗されたぶん
 * さらに小さい桁で「ほぼ0」と誤判定されてしまう(例: a=1,b=2,c=1+1e-10 は実際には相異なる
 * 実数解を持つが、D=-4e-10 に相対誤差を適用すると重解に見えてしまう)。これは
 * 「連続量の近傍表示」(例: 退化した図形の面積が0に近い)とは区別すべき「分類境界」であり、
 * 分類境界は exact zero で判定する(eigen.ts の discriminant<0/===0/>0 分岐と同じ方針)。
 *
 * 導出: 頂点形式 a(x-p)^2+q=0 ⟺ (x-p)^2 = -q/a。q=c-b^2/(4a) なので
 * -q/a = (b^2-4ac)/(4a^2) = D/(4a^2)。よって D≥0 のとき x = p ± √D/(2|a|)。
 * p は completeSquare(重複実装しない)から得る。
 *
 * - D>0: 2解を昇順で返す。
 * - D=0(exact): 重解を1個返す。
 * - D<0: 実数の範囲に解はない(空配列。数I の範囲であり複素数は扱わない)。
 */
export function realRoots(a: number, b: number, c: number): readonly number[] {
	const d = discriminant(a, b, c); // a,b,c の有限性・a≠0 もここで検証される
	if (d < 0) return [];
	const { p } = completeSquare(a, b, c);
	if (d === 0) return [p];
	const offset = Math.sqrt(d) / (2 * Math.abs(a));
	return [p - offset, p + offset];
}
