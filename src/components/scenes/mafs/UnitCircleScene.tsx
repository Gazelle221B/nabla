import { Mafs, Coordinates, Circle, Line, Point, MovablePoint, Plot, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import { unitCirclePoint } from '../../../lib/math/trigonometry.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// EigenvectorScene / QuadraticFunctionScene と同じ方針: 数学ロジックはこの層に持たず、
// 単位円上の点の座標そのものは lib/math/trigonometry.ts の unitCirclePoint を使って計算する
// (Math.cos/Math.sin をこのファイルで直接呼ばない)。可動点のドラッグから角度への変換
// (Math.atan2)は EigenvectorScene と同じく親コンポーネント (TrigonometryExperiment) が担う
// —— このシーンは常に「点」を受け取り「点」を返す。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// 単位円上の点 = accent-primary(読者が直接操作する量)。
// cos・sin の射影線分は参照・導出される量(accent-secondary 系)として区別する。
const COLORS = {
	circle: Theme.foreground,
	point: Theme.blue,
	cosSegment: Theme.pink,
	sinSegment: Theme.indigo,
	arc: Theme.green,
};

// 角度を示す弧の半径(単位円そのものより小さく描き、単位円と区別する)。
const ARC_RADIUS = 0.35;

export interface UnitCircleSceneProps {
	/** 現在の角度 (ラジアン)。弧の描画にのみ使う (可動点の位置は point で受け取る)。 */
	theta: number;
	/** 単位円上の点 (cos θ, sin θ) */
	point: readonly [number, number];
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで点が動いたときのコールバック(親が Math.atan2 で角度へ変換して state 化) */
	onPointChange: (point: V2) => void;
}

// 可動点を単位円上へ拘束する制約関数 (EigenvectorScene の constrainToUnitCircle と同じ方針)。
// この関数はクロージャ状態を持たない純粋関数のため「直前の向き」を記憶できない。
// 原点(角度が数学的に定義できない一点)へドラッグされた場合は、NaN(0/0)を生まないよう
// 固定の既定角度 (1, 0) へ丸める。
const constrainToUnitCircle: ConstraintFunction = ([x, y]) => {
	const norm = Math.hypot(x, y);
	if (norm === 0) return [1, 0];
	return [x / norm, y / norm];
};

export function UnitCircleScene({ theta, point, interactive, onPointChange }: UnitCircleSceneProps) {
	const origin: V2 = [0, 0];
	const p: V2 = [point[0], point[1]];
	const foot: V2 = [point[0], 0]; // cos の足(x軸への垂線の足)

	return (
		<Mafs viewBox={{ x: [-1.6, 1.6], y: [-1.6, 1.6] }} preserveAspectRatio="contain" pan={false} zoom={false} height={420}>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 単位円: 点が拘束される軌道を示す補助線 */}
			<Circle center={origin} radius={1} color={COLORS.circle} fillOpacity={0} strokeOpacity={0.5} strokeStyle="dashed" />

			{/* 角度 θ を示す弧 (原点付近、0 から θ まで)。unitCirclePoint を再利用し、
			    このファイルで Math.cos/Math.sin を直接呼ばないようにする。 */}
			<Plot.Parametric
				xy={(t) => {
					const [ux, uy] = unitCirclePoint(t);
					return [ARC_RADIUS * ux, ARC_RADIUS * uy];
				}}
				domain={[Math.min(0, theta), Math.max(0, theta)]}
				color={COLORS.arc}
			/>

			{/* cos θ: x軸方向の射影 (原点 → 足) */}
			<Line.Segment point1={origin} point2={foot} color={COLORS.cosSegment} weight={3} />
			<LaTeX at={[point[0] / 2, -0.18]} tex="\cos\theta" color={COLORS.cosSegment} />

			{/* sin θ: y軸方向の射影 (足 → 点) */}
			<Line.Segment point1={foot} point2={p} color={COLORS.sinSegment} weight={3} />
			<LaTeX at={[point[0] + 0.12, point[1] / 2]} tex="\sin\theta" color={COLORS.sinSegment} />

			{/* 単位円上の点 (cosθ, sinθ): 予想確定後は可動点 (ドラッグ + 矢印キー)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint point={p} constrain={constrainToUnitCircle} color={COLORS.point} onMove={onPointChange} />
			) : (
				<Point x={p[0]} y={p[1]} color={COLORS.point} />
			)}
			<LaTeX at={[point[0] + 0.12, point[1] + 0.18]} tex="(\cos\theta,\ \sin\theta)" color={COLORS.point} />
		</Mafs>
	);
}
