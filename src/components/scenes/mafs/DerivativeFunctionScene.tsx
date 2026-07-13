import { Mafs, Coordinates, Plot, Line, Point, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import { evaluatePoly, type Polynomial } from '../../../lib/math/derivativeFunction.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// DerivativeScene (M2) と同じ方針: 「主張」の値 (接線の傾き = f'(a)) は親
// (DerivativeFunctionExperiment) が lib/math/derivative.ts + derivativeFunction.ts で
// 計算済みのものを props で受け取り、この層はそれを描画するだけ。
//
// 一方、曲線そのものの形 (f(x) の係数 coeffs, f'(x) の係数 derivCoeffs) は「描画対象の
// データ」であって「検証すべき主張」ではないため、SimilarityScene の scaleFrom /
// UnitCircleScene の unitCirclePoint と同じ前例に倣い、evaluatePoly (lib/math の座標計算
// ユーティリティ) をこの層で直接呼んで2つの曲線 (f, f') を描く。
//
// この単元の中核体験: 上段で点 a を動かすと接線の傾きが変わり、その値 f'(a) を y 座標とする
// 点 (a, f'(a)) が下段のグラフ上を動く。下段には f'(x) の曲線もあらかじめ描いておくことで、
// 「点 a を動かすたびに、下段の点が f'(x) の曲線上をなぞって別のグラフを描いていく」ことを
// 視覚的に確認できる。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// 点 a = accent-primary (読者が直接操作する量、上段・下段の両方でこの色に揃える)。
// 接線 = accent-secondary (a だけで定まる比較の基準)。f(x)・f'(x) の曲線自体は控えめな前景色。
const COLORS = {
	curve: Theme.foreground,
	derivativeCurve: Theme.indigo,
	pointA: Theme.blue,
	tangent: Theme.orange,
};

export interface DerivativeFunctionSceneProps {
	/** f(x) の係数 (昇べきの順)。この Scene では描画対象のデータとして受け取る。 */
	coeffs: Polynomial;
	/** f'(x) の係数 (親が exactDerivativePoly で計算済み)。下段のグラフ描画に使う。 */
	derivCoeffs: Polynomial;
	/** 接点 a の x 座標 (読者がドラッグ・スライダーで操作する) */
	a: number;
	/** 可動点 a の可動範囲 (関数ごとに異なる) */
	minA: number;
	maxA: number;
	/** 上段の viewBox の y 範囲 (関数ごとに親が決め打ちする。rule of three: 2関数のみ扱う) */
	fYMin: number;
	fYMax: number;
	/** 下段の viewBox の y 範囲 */
	derivativeYMin: number;
	derivativeYMax: number;
	/** 接線の傾き = f'(a) の値 (親が derivative.ts で計算済みの「主張」の値) */
	tangentSlope: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで a が変わったときのコールバック (親が clamp して state 化) */
	onAChange: (value: number) => void;
}

export function DerivativeFunctionScene({
	coeffs,
	derivCoeffs,
	a,
	minA,
	maxA,
	fYMin,
	fYMax,
	derivativeYMin,
	derivativeYMax,
	tangentSlope,
	interactive,
	onAChange,
}: DerivativeFunctionSceneProps) {
	const f = (x: number): number => evaluatePoly(coeffs, x);
	const fPrime = (x: number): number => evaluatePoly(derivCoeffs, x);

	const pointA: V2 = [a, f(a)];
	const pointOnDerivativeCurve: V2 = [a, tangentSlope];

	// 接線: 上段 viewBox 全体に渡って描く2点 (Line.ThroughPoints は2点を通る無限直線)。
	const spread = maxA - minA + 2;
	const tangentP1: V2 = [a - spread, f(a) - tangentSlope * spread];
	const tangentP2: V2 = [a + spread, f(a) + tangentSlope * spread];

	// 可動点 a の制約: 曲線 y=f(x) 上に拘束しつつ x を [minA, maxA] にクランプする
	// (DerivativeScene と同じ「曲線上への拘束」)。
	const clamp = (x: number) => Math.min(maxA, Math.max(minA, x));
	const constrainToCurve: ConstraintFunction = ([x]) => {
		const cx = clamp(x);
		return [cx, f(cx)];
	};

	const xLo = minA - 0.5;
	const xHi = maxA + 0.5;

	return (
		<div>
			{/* 上段: f(x) のグラフ + 動点 a での接線 */}
			<Mafs
				viewBox={{ x: [xLo, xHi], y: [fYMin, fYMax] }}
				preserveAspectRatio="contain"
				pan={false}
				zoom={false}
				height={260}
			>
				<Coordinates.Cartesian subdivisions={false} />
				<Plot.OfX y={f} color={COLORS.curve} />
				<LaTeX at={[xHi - 0.6, f(xHi - 0.6)]} tex="f(x)" color={COLORS.curve} />
				<Line.ThroughPoints point1={tangentP1} point2={tangentP2} color={COLORS.tangent} />
				{interactive ? (
					<MovablePoint
						point={pointA}
						constrain={constrainToCurve}
						color={COLORS.pointA}
						onMove={([x]) => onAChange(x)}
					/>
				) : (
					<Point x={pointA[0]} y={pointA[1]} color={COLORS.pointA} />
				)}
				<LaTeX at={[pointA[0] + 0.15, pointA[1] + 0.5]} tex="(a,\ f(a))" color={COLORS.pointA} />
			</Mafs>

			{/* 下段: 導関数 f'(x) のグラフ + 現在の点 (a, f'(a))。
			    a を動かすたびにこの点が f'(x) の曲線上を動くことで、「各点の接線の傾きを
			    集めると別のグラフになる」という中核体験を示す。 */}
			<Mafs
				viewBox={{ x: [xLo, xHi], y: [derivativeYMin, derivativeYMax] }}
				preserveAspectRatio="contain"
				pan={false}
				zoom={false}
				height={260}
			>
				<Coordinates.Cartesian subdivisions={false} />
				<Plot.OfX y={fPrime} color={COLORS.derivativeCurve} />
				<LaTeX at={[xHi - 0.6, fPrime(xHi - 0.6)]} tex="f'(x)" color={COLORS.derivativeCurve} />
				<Point x={pointOnDerivativeCurve[0]} y={pointOnDerivativeCurve[1]} color={COLORS.pointA} />
				<LaTeX
					at={[pointOnDerivativeCurve[0] + 0.15, pointOnDerivativeCurve[1] + 0.5]}
					tex="(a,\ f'(a))"
					color={COLORS.pointA}
				/>
			</Mafs>
		</div>
	);
}
