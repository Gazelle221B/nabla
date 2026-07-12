import {
	Mafs,
	Coordinates,
	Plot,
	Point,
	MovablePoint,
	LaTeX,
	Theme,
	type ConstraintFunction,
} from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// PythagorasScene / DerivativeScene と同じ方針: 数学ロジックは一切持たず、親
// (LinearFunctionExperiment) から受け取った傾き a・切片 b を描画するだけの表示コンポーネント。
// 直線の式 y=a*x+b の評価はこの層でも行うが、これは「描画のための評価」であり、
// lib/math/linearFunction.ts の evaluate と同一の式を独立に再実装している
// (PythagorasScene が正方形の頂点座標を描画のためだけに直書きしているのと同じ扱い、
// DESIGN.md の「数学モデルと描画の分離」)。

type V2 = [number, number];

const f = (a: number, b: number) => (x: number): number => a * x + b;

// MATH_CONVENTIONS.md §9 の意味論トークンを Mafs Theme へ対応づける。
// 直線・切片点 = accent-primary (読者が操作する量)。座標軸・原点は grid/foreground。
const COLORS = {
	line: Theme.blue,
	intercept: Theme.indigo,
	marker: Theme.foreground,
};

export interface LinearFunctionSceneProps {
	/** 傾き a */
	a: number;
	/** 切片 b */
	b: number;
	/** a・b それぞれの可動範囲 (退化・画面外を防ぐ制約) */
	minA: number;
	maxA: number;
	minB: number;
	maxB: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで a が変わったときのコールバック (親が clamp して state 化) */
	onAChange: (value: number) => void;
	/** ドラッグで b が変わったときのコールバック (親が clamp して state 化) */
	onBChange: (value: number) => void;
}

export function LinearFunctionScene({
	a,
	b,
	minA,
	maxA,
	minB,
	maxB,
	interactive,
	onAChange,
	onBChange,
}: LinearFunctionSceneProps) {
	const fab = f(a, b);

	// viewBox は a・b の可動範囲全体で直線が収まる矩形を計算する。
	// x は [minB,maxB] の範囲に依らず固定の表示域を使い、y はその両端 + 傾き最大時の
	// 高さを見積もって決める (a・b がともに最大・最小になっても線がはみ出さないよう、
	// 4隅の候補すべてを評価して最大絶対値を取る)。
	const xLo = -8;
	const xHi = 8;
	const aCandidates = [minA, maxA];
	const bCandidates = [minB, maxB];
	const xCandidates = [xLo, xHi];
	let yBound = Math.abs(maxB) + 1;
	for (const ca of aCandidates) {
		for (const cb of bCandidates) {
			for (const cx of xCandidates) {
				yBound = Math.max(yBound, Math.abs(ca * cx + cb) + 1);
			}
		}
	}

	// 切片点 (0, b) を、y 軸上 (x=0) に拘束しつつ [minB, maxB] にクランプして動かす。
	// 傾き a は切片点のドラッグでは変えられないため、別の点 (x=1 における点、
	// その y 座標が a+b) をドラッグして a を操作する可動点として用意する。
	const clampB = (v: number) => Math.min(maxB, Math.max(minB, v));
	const clampA = (v: number) => Math.min(maxA, Math.max(minA, v));
	const constrainIntercept: ConstraintFunction = ([, y]) => [0, clampB(y)];
	// slopePoint は x=1 に固定し、y=a+b から a を逆算する制約 (y-b=a を [minA,maxA] にクランプ)。
	const constrainSlope: ConstraintFunction = ([, y]) => [1, clampA(y - b) + b];

	const interceptPoint: V2 = [0, b];
	const slopePoint: V2 = [1, a + b];

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [-yBound, yBound] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 直線 y = a*x + b */}
			<Plot.OfX y={fab} color={COLORS.line} />
			<LaTeX at={[xHi - 2, fab(xHi - 2) + yBound * 0.08]} tex="y=ax+b" color={COLORS.line} />

			{/* y 切片の点 (0, b): 予想確定後は可動点 (ドラッグ + 矢印キー、b を操作)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={interceptPoint}
					constrain={constrainIntercept}
					color={COLORS.intercept}
					onMove={([, y]) => onBChange(y)}
				/>
			) : (
				<Point x={interceptPoint[0]} y={interceptPoint[1]} color={COLORS.intercept} />
			)}
			<LaTeX at={[interceptPoint[0] + 0.3, interceptPoint[1] + yBound * 0.08]} tex="(0,\ b)" color={COLORS.intercept} />

			{/* 傾きの点 (1, a+b): 予想確定後は可動点 (ドラッグ + 矢印キー、a を操作)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint
					point={slopePoint}
					constrain={constrainSlope}
					color={COLORS.marker}
					onMove={([, y]) => onAChange(y - b)}
				/>
			) : (
				<Point x={slopePoint[0]} y={slopePoint[1]} color={COLORS.marker} />
			)}
			<LaTeX at={[slopePoint[0] + 0.3, slopePoint[1] + yBound * 0.08]} tex="(1,\ a+b)" color={COLORS.marker} />
		</Mafs>
	);
}
