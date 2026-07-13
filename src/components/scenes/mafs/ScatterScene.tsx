import { Mafs, Coordinates, MovablePoint, Point, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, C-4: 散布図は Mafs の Point で十分、新規依存禁止)。
// DotProductScene / EigenvectorScene と同じ方針: 数学ロジックは持たず、親から受け取った点の
// 座標と平均点の座標を描画するだけの純粋な表示コンポーネント。lib/math には依存しない
// (平均・分散・相関の実際の計算は親 (DataAnalysisExperiment) が lib/math/statistics.ts で行い、
// 結果をこのコンポーネントへ props として渡す)。状態の単一の源は親の React state であり、
// 可動点は controlled (T3-1 以来の SSOT 方針)。
//
// この単元の中核体験: 散布図上の1点(可動点、外れ値候補)を動かすと、平均点 (x̄, ȳ) と
// 相関係数がどう変化するかを発見する。5点は固定(基準データ)、1点だけが可動。

type V2 = [number, number];
type ReadonlyV2 = readonly [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。movable = accent-primary(読者が操作する量)、
// fixed = accent-secondary(参照・固定される基準データ)、平均点は「全点から導かれる要約量」
// であり、読者の直接操作対象でも正誤フィードバックでもないため success/warning とは別の
// 中立トークン(Theme.orange、DerivativeScene の tangent 等「導出量」に使われる色系統)を使う。
const COLORS = {
	fixed: Theme.indigo,
	movable: Theme.blue,
	mean: Theme.orange,
};

// 可動点の可動域(DataAnalysisExperiment.tsx の X_MIN/X_MAX・Y_MIN/Y_MAX と一致させる)。
// ドラッグは整数へ量子化してからクランプする(QuadraticEquationScene の constrainYIntercept /
// CircleLineScene の constrainLine と同じ既存単元の方針。散布図の点は「値がぴったり揃う」
// 状態(全点同一xなど)を分かりやすく作れることが本単元の学習上重要なため、連続値ではなく
// 整数格子に量子化する)。
const MOVABLE_X_MIN = 0;
const MOVABLE_X_MAX = 10;
const MOVABLE_Y_MIN = -6;
const MOVABLE_Y_MAX = 14;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

const constrainMovablePoint: ConstraintFunction = ([x, y]) => [
	clamp(Math.round(x), MOVABLE_X_MIN, MOVABLE_X_MAX),
	clamp(Math.round(y), MOVABLE_Y_MIN, MOVABLE_Y_MAX),
];

export interface ScatterSceneProps {
	/** 固定点(非可動、基準データ)。5点前後を想定。 */
	fixedPoints: readonly ReadonlyV2[];
	/** 可動点(1点)。ドラッグ・矢印キー・スライダー・数値入力のいずれでも動く。 */
	movablePoint: ReadonlyV2;
	/** 平均点 (x̄, ȳ)。親が lib/math/statistics.ts の mean で計算した値。 */
	meanPoint: ReadonlyV2;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで可動点が変わったときのコールバック */
	onMovablePointChange: (point: [number, number]) => void;
}

export function ScatterScene({
	fixedPoints,
	movablePoint,
	meanPoint,
	interactive,
	onMovablePointChange,
}: ScatterSceneProps) {
	const movable: V2 = [movablePoint[0], movablePoint[1]];
	const mean: V2 = [meanPoint[0], meanPoint[1]];

	return (
		<Mafs
			viewBox={{ x: [-1, MOVABLE_X_MAX + 1], y: [MOVABLE_Y_MIN - 1, MOVABLE_Y_MAX + 1] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 固定点(基準データ、非可動) */}
			{fixedPoints.map((p, i) => (
				<Point key={`fixed-${i}`} x={p[0]} y={p[1]} color={COLORS.fixed} />
			))}

			{/* 平均点 (x̄, ȳ): 全点から導かれる要約量。固定点・可動点よりひと回り大きい円で
			    視覚的に区別する。 */}
			<Point x={mean[0]} y={mean[1]} color={COLORS.mean} svgCircleProps={{ r: 7 }} />
			<LaTeX at={[mean[0], mean[1] + 0.9]} tex="(\bar{x},\ \bar{y})" color={COLORS.mean} />

			{/* 可動点: 予想確定後は可動点(ドラッグ + 矢印キー)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={movable}
					constrain={constrainMovablePoint}
					color={COLORS.movable}
					onMove={onMovablePointChange}
				/>
			) : (
				<Point x={movable[0]} y={movable[1]} color={COLORS.movable} />
			)}
		</Mafs>
	);
}
