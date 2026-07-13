import { Mafs, Coordinates, Polygon, Vector, MovablePoint, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import { applyMatrix, determinant, type Matrix2x2, type Vector2 } from '../../../lib/math/linearTransformation.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// この単元は「行列の成分そのもの」が操作対象であり、他単元の 2 ベクトル間の関係とは違って
// 表示すべき図形(変換後の平行四辺形・基底ベクトルの像)を親から個別に受け取るより、
// matrix 1つを受け取ってこの層で lib/math/linearTransformation.ts の純粋関数(applyMatrix・
// determinant)を呼び出し、単位正方形・Ae₁・Ae₂ を導出する方が props 面が単純になる
// (タスク要件: 「lib/math を使う」)。数学的な判定・分類ロジック(det の符号による向き反転
// の判定そのもの)はここでは行わず、導出した値をそのまま色分けに使うだけの表示専用処理に
// 留める(EigenvectorScene / DotProductScene と同じ「表示は表示、判定は他層」という分離)。
// 状態の単一の源は親 (LinearTransformationExperiment) の React state (a,b,c,d) であり、
// 可動点は controlled (T3-1 と同じ SSOT 方針): ドラッグしても matrix 自体は親から降ってくる。

type V2 = [number, number];

function toV2(p: Vector2): V2 {
	return [p[0], p[1]];
}

// MATH_CONVENTIONS.md §9 の意味論トークン。
// - reference (変換前の単位正方形) は「参照・固定される」構造的な補助線であり、値そのものの
//   意味は持たないため grid/axis と同じ抑えた色調にする(accent-secondary は流用しない —
//   あちらは「比較対象として動く/意味のある固定量」向けであり、単位正方形は単なる幾何的な
//   目盛りの役割のため)。
// - Ae₁・Ae₂ は行列の列そのもの(読者が a,b,c,d を操作すると直接動く量)なので accent-primary
//   系の2色(既存単元の a/b, v/Av と同じ blue/indigo のペア)。
// - 変換後の平行四辺形は、向き保持(det≥0)/向き反転(det<0)という「正誤ではない状態の分岐」
//   を表すため、success/warning(正誤判定専用、MATH_CONVENTIONS §9)を流用せず、
//   専用の2色(blue系=保持 / pink系=反転)を割り当てる。さらに色だけに頼らず破線
//   (strokeStyle) も変えることで、色を判別しにくい読者にも伝わるようにする。
const COLORS = {
	reference: Theme.foreground,
	preserved: Theme.blue,
	reversed: Theme.pink,
	ae1: Theme.blue,
	ae2: Theme.indigo,
};

const UNIT_SQUARE: readonly Vector2[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];

export interface LinearTransformationSceneProps {
	/** 行列 A = [[a,b],[c,d]] */
	matrix: Matrix2x2;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** Ae₁ (行列の1列目 (a,c)) をドラッグしたときのコールバック */
	onColumn1Change: (point: V2) => void;
	/** Ae₂ (行列の2列目 (b,d)) をドラッグしたときのコールバック */
	onColumn2Change: (point: V2) => void;
}

export function LinearTransformationScene({
	matrix,
	interactive,
	onColumn1Change,
	onColumn2Change,
}: LinearTransformationSceneProps) {
	const origin: V2 = [0, 0];
	const transformedSquare = UNIT_SQUARE.map((p) => toV2(applyMatrix(matrix, p)));
	const ae1 = toV2(applyMatrix(matrix, [1, 0]));
	const ae2 = toV2(applyMatrix(matrix, [0, 1]));
	const det = determinant(matrix);
	const reversed = det < 0;
	const shapeColor = reversed ? COLORS.reversed : COLORS.preserved;

	// viewBox は単位正方形・変換後の図形・基底ベクトルの像すべてを収める大きさにする。
	const extents = [
		...UNIT_SQUARE,
		...transformedSquare,
		ae1,
		ae2,
	].flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]);
	const bound = Math.max(2, Math.ceil(Math.max(1, ...extents)) + 1);

	return (
		<Mafs
			viewBox={{ x: [-bound, bound], y: [-bound, bound] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* 参照: 変換前の単位正方形(薄く表示、固定・非対話) */}
			<Polygon
				points={UNIT_SQUARE.map(toV2)}
				color={COLORS.reference}
				fillOpacity={0.04}
				strokeOpacity={0.4}
				weight={1}
				strokeStyle="dashed"
			/>

			{/* 変換後: 平行四辺形。det<0 のとき色 + 破線の両方で向き反転を示す
			    (色だけに頼らないアクセシビリティ配慮)。 */}
			<Polygon
				points={transformedSquare}
				color={shapeColor}
				fillOpacity={0.2}
				weight={2}
				strokeStyle={reversed ? 'dashed' : 'solid'}
			/>

			{/* 基底ベクトルの像 Ae₁ = (a,c): 予想確定後はドラッグ可能(行列の1列目を直接操作) */}
			<Vector tail={origin} tip={ae1} color={COLORS.ae1} weight={2} />
			{interactive ? (
				<MovablePoint point={ae1} color={COLORS.ae1} onMove={onColumn1Change} />
			) : (
				<Point x={ae1[0]} y={ae1[1]} color={COLORS.ae1} />
			)}
			<LaTeX at={ae1} tex="Ae_1" color={COLORS.ae1} />

			{/* 基底ベクトルの像 Ae₂ = (b,d) */}
			<Vector tail={origin} tip={ae2} color={COLORS.ae2} weight={2} />
			{interactive ? (
				<MovablePoint point={ae2} color={COLORS.ae2} onMove={onColumn2Change} />
			) : (
				<Point x={ae2[0]} y={ae2[1]} color={COLORS.ae2} />
			)}
			<LaTeX at={ae2} tex="Ae_2" color={COLORS.ae2} />
		</Mafs>
	);
}
