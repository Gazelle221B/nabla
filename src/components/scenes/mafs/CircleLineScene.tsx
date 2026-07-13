import { Mafs, Coordinates, Plot, Point, Circle, Line, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import {
	pointLineDistance,
	footOfPerpendicular,
	circleLineIntersections,
} from '../../../lib/math/circleLine.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// 数学の計算(距離・垂線の足・交点の導出)は lib/math/circleLine.ts の純粋関数へ委譲し、
// この層は導出済みの値を描画するだけに留める(判定・分類ロジックはここでは行わない)。
//
// 中核体験: 円(中心 (p,q)、半径 r)と直線 y=mx+k を動かすと、中心から直線までの距離 d と
// 半径 r の大小関係(d<r/d=r/d>r)が、交点の個数(2/1/0)と完全に対応する。中心から直線への
// 垂線(長さ d)を描くことで、この距離が視覚的に見える形にする。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// - 直線(ドラッグ可能な操作対象) = accent-primary 系(読者が直接操作する量)。
// - 円(固定された参照図形) = accent-secondary 系(比較対象・変化しない基準)。
// - 垂線(距離 d の可視化)・交点マーカーは導出された観察対象であり、正誤判定
//   (success/warning)の意味ではないため、それらのトークンは流用せず専用の色を割り当てる
//   (QuadraticEquationScene の root マーカーと同じ考え方)。
const COLORS = {
	circle: Theme.pink,
	line: Theme.blue,
	perpendicular: Theme.yellow,
	intersection: Theme.green,
};

export interface CircleLineSceneProps {
	/** 円の中心 */
	p: number;
	q: number;
	/** 円の半径(常に正、親が制約する) */
	r: number;
	/** 直線 y=mx+k の傾き */
	m: number;
	/** 直線の切片 */
	k: number;
	/** k の可動範囲(ドラッグの制約に使う) */
	minK: number;
	maxK: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** 直線をドラッグしたとき(k が変わったとき)のコールバック */
	onKChange: (value: number) => void;
}

export function CircleLineScene({
	p,
	q,
	r,
	m,
	k,
	minK,
	maxK,
	interactive,
	onKChange,
}: CircleLineSceneProps) {
	const line = (x: number): number => m * x + k;
	const d = pointLineDistance(p, q, m, k);
	const foot = footOfPerpendicular(p, q, m, k);
	const intersections = circleLineIntersections(p, q, r, m, k);

	// viewBox は円・直線の可動範囲(k)・垂線の足がすべて収まる大きさに動的に決める
	// (QuadraticEquationScene と同じ考え方)。
	const xs = [p - r, p + r, foot[0], ...intersections.map(([x]) => x)];
	const xLo = Math.min(...xs) - 2;
	const xHi = Math.max(...xs) + 2;
	const ys = [q - r, q + r, minK, maxK, foot[1], ...intersections.map(([, y]) => y)];
	const yLo = Math.min(...ys) - 2;
	const yHi = Math.max(...ys) + 2;

	// 直線上の1点(x=0)を操作対象にし、y=mx+k の切片 k をドラッグで動かす制約。
	// 量子化の根拠(二次方程式の学び、タスク厳守事項): ドラッグだけ連続値を許すと、d=r
	// (接する、この単元の核心)が測度ゼロの一点になりドラッグで踏めない。スライダー・
	// 数値入力(step=1)と同じ整数量子化に揃えることで、全入力経路で d=r をちょうど踏める
	// (m=0 の水平線配置において、circleLine.ts の設計コメントに詳細を記載)。
	const clampK = (v: number) => Math.min(maxK, Math.max(minK, v));
	const lineDragPoint: V2 = [0, k];
	const constrainLine: ConstraintFunction = ([, y]) => [0, clampK(Math.round(y))];

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 円: 中心 (p,q)、半径 r(参照図形、固定) */}
			<Circle center={[p, q]} radius={r} color={COLORS.circle} fillOpacity={0} />
			<Point x={p} y={q} color={COLORS.circle} />
			<LaTeX at={[p + r * 0.2, q + r * 0.75]} tex="(p,\ q),\ r" color={COLORS.circle} />

			{/* 直線 y=mx+k */}
			<Plot.OfX y={line} color={COLORS.line} />
			<LaTeX at={[xHi - 1.6, line(xHi - 1.6)]} tex="y=mx+k" color={COLORS.line} />

			{/* 中心から直線への垂線(距離 d の可視化) */}
			<Line.Segment point1={[p, q]} point2={[foot[0], foot[1]]} color={COLORS.perpendicular} />
			<Point x={foot[0]} y={foot[1]} color={COLORS.perpendicular} />
			{d > 0.001 && (
				<LaTeX
					at={[(p + foot[0]) / 2 + 0.3, (q + foot[1]) / 2 + 0.3]}
					tex="d"
					color={COLORS.perpendicular}
				/>
			)}

			{/* 交点: 0個・1個・2個のいずれか。判定はせず、導出済みの intersections を
			    そのまま描画するだけ(数学的判定は lib/math 側で完結している)。 */}
			{intersections.map(([x, y], i) => (
				<Point key={i} x={x} y={y} color={COLORS.intersection} />
			))}

			{/* 直線上の操作点(0, k): 予想確定後はドラッグ可能(直線を上下に動かす操作)、
			    確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={lineDragPoint}
					constrain={constrainLine}
					color={COLORS.line}
					onMove={([, y]) => onKChange(y)}
				/>
			) : (
				<Point x={lineDragPoint[0]} y={lineDragPoint[1]} color={COLORS.line} />
			)}
		</Mafs>
	);
}
