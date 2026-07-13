import { Mafs, Coordinates, Polygon, Line, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import {
	relativeFrequencies,
	theoreticalProbability,
	type DiceFrequencies,
} from '../../../lib/math/probability.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// C-4 厳守: 新規依存を追加せず、Mafs の Polygon(棒)/Line.Segment(基準線)だけで棒グラフを
// 描く。数学の値そのものは lib/math/probability.ts の純粋関数(relativeFrequencies・
// theoreticalProbability)へ委譲し、この層は座標計算(描画のためだけの評価、DESIGN.md の
// 「数学モデルと描画の分離」)と表示に徹する。
//
// この単元の中核体験: 出目1〜6それぞれの相対度数(棒の高さ)を、理論確率 1/6 の水平線
// (基準線)と見比べる。試行回数 n が少ないと棒はばらつき、n が増えると基準線に近づいていく
// ——という変化を、親 Island 側で n を変えるたびにこの図を再描画することで見せる。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// 棒(各目の相対度数)= 読者が n(試行回数)やシードを操作した結果として変化する量 = accent-primary。
// 基準線(理論確率 1/6)= 参照・固定される比較対象 = 控えめな色(grid/axis と同系統、Theme.foreground)。
const COLORS = {
	bar: Theme.blue,
	reference: Theme.foreground,
};

const BAR_WIDTH = 0.6;
const X_LO = 0;
const X_HI = 7;

export interface ProbabilitySceneProps {
	/** 出目1〜6それぞれの度数(simulateDice の戻り値をそのまま渡す) */
	counts: DiceFrequencies;
}

export function ProbabilityScene({ counts }: ProbabilitySceneProps) {
	const relFreqs = relativeFrequencies(counts);
	const theoretical = theoreticalProbability(1, 6);

	// viewBox の y 範囲: 相対度数は理論上 [0,1] だが、少数回の試行では1つの目に偏り
	// 相対度数が理論確率よりかなり大きくなることがあるため、実際の最大値に合わせて動的に決める。
	const yMax = Math.max(0.4, ...relFreqs) * 1.15;

	return (
		<Mafs
			viewBox={{ x: [X_LO, X_HI], y: [0, yMax] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 棒グラフ: 出目1〜6の相対度数。ドラッグ不可の表示専用(操作は親のスライダーが担う)。 */}
			{relFreqs.map((value, i) => {
				const face = i + 1;
				const xLo = face - BAR_WIDTH / 2;
				const xHi = face + BAR_WIDTH / 2;
				const points: V2[] = [
					[xLo, 0],
					[xHi, 0],
					[xHi, value],
					[xLo, value],
				];
				return <Polygon key={face} points={points} color={COLORS.bar} fillOpacity={0.5} weight={2} />;
			})}

			{/* 基準線: 理論確率 1/6(サイコロの目は同様に確からしいので、どの目も 1/6)。 */}
			<Line.Segment
				point1={[X_LO, theoretical]}
				point2={[X_HI, theoretical]}
				color={COLORS.reference}
				weight={2}
				style="dashed"
			/>
			<LaTeX at={[X_HI - 0.7, theoretical + yMax * 0.06]} tex="\tfrac{1}{6}" color={COLORS.reference} />
		</Mafs>
	);
}
