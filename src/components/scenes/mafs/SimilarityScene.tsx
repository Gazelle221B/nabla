import { Mafs, Coordinates, Polygon, Line, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import { scaleFrom, type Point2 } from '../../../lib/math/similarity.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// QuadraticFunctionScene / UnitCircleScene と同じ方針: 数学ロジックはこの層に持たず、
// 拡大後の各頂点の座標は lib/math/similarity.ts の scaleFrom を使って計算する
// (この層で center + k*(p-center) を直接書かない)。操作対象は相似比 k のみで、
// 元の三角形・相似の中心はこのシーンでは固定 (SimilarityExperiment 側の設計判断:
// rule of three に沿い、可動頂点は現時点で導入しない)。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// 元の三角形 = accent-secondary (参照・固定される基準図形)。
// 拡大後の三角形 = accent-primary (k の変化に応じて動く、読者が操作する結果)。
// 相似の中心・対応する辺を結ぶ補助線は控えめな色 (grid 相当) にする。
const COLORS = {
	original: Theme.indigo,
	scaled: Theme.blue,
	center: Theme.foreground,
	ray: Theme.foreground,
};

export interface SimilaritySceneProps {
	/** 相似の中心 */
	center: Point2;
	/** 元の三角形の3頂点 */
	original: readonly [Point2, Point2, Point2];
	/** 相似比(拡大縮小の比率) */
	k: number;
}

export function SimilarityScene({ center, original, k }: SimilaritySceneProps) {
	const c: V2 = [center[0], center[1]];
	const [p, q, r] = original;
	const op: V2 = [p[0], p[1]];
	const oq: V2 = [q[0], q[1]];
	const or_: V2 = [r[0], r[1]];

	// 拡大後の三角形の頂点は scaleFrom (lib/math) で計算する。描画層は座標変換のみ担う。
	const sp = scaleFrom(center, k, p);
	const sq = scaleFrom(center, k, q);
	const sr = scaleFrom(center, k, r);
	const sP: V2 = [sp[0], sp[1]];
	const sQ: V2 = [sq[0], sq[1]];
	const sR: V2 = [sr[0], sr[1]];

	// viewBox: 中心・元の三角形・k の可動範囲全体(呼び出し側で k は [0, 3] に制限される想定)で
	// 拡大後の頂点が画面内に収まるよう、想定される最大の相似比(3)で仮に計算しておく
	// (QuadraticFunctionScene と同じ「可動範囲全体から逆算する」考え方)。
	const MAX_K_FOR_VIEWBOX = 3;
	const farP = scaleFrom(center, MAX_K_FOR_VIEWBOX, p);
	const farQ = scaleFrom(center, MAX_K_FOR_VIEWBOX, q);
	const farR = scaleFrom(center, MAX_K_FOR_VIEWBOX, r);
	const xs = [c[0], op[0], oq[0], or_[0], farP[0], farQ[0], farR[0]];
	const ys = [c[1], op[1], oq[1], or_[1], farP[1], farQ[1], farR[1]];
	const xLo = Math.min(...xs) - 1;
	const xHi = Math.max(...xs) + 1;
	const yLo = Math.min(...ys) - 1;
	const yHi = Math.max(...ys) + 1;

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 相似の中心から各頂点を通る半直線(対応する頂点が同じ直線上にあることを示す補助線) */}
			<Line.Segment point1={c} point2={sP} color={COLORS.ray} opacity={0.35} style="dashed" />
			<Line.Segment point1={c} point2={sQ} color={COLORS.ray} opacity={0.35} style="dashed" />
			<Line.Segment point1={c} point2={sR} color={COLORS.ray} opacity={0.35} style="dashed" />

			{/* 拡大後の三角形 (半透明の塗り、k に応じて変化する) */}
			<Polygon points={[sP, sQ, sR]} color={COLORS.scaled} fillOpacity={0.12} />

			{/* 元の三角形 (固定・参照図形) */}
			<Polygon points={[op, oq, or_]} color={COLORS.original} fillOpacity={0.18} />

			{/* 相似の中心 */}
			<Point x={c[0]} y={c[1]} color={COLORS.center} />
			<LaTeX at={[c[0] - 0.3, c[1] - 0.4]} tex="O" color={COLORS.center} />

			{/* 頂点ラベル: 元の三角形 (A, B, C) と対応する拡大後の頂点 (A', B', C') */}
			<Point x={op[0]} y={op[1]} color={COLORS.original} />
			<Point x={oq[0]} y={oq[1]} color={COLORS.original} />
			<Point x={or_[0]} y={or_[1]} color={COLORS.original} />
			<LaTeX at={[op[0] - 0.35, op[1] + 0.25]} tex="A" color={COLORS.original} />
			<LaTeX at={[oq[0] + 0.15, oq[1] + 0.25]} tex="B" color={COLORS.original} />
			<LaTeX at={[or_[0] - 0.35, or_[1] + 0.25]} tex="C" color={COLORS.original} />

			<Point x={sP[0]} y={sP[1]} color={COLORS.scaled} />
			<Point x={sQ[0]} y={sQ[1]} color={COLORS.scaled} />
			<Point x={sR[0]} y={sR[1]} color={COLORS.scaled} />
			<LaTeX at={[sP[0] - 0.4, sP[1] + 0.3]} tex="A'" color={COLORS.scaled} />
			<LaTeX at={[sQ[0] + 0.15, sQ[1] + 0.3]} tex="B'" color={COLORS.scaled} />
			<LaTeX at={[sR[0] - 0.4, sR[1] + 0.3]} tex="C'" color={COLORS.scaled} />
		</Mafs>
	);
}
