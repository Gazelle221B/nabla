import {
	Mafs,
	Coordinates,
	Plot,
	Line,
	Point,
	MovablePoint,
	LaTeX,
	Theme,
	type ConstraintFunction,
} from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// LinearFunctionScene / DerivativeScene と同じ方針: 数学ロジックは一切持たず、親
// (QuadraticFunctionExperiment) から受け取った a・p・q を描画するだけの表示コンポーネント。
// 放物線の式 y=a(x-p)^2+q の評価はこの層でも行うが、これは「描画のための評価」であり、
// lib/math/quadraticFunction.ts の evaluate と同一の式を独立に再実装している
// (LinearFunctionScene が y=a*x+b を描画のためだけに直書きしているのと同じ扱い、
// DESIGN.md の「数学モデルと描画の分離」)。

type V2 = [number, number];

const f = (a: number, p: number, q: number) => (x: number): number => {
	const dx = x - p;
	return a * dx * dx + q;
};

// MATH_CONVENTIONS.md §9 の意味論トークンを Mafs Theme へ対応づける。
// 頂点(p,q)と「開き」を操作する点 = accent-primary (読者が直接操作する量)。
// 対称軸は頂点から導かれる参照線なので accent-secondary 系。
const COLORS = {
	curve: Theme.blue,
	vertex: Theme.indigo,
	shape: Theme.foreground,
	axis: Theme.pink,
};

export interface QuadraticFunctionSceneProps {
	/** 開き方(2次の係数) */
	a: number;
	/** 頂点の x 座標 */
	p: number;
	/** 頂点の y 座標 */
	q: number;
	/** a・p・q それぞれの可動範囲 (退化・画面外を防ぐ制約) */
	minA: number;
	maxA: number;
	minP: number;
	maxP: number;
	minQ: number;
	maxQ: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで a が変わったときのコールバック (親が clamp して state 化) */
	onAChange: (value: number) => void;
	/** ドラッグで p が変わったときのコールバック (親が clamp して state 化) */
	onPChange: (value: number) => void;
	/** ドラッグで q が変わったときのコールバック (親が clamp して state 化) */
	onQChange: (value: number) => void;
}

export function QuadraticFunctionScene({
	a,
	p,
	q,
	minA,
	maxA,
	minP,
	maxP,
	minQ,
	maxQ,
	interactive,
	onAChange,
	onPChange,
	onQChange,
}: QuadraticFunctionSceneProps) {
	const fapq = f(a, p, q);

	// viewBox は a・p・q の可動範囲全体で、頂点と「開き」の点が常に画面内に収まるよう決める
	// (LinearFunctionScene と同じ考え方: 点の可動範囲から viewBox を逆算する)。
	// 曲線自体は viewBox の外側では自然に描画クリップされる(Mafs の既定動作、DerivativeScene
	// と同じ扱い)ため、曲線全体を収めようとして極端な a での爆発的な高さに合わせる必要はない。
	const xLo = minP - 4;
	const xHi = maxP + 4;
	const yCandidates = [minQ, maxQ, minA + minQ, minA + maxQ, maxA + minQ, maxA + maxQ];
	const yLo = Math.min(...yCandidates) - 1;
	const yHi = Math.max(...yCandidates) + 1;

	// 頂点点 (p, q): [minP,maxP]×[minQ,maxQ] にクランプして自由に (2次元) 動かす。
	const clampP = (v: number) => Math.min(maxP, Math.max(minP, v));
	const clampQ = (v: number) => Math.min(maxQ, Math.max(minQ, v));
	const clampA = (v: number) => Math.min(maxA, Math.max(minA, v));
	const constrainVertex: ConstraintFunction = ([x, y]) => [clampP(x), clampQ(y)];

	// 「開き」を操作する点は x=p+1 に固定し、y=a+q から a を逆算する制約
	// (y-q=a を [minA,maxA] にクランプ、LinearFunctionScene の slopePoint と同じ考え方)。
	const constrainShape: ConstraintFunction = ([, y]) => [p + 1, clampA(y - q) + q];

	const vertexPoint: V2 = [p, q];
	const shapePoint: V2 = [p + 1, a + q];
	// 対称軸 (x=p) を viewBox の上下いっぱいに引くための2点。
	const axisP1: V2 = [p, yLo];
	const axisP2: V2 = [p, yHi];

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 対称軸 x=p: 頂点から導かれる参照線(破線) */}
			<Line.ThroughPoints point1={axisP1} point2={axisP2} color={COLORS.axis} style="dashed" />
			<LaTeX at={[p + 0.2, yHi - 0.6]} tex="x=p" color={COLORS.axis} />

			{/* 放物線 y = a(x-p)^2 + q */}
			<Plot.OfX y={fapq} color={COLORS.curve} />
			<LaTeX at={[xHi - 2.4, fapq(xHi - 2.4)]} tex="y=a(x-p)^2+q" color={COLORS.curve} />

			{/* 頂点の点 (p, q): 予想確定後は可動点 (ドラッグ + 矢印キー、p・q を操作)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={vertexPoint}
					constrain={constrainVertex}
					color={COLORS.vertex}
					onMove={([x, y]) => {
						onPChange(x);
						onQChange(y);
					}}
				/>
			) : (
				<Point x={vertexPoint[0]} y={vertexPoint[1]} color={COLORS.vertex} />
			)}
			<LaTeX at={[vertexPoint[0] + 0.3, vertexPoint[1] - 0.7]} tex="(p,\ q)" color={COLORS.vertex} />

			{/* 「開き」の点 (p+1, a+q): 予想確定後は可動点 (ドラッグ + 矢印キー、a を操作)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={shapePoint}
					constrain={constrainShape}
					color={COLORS.shape}
					onMove={([, y]) => onAChange(y - q)}
				/>
			) : (
				<Point x={shapePoint[0]} y={shapePoint[1]} color={COLORS.shape} />
			)}
			<LaTeX at={[shapePoint[0] + 0.3, shapePoint[1] + 0.5]} tex="(p+1,\ a+q)" color={COLORS.shape} />
		</Mafs>
	);
}
