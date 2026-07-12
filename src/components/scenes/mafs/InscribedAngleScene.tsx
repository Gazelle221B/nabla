import { Mafs, Coordinates, Circle, Line, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import type { Point2 } from '../../../lib/math/inscribedAngle.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// SimilarityScene / EigenvectorScene と同じ方針: 数学ロジックはこの層に持たず、円周上の点
// (center・radius・a・b・p)は親 (InscribedAngleExperiment) が lib/math/inscribedAngle.ts の
// pointOnCircle で計算した結果を props として受け取る(このファイルで Math.cos/Math.sin を
// 直接呼ばない)。
//
// 設計判断(ドラッグを持たない): 円周角の定理は「点 P が弦 AB に対する優弧上にある」ことが
// 成立条件であり、P を円周全体で自由にドラッグできると劣弧側へ越えて異なる関係
// (円周角 = π − 中心角/2)に切り替わってしまう。ドラッグの拘束関数で弧を跨がないよう
// 制約するのは角度のラップアラウンド処理が絡み複雑になるため、rule of three に沿い
// (SimilarityExperiment も同様の理由でドラッグを見送った)、この単元では P の操作を
// 角度スライダー+数値入力+矢印キーに限定する。P は常に pointOnCircle で計算されるため
// 「円周上を制約移動」というDoD要件は、ドラッグではなく計算による構造的な保証で満たす。
// P はスライダーの可動範囲(親 Experiment 側で優弧内に限定)に応じて円周上を実際に動く。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。
// 弦 AB・中心 O = accent-secondary(参照・固定される基準)。
// 円周角の2辺(P から A・B への線分)= accent-primary(読者が操作する結果、P の位置に連動)。
const COLORS = {
	circle: Theme.foreground,
	chord: Theme.indigo,
	center: Theme.foreground,
	centralRay: Theme.pink,
	inscribedRay: Theme.blue,
	point: Theme.blue,
};

export interface InscribedAngleSceneProps {
	/** 円の中心 O(固定) */
	center: Point2;
	/** 円の半径(固定) */
	radius: number;
	/** 弦の端点 A(固定) */
	a: Point2;
	/** 弦の端点 B(固定) */
	b: Point2;
	/** 円周角の頂点 P(可動、角度スライダーで操作) */
	p: Point2;
}

export function InscribedAngleScene({ center, radius, a, b, p }: InscribedAngleSceneProps) {
	const O: V2 = [center[0], center[1]];
	const A: V2 = [a[0], a[1]];
	const B: V2 = [b[0], b[1]];
	const P: V2 = [p[0], p[1]];

	const xLo = center[0] - radius - 1;
	const xHi = center[0] + radius + 1;
	const yLo = center[1] - radius - 1;
	const yHi = center[1] + radius + 1;

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 円周(弧 AB を含む円そのもの) */}
			<Circle center={O} radius={radius} color={COLORS.circle} fillOpacity={0} strokeOpacity={0.6} />

			{/* 弦 AB(固定・参照) */}
			<Line.Segment point1={A} point2={B} color={COLORS.chord} weight={2} />

			{/* 中心角 ∠AOB の2辺(補助線、固定・参照) */}
			<Line.Segment point1={O} point2={A} color={COLORS.centralRay} opacity={0.45} style="dashed" />
			<Line.Segment point1={O} point2={B} color={COLORS.centralRay} opacity={0.45} style="dashed" />

			{/* 円周角 ∠APB の2辺(P の位置に連動して動く、操作対象) */}
			<Line.Segment point1={P} point2={A} color={COLORS.inscribedRay} weight={2} />
			<Line.Segment point1={P} point2={B} color={COLORS.inscribedRay} weight={2} />

			<Point x={O[0]} y={O[1]} color={COLORS.center} />
			<LaTeX at={[O[0] - 0.4, O[1] - 0.4]} tex="O" color={COLORS.center} />

			<Point x={A[0]} y={A[1]} color={COLORS.chord} />
			<LaTeX at={[A[0] + 0.2, A[1] + 0.3]} tex="A" color={COLORS.chord} />

			<Point x={B[0]} y={B[1]} color={COLORS.chord} />
			<LaTeX at={[B[0] - 0.4, B[1] + 0.1]} tex="B" color={COLORS.chord} />

			<Point x={P[0]} y={P[1]} color={COLORS.point} />
			<LaTeX at={[P[0] + 0.2, P[1] - 0.4]} tex="P" color={COLORS.point} />
		</Mafs>
	);
}
