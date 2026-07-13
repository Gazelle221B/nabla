import { Mafs, Coordinates, Plot, Polygon, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import { evaluatePoly, type Polynomial } from '../../../lib/math/derivativeFunction.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// DerivativeFunctionScene / QuadraticFunctionScene と同じ方針: 「主張」の値
// (リーマン和・厳密値・差, lib/math/riemannSum.ts で親が計算済み) はこの層では扱わず、
// 表示するだけ。一方、長方形 n 本の頂点座標 (描画対象のデータ) は、DerivativeFunctionScene
// が evaluatePoly を直接呼んで曲線を描くのと同じ前例に倣い、この層で直接計算する
// (rule of three: 汎用の「面積描画コンポーネント」を先行設計しない)。
//
// この単元の中核体験: n (長方形の本数) を増やすと、長方形の合計面積が曲線の下の
// 面積へ近づいていく様子を、実際に長方形が細かくなっていく図で見せる。長方形は
// n という「読者が操作する量」によって形が変わるため accent-primary、曲線 f(x) 自体は
// 変化しない参照対象として accent-secondary を使う (MATH_CONVENTIONS.md §9)。

type V2 = [number, number];

const COLORS = {
	curve: Theme.foreground,
	rectangle: Theme.blue,
};

export interface RiemannSumSceneProps {
	/** f(x) の係数 (昇べきの順)。この Scene では描画対象のデータとして受け取る。 */
	coeffs: Polynomial;
	/** 積分区間 [lower, upper] (この単元では [0,1] 固定, 親が渡す) */
	lower: number;
	upper: number;
	/** 長方形の本数 (読者がスライダー・数値入力で操作する) */
	n: number;
	/** viewBox の y 範囲 (関数ごとに親が決め打ちする。rule of three: 2関数のみ扱う) */
	yMin: number;
	yMax: number;
}

export function RiemannSumScene({ coeffs, lower, upper, n, yMin, yMax }: RiemannSumSceneProps) {
	const f = (x: number): number => evaluatePoly(coeffs, x);

	const width = (upper - lower) / n;
	const rectangles: V2[][] = [];
	for (let i = 0; i < n; i++) {
		const x0 = lower + i * width;
		const x1 = x0 + width;
		const height = f(x0); // 左端点リーマン和: 左端点での関数値を高さとする
		rectangles.push([
			[x0, 0],
			[x1, 0],
			[x1, height],
			[x0, height],
		]);
	}

	const xLo = lower - (upper - lower) * 0.3;
	const xHi = upper + (upper - lower) * 0.3;

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yMin, yMax] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 長方形 n 本: 左端点リーマン和の近似面積 (読者が n を操作すると本数・幅が変わる) */}
			{rectangles.map((points, i) => (
				<Polygon
					key={i}
					points={points}
					color={COLORS.rectangle}
					fillOpacity={0.28}
					strokeStyle="solid"
					weight={1}
				/>
			))}

			{/* 曲線 y=f(x): 長方形が近似しようとしている「本当の」面積の境界 (固定の参照対象) */}
			<Plot.OfX y={f} color={COLORS.curve} />
			<LaTeX at={[xHi - (xHi - xLo) * 0.18, f(xHi - (xHi - xLo) * 0.18)]} tex="f(x)" color={COLORS.curve} />
		</Mafs>
	);
}
