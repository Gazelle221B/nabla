import { Mafs, Coordinates, Plot, Line, Point, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import { expBase, logBase } from '../../../lib/math/expLog.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// QuadraticEquationScene と同じ方針: 数学の計算(a^x・log_a x の評価)は lib/math/expLog.ts の
// 純粋関数へ委譲し、この層は導出済みの値を描画するだけに留める(判定・分類ロジックはここでは
// 行わない)。
//
// 中核体験: 指数関数 y=a^x のグラフと対数関数 y=log_a(x) のグラフを同時に描くと、後者は常に
// 前者を直線 y=x に関して鏡映したものになる。対応点 (t, a^t) を指数曲線上でドラッグすると、
// 鏡映点 (a^t, t) が対数曲線上に現れ、「a を何乗したら x になるか」という逆の問いへの立ち返り
// (a^(log_a x)=x / log_a(a^t)=t)を視覚的に確かめられる。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// - 指数曲線・ドラッグ可能な点(操作対象) = accent-primary 系 (読者が直接操作する量)。
// - 対数曲線・鏡映点(操作から導出される観察対象) = 区別できる第2の色(QuadraticEquationScene の
//   root と同じ考え方: 正誤判定ではないため success/warning は流用しない)。
// - y=x の破線(鏡映の軸そのもの)は固定される参照 = accent-secondary 系に相当する reference 色
//   (LinearTransformationScene の reference と同じ扱い)。
const COLORS = {
	expCurve: Theme.blue,
	logCurve: Theme.indigo,
	mirrorLine: Theme.foreground,
	expPoint: Theme.blue,
	logPoint: Theme.green,
};

export interface ExpLogSceneProps {
	/** 底(常に1に近づかない範囲・正の範囲を親が構造的に制約する) */
	a: number;
	/** 指数曲線上の対応点のパラメータ t(点は (t, a^t)) */
	t: number;
	/** t の可動範囲・量子化ステップ(ドラッグの制約に使う) */
	minT: number;
	maxT: number;
	stepT: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** 指数曲線上の点をドラッグしたとき (t が変わったとき) のコールバック */
	onTChange: (value: number) => void;
}

export function ExpLogScene({ a, t, minT, maxT, stepT, interactive, onTChange }: ExpLogSceneProps) {
	const expCurve = (x: number): number => expBase(a, x);
	// 対数曲線は x>0 でのみ定義される (logBase は x<=0 で RangeError を投げる、MATH_CONVENTIONS
	// §10: 数学的真実を緩めない)。Mafs の Plot.OfX は既定では viewBox 全体の x を走査してしまう
	// ため、レンダラー層の便宜として domain を正の範囲に限定する(lib/math 側の定義域は一切
	// 変更しない——これは描画のためのサンプリング範囲の制約であり、数学モデルの緩和ではない)。
	// 注意(GrokBuild C4): この Scene は props の a を自前検証せず、親(ExpLogExperiment)の
	// clamp(a∈[1.2,4])に依存している。a≤0 や a≈1 を渡すと logBase が throw するため、
	// 別の親から再利用する場合は同等の a の制約を必ず設けること。
	const logCurve = (x: number): number => logBase(a, x);

	const aValue = expBase(a, t);

	// viewBox は t の可動範囲・その指数値・鏡映点がすべて収まる正方形に動的に決める
	// (鏡映(y=x に関する対称性)を視覚的に自然に見せるため、x軸とy軸のスケールを揃える)。
	const candidateValues = [minT, maxT, 0, expBase(a, minT), expBase(a, maxT), t, aValue];
	const lo = Math.min(...candidateValues) - 1;
	const hi = Math.max(...candidateValues) + 1;

	const logDomainLo = Math.max(0.02, lo);
	const logDomainHi = Math.max(logDomainLo + 0.5, hi);

	const expPoint: V2 = [t, aValue];
	const logPoint: V2 = [aValue, t];

	const clampT = (v: number) => Math.min(maxT, Math.max(minT, v));
	// 指数曲線上の点は x=t を**スライダー・数値入力と同じ step へ量子化**してクランプする制約
	// (前単元 quadratic-equation のドラッグ量子化の学びを踏襲: 連続ドラッグだけ許すと、
	// スライダー/数値入力で作れる値と一致しない中途半端な t になり、観察表の表示と実際の
	// ドラッグ位置が食い違って見える)。
	const constrainToExpCurve: ConstraintFunction = ([x]) => {
		const qx = clampT(Math.round(x / stepT) * stepT);
		return [qx, expCurve(qx)];
	};

	return (
		<Mafs viewBox={{ x: [lo, hi], y: [lo, hi] }} preserveAspectRatio="contain" pan={false} zoom={false} height={420}>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 鏡映の軸そのもの: y=x の破線(固定される参照、操作対象ではない) */}
			<Line.ThroughPoints point1={[lo, lo]} point2={[hi, hi]} color={COLORS.mirrorLine} style="dashed" />
			<LaTeX at={[hi - 0.9, hi - 1.6]} tex="y=x" color={COLORS.mirrorLine} />

			{/* 指数曲線 y=a^x */}
			<Plot.OfX y={expCurve} color={COLORS.expCurve} />
			<LaTeX at={[hi - 1.5, expCurve(hi - 1.5)]} tex="y=a^x" color={COLORS.expCurve} />

			{/* 対数曲線 y=log_a(x)(x>0 の範囲のみ描く。lib/math 側の定義域はそのまま) */}
			<Plot.OfX y={logCurve} color={COLORS.logCurve} domain={[logDomainLo, logDomainHi]} />
			<LaTeX at={[logCurve(logDomainHi) + 0.3, logDomainHi - 1.2]} tex="y=\log_a x" color={COLORS.logCurve} />

			{/* 対応点のペア: (t, a^t) は指数曲線上の操作点、(a^t, t) はその鏡映(対数曲線上、導出値)。
			    2点を結ぶ破線で「同じ情報の鏡映」であることを視覚的に補強する。 */}
			<Line.Segment point1={expPoint} point2={logPoint} color={COLORS.mirrorLine} style="dashed" opacity={0.5} />

			{interactive ? (
				<MovablePoint
					point={expPoint}
					constrain={constrainToExpCurve}
					color={COLORS.expPoint}
					onMove={([x]) => onTChange(x)}
				/>
			) : (
				<Point x={expPoint[0]} y={expPoint[1]} color={COLORS.expPoint} />
			)}
			<LaTeX at={[expPoint[0] + 0.2, expPoint[1] + 0.5]} tex="(t,\ a^t)" color={COLORS.expPoint} />

			<Point x={logPoint[0]} y={logPoint[1]} color={COLORS.logPoint} />
			<LaTeX at={[logPoint[0] + 0.2, logPoint[1] + 0.5]} tex="(a^t,\ t)" color={COLORS.logPoint} />
		</Mafs>
	);
}
