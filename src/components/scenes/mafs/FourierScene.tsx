import { Mafs, Coordinates, Plot, Line, Point, Circle, Vector, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import {
	squareWave,
	squareWaveCoefficient,
	fourierPartialSum,
} from '../../../lib/math/fourierSquareWave.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略、ADR-004:
// エピサイクル型負荷は N<=800 相当の少数要素×高頻度更新であり、計測上 SVG が合格基準
// [平均58fps以上・p95 20ms以下]を満たすため Tier 2 昇格の理由がない)。
//
// この単元の中核体験を1つのシーンで2通りに見せる:
//   (a) エピサイクル: 半径 4/(π(2j-1)) の円を持つベクトルを j=1..N 個、原点から鎖のように
//       つなぐ。各ベクトルは角速度 (2j-1) で回転し(角度は (2j-1)t)、鎖の先端の高さ(y座標)が
//       ちょうど S_N(t) = Σ b_{2j-1} sin((2j-1)t) になる——これは fourierPartialSum の値と
//       幾何学的に同一の量(数学的に同じ和を「ベクトルの連鎖」として描いているだけ)。
//   (b) 波形: S_N(x) の曲線(Plot、実線)と方形波(参照、破線、squareWave をそのまま再利用)を
//       重ね描きし、現在の t における点にマーカーを置く。
// 2つの図は同じ y レンジ([-1.4, 1.4])を共有し、上下に並べることで「エピサイクルの鎖の高さ」
// と「波形上の点の高さ」が同じ値であることが視覚的に対応するようにする。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
const COLORS = {
	vector: Theme.blue, // エピサイクルの各ベクトル(読者が N・t を操作した結果として変化する量)
	circle: Theme.foreground, // 各ベクトルの半径を示す補助円(構造、データそのものではない。低opacityで描画)
	tip: Theme.orange, // 鎖の先端(現在の合計値)
	guide: Theme.orange, // 高さを結ぶ水平ガイド線(導出量、中立トークン)
	partialSum: Theme.blue, // S_N(x) の曲線(操作対象 N・t に応じて変化する)
	squareWave: Theme.violet, // 参照の方形波(固定、比較対象。accent-secondary系統)
	marker: Theme.orange, // 現在の t のマーカー
	answer: Theme.red, // ギブス現象の答えを示す y=1 参照線(予想ゲート後のみ)
};

// 波形パネルの x レンジ(1周期分、少し余白を持たせる)。
const X_MIN = -0.15;
const X_MAX = 2 * Math.PI + 0.15;
// 両パネル共通の y レンジ。S_N の最大オーバーシュートは N<=50 の範囲で最大でも
// 約1.28(S_1(π/2)=4/π≈1.273 が実測上の最大、golden テストで確認済み)なので、
// 1.4 の余白があれば全ての N・t で切れない(RANGE_CAP と同じ設計思想:
// 決め打ちの固定レンジで、後から見た目が跳ねないようにする)。
const Y_MIN = -1.4;
const Y_MAX = 1.4;

export interface FourierSceneProps {
	/** 項数 N(1〜50)。 */
	n: number;
	/** 現在の時刻(角度)t(0〜2π)。 */
	t: number;
	/**
	 * ギブス現象を示す y=1 参照線を表示するか(既定 false)。予想ゲートの前は必ず false にする——
	 * この参照線は「ツノが1を超えたまま残り続ける」という単元の答えそのものであり、予想前に
	 * 見えると発見学習が成立しない(SequenceLimitScene の showLimit と同じ規範)。
	 */
	showJumpReference?: boolean;
}

export function FourierScene({ n, t, showJumpReference = false }: FourierSceneProps) {
	// エピサイクルの鎖: j=1..n について、半径 b_{2j-1}・角度 (2j-1)t のベクトルを
	// 原点から順につなぐ。squareWaveCoefficient (閉形式) をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。
	const chain: V2[] = [[0, 0]];
	for (let j = 1; j <= n; j++) {
		const k = 2 * j - 1;
		const radius = squareWaveCoefficient(k);
		const angle = k * t;
		const [px, py] = chain[chain.length - 1];
		chain.push([px + radius * Math.cos(angle), py + radius * Math.sin(angle)]);
	}
	const tip = chain[chain.length - 1];

	// 鎖が到達しうる最大の広がり(全ベクトルが同じ向きを向いた最悪ケース、三角不等式による
	// 安全な上界)。表示レンジの決め打ちに使う(SequenceLimitScene の RANGE_CAP と同じ発想:
	// タイトな最適値ではなく、安全に全ケースを収める上界)。
	let maxReach = 0;
	for (let j = 1; j <= n; j++) {
		maxReach += squareWaveCoefficient(2 * j - 1);
	}
	const epicycleHalfWidth = Math.max(1.6, maxReach + 0.3);

	// S_N(t) は fourierPartialSum の値そのもの(鎖の先端の y 座標と数学的に同一の量を、
	// 独立した経路である lib/math の関数から取得——描画用の chain 計算とは別の呼び出し)。
	const currentValue = fourierPartialSum(n, t);

	return (
		<div>
			<Mafs
				viewBox={{ x: [-epicycleHalfWidth, epicycleHalfWidth], y: [Y_MIN, Y_MAX] }}
				preserveAspectRatio="contain"
				pan={false}
				zoom={false}
				height={280}
			>
				<Coordinates.Cartesian subdivisions={false} />

				{/* 各ベクトルの半径を示す補助円。 */}
				{chain.slice(0, -1).map(([cx, cy], i) => {
					const k = 2 * i + 1;
					const radius = squareWaveCoefficient(k);
					return <Circle key={i} center={[cx, cy]} radius={radius} color={COLORS.circle} fillOpacity={0} strokeOpacity={0.5} />;
				})}

				{/* 鎖のベクトル本体。 */}
				{chain.slice(0, -1).map((tail, i) => (
					<Vector key={i} tail={tail} tip={chain[i + 1]} color={COLORS.vector} weight={2} />
				))}

				{/* 鎖の先端 + 右端まで伸びる水平ガイド線(先端の高さ=S_N(t) を示す)。 */}
				<Point x={tip[0]} y={tip[1]} color={COLORS.tip} />
				<Line.Segment
					point1={tip}
					point2={[epicycleHalfWidth, tip[1]]}
					color={COLORS.guide}
					weight={1.5}
					style="dashed"
				/>
				<LaTeX
					at={[-epicycleHalfWidth + 0.9, Y_MAX - 0.2]}
					tex={`S_{${n}}(t) = ${currentValue.toFixed(2)}`}
					color={COLORS.tip}
				/>
			</Mafs>

			<Mafs
				viewBox={{ x: [X_MIN, X_MAX], y: [Y_MIN, Y_MAX] }}
				preserveAspectRatio="contain"
				pan={false}
				zoom={false}
				height={280}
			>
				<Coordinates.Cartesian subdivisions={false} />

				{/* 参照: 方形波(固定、破線)。squareWave をそのまま再利用する(重複実装しない)。 */}
				<Plot.OfX y={(x) => squareWave(x)} domain={[X_MIN, X_MAX]} color={COLORS.squareWave} style="dashed" />

				{/* S_N(x) の曲線。fourierPartialSum をそのまま再利用する。 */}
				<Plot.OfX y={(x) => fourierPartialSum(n, x)} domain={[X_MIN, X_MAX]} color={COLORS.partialSum} weight={2} />

				{/* 現在の t のマーカーと、エピサイクル図と揃えるための水平ガイド線。 */}
				<Point x={t} y={currentValue} color={COLORS.marker} />
				<Line.Segment
					point1={[X_MIN, currentValue]}
					point2={[t, currentValue]}
					color={COLORS.guide}
					weight={1.5}
					style="dashed"
				/>

				{/* ギブス現象の答え: y=1 の参照線。予想ゲート後のみ表示する(答えを構成する描画要素は
				    ゲートで隠す規範、SequenceLimitScene の showLimit と同じ)。 */}
				{showJumpReference && (
					<>
						<Line.Segment point1={[X_MIN, 1]} point2={[X_MAX, 1]} color={COLORS.answer} weight={1.5} style="dashed" />
						<LaTeX at={[X_MAX - 1.1, 1.15]} tex="y=1" color={COLORS.answer} />
					</>
				)}
			</Mafs>
		</div>
	);
}

export default FourierScene;
