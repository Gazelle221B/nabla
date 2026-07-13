import { Mafs, Coordinates, Plot, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import { arithmeticTerm, geometricTerm } from '../../../lib/math/sequences.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// RiemannSumScene / LinearFunctionScene と同じ方針: 数学の値そのものは lib/math/sequences.ts
// の純粋関数へ委譲し、この層は点列の座標計算(描画のためだけの評価、DESIGN.md の
// 「数学モデルと描画の分離」)と表示に徹する。可動点(MovablePoint)は使わない
// (タスク厳守事項: 点列は Point で十分。a1・d/r の操作は親 Island 側のスライダーが担い、
// 図中の点は「読者が動かした結果を観察する」表示専用の点)。
//
// この単元の中核体験: 等差数列の点 (n, aₙ) は一直線に並び(前単元 algebra/linear-function の
// 一次関数のグラフと同じ「傾き=公差」の関係)、等比数列の点は指数的に曲がって並ぶ。
// 等差モードでは対応する直線 y=a1+(x-1)d を薄く重ねて、この「まっすぐ並ぶ」ことを
// 視覚的に裏付ける(点が直線上に乗っていることが見て取れる)。

type SequenceType = 'arithmetic' | 'geometric';
type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークンを Mafs Theme へ対応づける。
// 点列 = accent-primary 相当(読者が a1・d/r を操作した結果として変化する量)。
// 重ねる直線(等差モードのみ)= 参照・裏付けの補助線として控えめな色 + 低い不透明度。
const COLORS = {
	point: Theme.blue,
	line: Theme.foreground,
};

export interface SequenceSceneProps {
	/** 数列の種類。等差モードでのみ対応する直線を重ねる。 */
	type: SequenceType;
	/** 初項 a1 */
	a1: number;
	/** 公差(等差モードで使用。等比モードでは無視される) */
	d: number;
	/** 公比(等比モードで使用。等差モードでは無視される) */
	r: number;
	/** プロットする項数(n=1〜termsCount) */
	termsCount: number;
	/** viewBox の y 範囲(親が a1・d/r の可動域から決め打ちする) */
	yMin: number;
	yMax: number;
}

export function SequenceScene({ type, a1, d, r, termsCount, yMin, yMax }: SequenceSceneProps) {
	const points: V2[] = [];
	for (let n = 1; n <= termsCount; n++) {
		const value = type === 'arithmetic' ? arithmeticTerm(a1, d, n) : geometricTerm(a1, r, n);
		points.push([n, value]);
	}

	const xLo = 0;
	const xHi = termsCount + 1;

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yMin, yMax] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 等差モードのみ: 対応する直線 y=a1+(x-1)d を薄く重ねる(点が一直線に並ぶことの裏付け) */}
			{type === 'arithmetic' && (
				<Plot.OfX y={(x) => a1 + (x - 1) * d} color={COLORS.line} opacity={0.35} style="dashed" />
			)}

			{/* 点列 (n, aₙ): n=1〜termsCount。ドラッグ不可の表示専用の点(操作は親のスライダーが担う) */}
			{points.map(([x, y], i) => (
				<Point key={i} x={x} y={y} color={COLORS.point} />
			))}

			<LaTeX
				at={[xHi - 0.6, yMax - (yMax - yMin) * 0.08]}
				tex={type === 'arithmetic' ? 'a_n = a_1+(n-1)d' : 'a_n = a_1 r^{n-1}'}
				color={COLORS.point}
			/>
		</Mafs>
	);
}
