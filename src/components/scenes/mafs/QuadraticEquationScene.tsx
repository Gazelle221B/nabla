import { Mafs, Coordinates, Plot, Point, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import { evaluateStandard, realRoots } from '../../../lib/math/quadraticEquation.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// QuadraticFunctionScene / LinearTransformationScene と同じ方針: 数学の計算(多項式評価・
// 実数解の導出)は lib/math/quadraticEquation.ts の純粋関数へ委譲し、この層は導出済みの値を
// 描画するだけに留める(判定・分類ロジックはここでは行わない)。
//
// 中核体験: 放物線 y=ax^2+bx+c を上下に動かす(y切片 (0,c) をドラッグする)と、x軸との
// 交点(実数解)の個数が2→1→0と変わっていく。y切片は c そのものであり、y切片を垂直方向に
// ドラッグすることは「放物線を上下に動かす」ことと数学的に同じ操作 (a,b を変えず c だけが
// 変わる平行移動)。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// - 放物線・y切片(ドラッグ可能な操作対象) = accent-primary 系 (読者が直接操作する量)。
// - x軸(Coordinates.Cartesian が既に描画)は構造的な参照であり、追加の強調はしない。
// - 交点マーカーは「解」という導出された観察対象であり、正誤判定 (success/warning) の意味では
//   ないため、それらのトークンは流用せず専用の色 (green 系) を割り当てる
//   (LinearTransformationScene の reversed/preserved と同様、意味の異なる色を再利用しない)。
const COLORS = {
	curve: Theme.blue,
	yIntercept: Theme.blue,
	root: Theme.green,
};

export interface QuadraticEquationSceneProps {
	/** 二次の係数 (常に0を跨がない範囲で親が制約する) */
	a: number;
	/** 一次の係数 */
	b: number;
	/** 定数項(y切片、放物線を上下に動かす操作対象) */
	c: number;
	/** c の可動範囲 (ドラッグの制約に使う) */
	minC: number;
	maxC: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** y切片をドラッグしたとき (c が変わったとき) のコールバック */
	onCChange: (value: number) => void;
}

export function QuadraticEquationScene({
	a,
	b,
	c,
	minC,
	maxC,
	interactive,
	onCChange,
}: QuadraticEquationSceneProps) {
	const curve = (x: number): number => evaluateStandard(a, b, c, x);
	const roots = realRoots(a, b, c);

	// viewBox は頂点・交点・y切片がすべて収まる大きさに動的に決める(QuadraticFunctionScene と
	// 同じ考え方: 曲線自体は viewBox 外側で自然にクリップされるので全体を収める必要はない)。
	const vertexX = -b / (2 * a);
	const vertexY = curve(vertexX);
	const xs = [vertexX, 0, ...roots];
	const xLo = Math.min(...xs) - 3;
	const xHi = Math.max(...xs) + 3;
	const ys = [0, vertexY, c];
	const yLo = Math.min(...ys) - 2;
	const yHi = Math.max(...ys) + 2;

	const yInterceptPoint: V2 = [0, c];
	const clampC = (v: number) => Math.min(maxC, Math.max(minC, v));
	// y切片は常に x=0 に固定し、y=c だけを [minC,maxC] にクランプして動かす制約
	// (QuadraticFunctionScene の constrainShape と同じ考え方)。
	const constrainYIntercept: ConstraintFunction = ([, y]) => [0, clampC(y)];

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 放物線 y=ax^2+bx+c */}
			<Plot.OfX y={curve} color={COLORS.curve} />
			<LaTeX at={[xHi - 1.6, curve(xHi - 1.6)]} tex="y=ax^2+bx+c" color={COLORS.curve} />

			{/* x軸との交点(実数解): 0個・1個・2個のいずれか。判定はせず、導出済みの roots を
			    そのまま描画するだけ(数学的判定は lib/math 側で完結している)。 */}
			{roots.map((root, i) => (
				<Point key={i} x={root} y={0} color={COLORS.root} />
			))}
			{roots.length === 1 && <LaTeX at={[roots[0] + 0.2, 0.6]} tex="x" color={COLORS.root} />}
			{roots.length === 2 && (
				<>
					<LaTeX at={[roots[0] - 0.2, 0.6]} tex="x_1" color={COLORS.root} />
					<LaTeX at={[roots[1] + 0.2, 0.6]} tex="x_2" color={COLORS.root} />
				</>
			)}

			{/* y切片 (0, c): 予想確定後はドラッグ可能(放物線を上下に動かす操作)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={yInterceptPoint}
					constrain={constrainYIntercept}
					color={COLORS.yIntercept}
					onMove={([, y]) => onCChange(y)}
				/>
			) : (
				<Point x={yInterceptPoint[0]} y={yInterceptPoint[1]} color={COLORS.yIntercept} />
			)}
			<LaTeX at={[0.3, c + 0.5]} tex="(0,\ c)" color={COLORS.yIntercept} />
		</Mafs>
	);
}
