import { Mafs, Coordinates, Polygon, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import type { Point2 } from '../../../lib/math/lawOfSinesCosines.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// SimilarityScene / InscribedAngleScene と同じ方針: 数学ロジックはこの層に持たず、
// 三角形の3頂点(vertexA・vertexB・vertexC)は親 (LawOfSinesCosinesExperiment) が
// lib/math/lawOfSinesCosines.ts の計算結果として渡す座標をそのまま描画する
// (このファイルで sideLength/angleAtVertex/lawOfCosinesSide を呼ばない)。
//
// 設計判断(viewBox を動的に計算する): SimilarityScene は k の可動範囲全体から逆算した
// 固定 viewBox を使うが、この単元は3つの独立した形状パラメータ(b, c, 角A)を持ち、
// 可動範囲全体を逆算すると常に大きく間延びした box になり手元の三角形が小さく
// 見えてしまう。ここでは現在の3頂点から都度 viewBox を計算する(Simplicity First:
// 形状変化に応じて視野が多少変わることを許容し、複雑な「最大範囲の逆算」を避ける)。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。この単元には「固定される参照図形」がなく、
// 三角形そのものが読者の操作対象なので、辺・頂点は accent-primary 相当の色で統一する。
const COLORS = {
	triangle: Theme.blue,
	vertex: Theme.foreground,
	sideLabel: Theme.indigo,
};

export interface LawOfSinesCosinesSceneProps {
	/** 頂点 A(内角 A の頂点) */
	vertexA: Point2;
	/** 頂点 B(内角 B の頂点) */
	vertexB: Point2;
	/** 頂点 C(内角 C の頂点) */
	vertexC: Point2;
}

export function LawOfSinesCosinesScene({ vertexA, vertexB, vertexC }: LawOfSinesCosinesSceneProps) {
	const A: V2 = [vertexA[0], vertexA[1]];
	const B: V2 = [vertexB[0], vertexB[1]];
	const C: V2 = [vertexC[0], vertexC[1]];

	const xs = [A[0], B[0], C[0]];
	const ys = [A[1], B[1], C[1]];
	const PADDING = 1.5;
	const xLo = Math.min(...xs) - PADDING;
	const xHi = Math.max(...xs) + PADDING;
	const yLo = Math.min(...ys) - PADDING;
	const yHi = Math.max(...ys) + PADDING;

	// 辺のラベル(a, b, c)を中点付近に置くための単純な平均(描画レイアウトの都合であり、
	// lib/math の距離計算とは無関係)。
	const midBC: V2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
	const midCA: V2 = [(C[0] + A[0]) / 2, (C[1] + A[1]) / 2];
	const midAB: V2 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [yLo, yHi] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={440}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 三角形 ABC(操作対象、b・c・角A の変化に応じて再描画される) */}
			<Polygon points={[A, B, C]} color={COLORS.triangle} fillOpacity={0.12} weight={2} />

			<LaTeX at={[A[0] - 0.4, A[1] + 0.3]} tex="A" color={COLORS.vertex} />
			<LaTeX at={[B[0] + 0.15, B[1] + 0.3]} tex="B" color={COLORS.vertex} />
			<LaTeX at={[C[0] - 0.15, C[1] + 0.3]} tex="C" color={COLORS.vertex} />

			{/* 対辺のラベル(a=BC, b=CA, c=AB) */}
			<LaTeX at={midBC} tex="a" color={COLORS.sideLabel} />
			<LaTeX at={midCA} tex="b" color={COLORS.sideLabel} />
			<LaTeX at={midAB} tex="c" color={COLORS.sideLabel} />
		</Mafs>
	);
}
