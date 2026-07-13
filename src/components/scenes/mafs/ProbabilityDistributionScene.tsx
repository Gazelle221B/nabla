import { Mafs, Coordinates, Polygon, Line, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, C-4: 新規依存禁止のため棒グラフは
// ProbabilityScene と同じく Mafs の Polygon だけで描く)。数学ロジックは持たず、親
// (ProbabilityDistributionExperiment)から受け取った値・確率・期待値をそのまま描画するだけの
// 純粋な表示コンポーネント。lib/math には依存しない(実際の期待値の計算は親が
// lib/math/probabilityDistribution.ts で行い、結果を props として渡す)。
//
// この単元の中核体験: くじの確率分布表(値×確率)を棒グラフで示し、期待値 E[X] の位置を
// x 軸上のマーカーで重ねる。「E[X] は分布の重心である」という直感——賞金額や本数を変えると
// 棒の高さ・位置が変わり、それに連動して重心(E[X]のマーカー)も動く——を、実際に賞金額・
// 本数を操作しながら発見できるようにする。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。棒(各値の確率)= 読者がスライダーで動かす
// 賞金額・本数から決まる、操作の結果として変化する量 = accent-primary。期待値マーカーは
// 「全ての値・確率から導かれる要約量」であり、読者の直接操作対象でも正誤フィードバックでも
// ないため success/warning とは別の中立トークン(ScatterScene の平均点マーカーと同じ
// Theme.orange 系統、「導出量」を表す色)を使う。
const COLORS = {
	bar: Theme.blue,
	expected: Theme.orange,
};

export interface ProbabilityDistributionSceneProps {
	/** くじの値(賞金額など)。probs と同じ順序・長さ。重複があってもよい(縮退例)。 */
	values: readonly number[];
	/** 各値の確率(values と対応、合計は約1)。 */
	probs: readonly number[];
	/** 期待値 E[X](親が lib/math/probabilityDistribution.ts の expectedValue で計算した値)。 */
	expectedValue: number;
}

export function ProbabilityDistributionScene({ values, probs, expectedValue }: ProbabilityDistributionSceneProps) {
	const lo = Math.min(0, ...values, expectedValue);
	const hi = Math.max(0, ...values, expectedValue);
	const range = Math.max(1, hi - lo);
	// 値の範囲に対して視認できる棒の太さ(狭すぎず、隣り合う値同士がある程度離れていれば
	// 重ならない程度)。値がすべて同じ(縮退例)でも 0 にならないよう下限を設ける。
	const barWidth = Math.max(range * 0.035, 6);
	const margin = range * 0.12;
	const yMax = Math.max(0.15, ...probs) * 1.2;

	return (
		<Mafs
			viewBox={{ x: [lo - margin, hi + margin], y: [-yMax * 0.22, yMax] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 棒グラフ: 各値の確率(ドラッグ不可、表示専用。操作は親のスライダーが担う)。 */}
			{values.map((value, i) => {
				const xLo = value - barWidth / 2;
				const xHi = value + barWidth / 2;
				const height = probs[i];
				const points: V2[] = [
					[xLo, 0],
					[xHi, 0],
					[xHi, height],
					[xLo, height],
				];
				return <Polygon key={i} points={points} color={COLORS.bar} fillOpacity={0.5} weight={2} />;
			})}

			{/* 期待値 E[X] のマーカー: 分布の「重心」を示す垂直な破線+x軸上の点。 */}
			<Line.Segment
				point1={[expectedValue, 0]}
				point2={[expectedValue, yMax]}
				color={COLORS.expected}
				weight={2}
				style="dashed"
			/>
			<Point x={expectedValue} y={0} color={COLORS.expected} svgCircleProps={{ r: 6 }} />
			<LaTeX at={[expectedValue, yMax * 0.9]} tex="E[X]" color={COLORS.expected} />
		</Mafs>
	);
}
