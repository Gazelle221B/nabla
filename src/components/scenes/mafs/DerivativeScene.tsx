import { Mafs, Coordinates, Plot, Line, Point, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// PythagorasScene と同じ方針: 数学的な「正しさの主張」(差分商・微分係数・接線/割線の式)は
// 一切ここに置かず、親 (DerivativeExperiment) が lib/math/derivative.ts で計算し済みの値
// (secantSlope, tangentSlope) を props として受け取って描画するだけの表示コンポーネント。
//
// 曲線の式 f(x) = x^2 のみはこの Tier 1 図解の描画関心として直書きする。MVP 1 は「関数を
// 選べる」DSL を先行設計しない (rule of three, DESIGN.md) ため、1 記事につき 1 つの具体例
// (f(x)=x^2) に固定する。PythagorasScene が正方形の頂点座標を描画のためだけに直書きしている
// のと同じ扱い。
const f = (x: number): number => x * x;

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークンを Mafs Theme へ対応づける。
// 点 a = accent-primary (読者が直接操作する量)。割線・a+h = 同系統 (a と h の操作から導かれる量)。
// 接線 = accent-secondary (h に関わらず a だけで定まる、比較の基準となる量)。
const COLORS = {
	curve: Theme.foreground,
	pointA: Theme.blue,
	pointAH: Theme.indigo,
	secant: Theme.indigo,
	tangent: Theme.orange,
};

export interface DerivativeSceneProps {
	/** 接点の x 座標 (読者がドラッグで操作する) */
	a: number;
	/** 割線のもう一方の点までの距離 (a + h) */
	h: number;
	/** 可動点 a の可動範囲 */
	minA: number;
	maxA: number;
	/**
	 * 接線の傾き (真の微分係数)。lib/math で計算済みの値を受け取るだけ。
	 * 割線はここでは傾きを受け取らず、(a, f(a)) と (a+h, f(a+h)) の2点から
	 * Line.ThroughPoints で直接描く(2点とも曲線上にあり幾何的に自明なため、
	 * 差分商の値を経由する必要がない)。
	 */
	tangentSlope: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで a が変わったときのコールバック (親が clamp して state 化) */
	onAChange: (value: number) => void;
}

export function DerivativeScene({
	a,
	h,
	minA,
	maxA,
	tangentSlope,
	interactive,
	onAChange,
}: DerivativeSceneProps) {
	const pointA: V2 = [a, f(a)];
	const pointAH: V2 = [a + h, f(a + h)];

	// 接線・割線を viewBox 全体に渡って描く2点を作る (Line.ThroughPoints は2点を通る無限直線)。
	const spread = maxA - minA + 2;
	const tangentP1: V2 = [a - spread, f(a) - tangentSlope * spread];
	const tangentP2: V2 = [a + spread, f(a) + tangentSlope * spread];

	// 可動点 a の制約: 曲線 y=x^2 上に拘束しつつ x を [minA, maxA] にクランプする
	// (退化・画面外の防止。PythagorasScene の軸拘束と同じ考え方の「曲線上への拘束」版)。
	const clamp = (x: number) => Math.min(maxA, Math.max(minA, x));
	const constrainToCurve: ConstraintFunction = ([x]) => {
		const cx = clamp(x);
		return [cx, f(cx)];
	};

	const lo = minA - 1;
	const hi = maxA + 3;

	return (
		<Mafs
			viewBox={{ x: [lo, hi], y: [-2, f(hi) * 0.55] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 曲線 f(x) = x^2 */}
			<Plot.OfX y={f} color={COLORS.curve} />
			<LaTeX at={[hi - 0.6, f(hi - 0.6) * 0.55]} tex="f(x)=x^2" color={COLORS.curve} />

			{/* 接線: a だけで定まる基準線 (h に依存しない) */}
			<Line.ThroughPoints point1={tangentP1} point2={tangentP2} color={COLORS.tangent} />

			{/* 割線: a と h から定まる、h を動かすたびに変わる線 */}
			<Line.ThroughPoints point1={pointA} point2={pointAH} color={COLORS.secant} style="dashed" />

			{/* a+h の点 (h スライダーで動く。ドラッグ対象ではない) */}
			<Point x={pointAH[0]} y={pointAH[1]} color={COLORS.pointAH} />
			<LaTeX at={[pointAH[0] + 0.15, pointAH[1] + 0.4]} tex="(a+h,\ f(a+h))" color={COLORS.pointAH} />

			{/* 接点 a: 予想確定後は可動点 (ドラッグ + 矢印キー)、確定前は静的な点 */}
			{interactive ? (
				<MovablePoint point={pointA} constrain={constrainToCurve} color={COLORS.pointA} onMove={([x]) => onAChange(x)} />
			) : (
				<Point x={pointA[0]} y={pointA[1]} color={COLORS.pointA} />
			)}
			<LaTeX at={[pointA[0] + 0.15, pointA[1] - 0.8]} tex="(a,\ f(a))" color={COLORS.pointA} />
		</Mafs>
	);
}
