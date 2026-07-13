import { Mafs, Coordinates, Plot, Point, MovablePoint, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';
import { exactValue, maclaurinPartialSum, type MaclaurinFunction } from '../../../lib/math/maclaurin.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// DerivativeFunctionScene と同じ方針: 「主張」の値そのもの(真の値・近似値)は lib/math の
// 純粋関数を直接呼んで描画対象のデータとして使う(SimilarityScene の scaleFrom と同じ前例、
// 検証すべき主張ではなく描画対象のデータという位置づけ)。
//
// この単元の中核体験: 接線(1次近似、derivative-tangent-line の続き)の考え方を延長し、
// 近似多項式 P_n(x)(近似曲線)の次数 n を上げていくと、真の曲線 f(x) にどこまで
// 寄り添えるかを1つの図の上で観察する。評価点 x のマーカーは真の曲線上をドラッグでき、
// 動かすたびに同じ x での近似値の点も追従する。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。読者が直接操作する評価点 x(真の曲線上)は
// accent-primary、そこでの近似値の点は比較対象として accent-secondary 系統にする。
const COLORS = {
	trueCurve: Theme.foreground,
	approxCurve: Theme.indigo,
	trueMarker: Theme.blue,
	approxMarker: Theme.orange,
};

// 安全設計(タスク厳守事項): log1p(x=ln(1+x))は収束半径1しか持たないため、|x|>1 では
// 次数を上げるほど近似多項式の値が際限なく暴れる(例: x=3, degree=12 で値は約-32493、
// node での事前検算済み)。SequenceLimitScene の RANGE_CAP(オートスケールから外れ値を
// 除外する)と同じ発想を、ここでは「関数ごとに決め打ちの固定 viewBox」という
// DerivativeFunctionScene の前例と組み合わせる形で適用する: 親(Experiment層)が
// 関数ごとに固定した yMin/yMax を渡し、そのレンジを超える近似曲線の部分は
// Mafs の viewBox の外に出て単に見えなくなるだけで、クラッシュや例外は起きない。
export interface TaylorSceneProps {
	/** 対象関数。真の曲線 f(x) = exactValue(fn, x) と近似曲線 P_n(x) の両方を決める。 */
	fn: MaclaurinFunction;
	/** 近似多項式の次数 n。 */
	degree: number;
	/** 評価点 x の位置(読者がドラッグ・スライダーで操作する)。 */
	x: number;
	/** 評価点 x の可動範囲・グラフの表示範囲(関数ごとに異なる)。 */
	xMin: number;
	xMax: number;
	/** 表示レンジの y 範囲(関数ごとに親が決め打ちする、上記コメント参照)。 */
	yMin: number;
	yMax: number;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで x が変わったときのコールバック(親が clamp して state 化) */
	onXChange: (value: number) => void;
}

export function TaylorScene({
	fn,
	degree,
	x,
	xMin,
	xMax,
	yMin,
	yMax,
	interactive,
	onXChange,
}: TaylorSceneProps) {
	const trueFn = (t: number) => exactValue(fn, t);
	const approxFn = (t: number) => maclaurinPartialSum(fn, degree, t);

	const viewXLo = xMin - 0.5;
	const viewXHi = xMax + 0.5;

	// log1p の真の曲線は x<=-1 の域を描画しない(定義域外、タスク厳守事項)。
	// この単元の x の可動範囲(log1p は xMin=-0.9)は既に定義域内だが、viewBox 自体は
	// 見た目のマージン分(0.5)だけ左側に広がるため、真の曲線の描画ドメインだけは
	// -1 のすぐ内側で打ち切る(近似多項式は多項式なので定義域の制約を受けず、
	// viewXLo からそのまま描画してよい)。
	const trueDomainMin = fn === 'log1p' ? Math.max(viewXLo, -0.999) : viewXLo;

	const clampX = (value: number) => Math.min(xMax, Math.max(xMin, value));
	const constrainToTrueCurve: ConstraintFunction = ([px]) => {
		const cx = clampX(px);
		return [cx, trueFn(cx)];
	};

	const trueMarker: V2 = [x, trueFn(x)];
	const approxMarker: V2 = [x, approxFn(x)];

	return (
		<Mafs
			viewBox={{ x: [viewXLo, viewXHi], y: [yMin, yMax] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			<Plot.OfX y={trueFn} domain={[trueDomainMin, viewXHi]} color={COLORS.trueCurve} />
			<LaTeX at={[viewXHi - 0.6, Math.min(yMax - 0.4, Math.max(yMin + 0.4, trueFn(viewXHi - 0.6)))]} tex="f(x)" color={COLORS.trueCurve} />

			<Plot.OfX y={approxFn} domain={[viewXLo, viewXHi]} color={COLORS.approxCurve} />
			<LaTeX
				at={[
					viewXLo + 0.6,
					Math.min(yMax - 0.4, Math.max(yMin + 0.4, approxFn(viewXLo + 0.6))),
				]}
				tex="P_n(x)"
				color={COLORS.approxCurve}
			/>

			{interactive ? (
				<MovablePoint
					point={trueMarker}
					constrain={constrainToTrueCurve}
					color={COLORS.trueMarker}
					onMove={([nx]) => onXChange(nx)}
				/>
			) : (
				<Point x={trueMarker[0]} y={trueMarker[1]} color={COLORS.trueMarker} />
			)}
			<Point x={approxMarker[0]} y={approxMarker[1]} color={COLORS.approxMarker} />
		</Mafs>
	);
}
