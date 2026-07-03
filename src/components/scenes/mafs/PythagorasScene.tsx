import {
	Mafs,
	Coordinates,
	Polygon,
	Line,
	Point,
	MovablePoint,
	LaTeX,
	Theme,
	type ConstraintFunction,
} from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// 数学ロジックは持たず、親から受け取った脚の長さ (legA, legB) を描画するだけの純粋な
// 表示コンポーネント。lib/math には依存せず、座標系変換等の描画関心のみを扱う。
// 状態の単一の源は親 (InteractiveExperiment) の React state であり、可動点は controlled。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークンを Mafs Theme へ対応づける。
// legA/legB = accent-primary (読者が操作する量)、hyp = accent-secondary (結果として定まる量)。
const COLORS = {
	legA: Theme.blue,
	legB: Theme.indigo,
	hyp: Theme.orange,
	marker: Theme.foreground,
};

export interface PythagorasSceneProps {
	/** 直角をはさむ辺 a の長さ (x 軸方向) */
	legA: number;
	/** 直角をはさむ辺 b の長さ (y 軸方向) */
	legB: number;
	/** 可動点の最小・最大 (退化・画面外を防ぐ制約) */
	minLeg: number;
	maxLeg: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで辺 a が変わったときのコールバック (親が clamp して state 化) */
	onLegAChange: (value: number) => void;
	onLegBChange: (value: number) => void;
}

export function PythagorasScene({
	legA,
	legB,
	minLeg,
	maxLeg,
	interactive,
	onLegAChange,
	onLegBChange,
}: PythagorasSceneProps) {
	const O: V2 = [0, 0];
	const A: V2 = [legA, 0];
	const B: V2 = [0, legB];

	// 各辺の外側に立てた正方形 (三平方の定理の面積的な意味を可視化する)。
	// 脚 a の正方形は下側 (y<0)、脚 b の正方形は左側 (x<0)、斜辺の正方形は O と反対側。
	const squareA: V2[] = [
		[0, 0],
		[legA, 0],
		[legA, -legA],
		[0, -legA],
	];
	const squareB: V2[] = [
		[0, 0],
		[0, legB],
		[-legB, legB],
		[-legB, 0],
	];
	// 斜辺 AB に垂直で O から遠ざかる向きのベクトル (legB, legA) を使って正方形を張る。
	const squareC: V2[] = [
		A,
		B,
		[B[0] + legB, B[1] + legA],
		[A[0] + legB, A[1] + legA],
	];

	// 直角マーカー (O における a 辺と b 辺の直交を示す小さな正方形)。
	const markerSize = Math.min(0.4, minLeg * 0.4);
	const rightAngleMarker: V2[] = [
		[0, 0],
		[markerSize, 0],
		[markerSize, markerSize],
		[0, markerSize],
	];

	// 可動点の制約関数。a 辺は x 軸上 (y=0)、b 辺は y 軸上 (x=0) に拘束し、
	// [minLeg, maxLeg] にクランプする (直角三角形の維持 + 退化・画面外の防止)。
	const clamp = (v: number) => Math.min(maxLeg, Math.max(minLeg, v));
	const constrainA: ConstraintFunction = ([x]) => [clamp(x), 0];
	const constrainB: ConstraintFunction = ([, y]) => [0, clamp(y)];

	// viewBox は最大構成 (a=b=maxLeg のとき斜辺正方形が (2·maxLeg) 付近まで伸びる) を収める。
	const lo = -maxLeg - 1;
	const hi = 2 * maxLeg + 1;

	return (
		<Mafs
			viewBox={{ x: [lo, hi], y: [lo, hi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 面積の正方形 (半透明の塗り) */}
			<Polygon points={squareA} color={COLORS.legA} fillOpacity={0.12} strokeStyle="dashed" />
			<Polygon points={squareB} color={COLORS.legB} fillOpacity={0.12} strokeStyle="dashed" />
			<Polygon points={squareC} color={COLORS.hyp} fillOpacity={0.18} />

			{/* 直角三角形の輪郭と斜辺の強調 */}
			<Polygon points={[O, A, B]} color={COLORS.marker} fillOpacity={0} />
			<Line.Segment point1={A} point2={B} color={COLORS.hyp} />
			<Polygon points={rightAngleMarker} color={COLORS.marker} fillOpacity={0} weight={1} />

			{/* 面積ラベル (a^2 + b^2 = c^2 の各項) */}
			<LaTeX at={[legA / 2, -legA / 2]} tex="a^2" color={COLORS.legA} />
			<LaTeX at={[-legB / 2, legB / 2]} tex="b^2" color={COLORS.legB} />
			<LaTeX
				at={[(A[0] + B[0]) / 2 + legB / 2, (A[1] + B[1]) / 2 + legA / 2]}
				tex="c^2"
				color={COLORS.hyp}
			/>

			{/* 頂点: 予想確定後は可動点 (ドラッグ + 矢印キー)、確定前は静的な点 */}
			{interactive ? (
				<>
					<MovablePoint
						point={A}
						constrain={constrainA}
						color={COLORS.legA}
						onMove={([x]) => onLegAChange(x)}
					/>
					<MovablePoint
						point={B}
						constrain={constrainB}
						color={COLORS.legB}
						onMove={([, y]) => onLegBChange(y)}
					/>
				</>
			) : (
				<>
					<Point x={A[0]} y={A[1]} color={COLORS.legA} />
					<Point x={B[0]} y={B[1]} color={COLORS.legB} />
				</>
			)}
		</Mafs>
	);
}
