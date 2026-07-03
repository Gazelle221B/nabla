import { Mafs, Coordinates, Circle, Vector, MovablePoint, Point, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// PythagorasScene と同じ方針: 数学ロジックは持たず、親から受け取った角度 (angle) と
// 行列 (matrix) を描画するだけの純粋な表示コンポーネント。lib/math には依存しない
// (v・Av の実際の計算は親 (EigenvectorExperiment) が lib/math/eigen.ts で行い、
// 結果をこのコンポーネントへ props として渡す)。
// 状態の単一の源は親の React state であり、可動点は controlled (T3-1 と同じ SSOT 方針)。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。v = accent-primary (読者が操作する量)、
// Av = accent-secondary (結果として定まる量)、揃った瞬間は success で強調する。
const COLORS = {
	v: Theme.blue,
	av: Theme.indigo,
	aligned: Theme.green,
	circle: Theme.foreground,
};

export interface EigenvectorSceneProps {
	/** 行列 A (行優先) */
	matrix: readonly [readonly [number, number], readonly [number, number]];
	/** 現在の単位ベクトル v = (cos θ, sin θ) */
	v: readonly [number, number];
	/** A v (親が lib/math/eigen.ts の applyMatrix で計算した値) */
	av: readonly [number, number];
	/** v と Av が(スケール相対誤差内で)平行かどうか。true のとき視覚的に強調する */
	aligned: boolean;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで v が変わったときのコールバック(親が角度へ変換して state 化) */
	onVChange: (point: V2) => void;
}

// 可動点を単位円上へ拘束する制約関数。この関数はクロージャ状態を持たない純粋関数のため
// 「直前の向き」を記憶できない。原点(ゼロベクトル、角度が数学的に定義できない一点)へ
// ドラッグされた場合は、NaN(0/0)を生まないよう固定の既定角度 (1, 0) へ丸める。
const constrainToUnitCircle: ConstraintFunction = ([x, y]) => {
	const norm = Math.hypot(x, y);
	if (norm === 0) return [1, 0];
	return [x / norm, y / norm];
};

export function EigenvectorScene({ matrix, v, av, aligned, interactive, onVChange }: EigenvectorSceneProps) {
	const origin: V2 = [0, 0];
	const vPoint: V2 = [v[0], v[1]];
	const avPoint: V2 = [av[0], av[1]];

	// viewBox は |Av| の取りうる最大値(操作ノルムの上限 = フロベニウスノルム)を収める。
	const [[a, b], [c, d]] = matrix;
	const operatorBound = Math.sqrt(a * a + b * b + c * c + d * d);
	const bound = Math.max(2, Math.ceil(operatorBound) + 1);

	const avColor = aligned ? COLORS.aligned : COLORS.av;

	return (
		<Mafs
			viewBox={{ x: [-bound, bound], y: [-bound, bound] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 単位円: v が拘束される軌道を示す補助線 */}
			<Circle center={origin} radius={1} color={COLORS.circle} fillOpacity={0} strokeOpacity={0.5} strokeStyle="dashed" />

			{/* Av: 揃った瞬間は success 色で強調する */}
			<Vector tail={origin} tip={avPoint} color={avColor} weight={aligned ? 3 : 2} />
			<LaTeX at={[avPoint[0], avPoint[1]]} tex="Av" color={avColor} />

			{/* v: 予想確定後は可動点(ドラッグ + 矢印キー)、確定前は静的な点 */}
			<Vector tail={origin} tip={vPoint} color={COLORS.v} weight={2} />
			{interactive ? (
				<MovablePoint point={vPoint} constrain={constrainToUnitCircle} color={COLORS.v} onMove={onVChange} />
			) : (
				<Point x={vPoint[0]} y={vPoint[1]} color={COLORS.v} />
			)}
			<LaTeX at={[vPoint[0], vPoint[1]]} tex="v" color={COLORS.v} />
		</Mafs>
	);
}
