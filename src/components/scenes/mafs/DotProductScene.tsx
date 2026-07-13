import { Mafs, Coordinates, Vector, MovablePoint, Point, Polyline, LaTeX, Theme, type ConstraintFunction } from 'mafs';
import 'mafs/core.css';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
// EigenvectorScene と同じ方針: 数学ロジックは持たず、親から受け取ったベクトル a, b と
// 内積・なす角の計算結果を描画するだけの純粋な表示コンポーネント。lib/math には依存しない
// (実際の計算は親 (DotProductExperiment) が lib/math/dotProduct.ts で行い、結果を
// このコンポーネントへ props として渡す)。状態の単一の源は親の React state であり、
// 可動点は controlled (T3-1 と同じ SSOT 方針)。
//
// この単元の中核体験: 原点から伸びる2つのベクトル a, b のなす角を弧で示し、
// 直角(内積≈0)のときは弧の代わりに直角マーカー(小さな正方形)を表示して視覚的に強調する。

type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。a = accent-primary(読者が操作する量)、
// b = accent-secondary(参照・比較対象として動かすもう一方の量)、直角の瞬間は success で強調。
const COLORS = {
	a: Theme.blue,
	b: Theme.indigo,
	perpendicular: Theme.green,
	arc: Theme.foreground,
};

// 可動点を原点中心の円(半径 = 現在の大きさ)へ拘束する制約関数。ドラッグ後の点はこの円上に
// 留まり、大きさは変えず向きだけを変える(大きさはスライダー/数値入力側で別途操作する設計)。
// 原点(大きさ0、向きが定義できない一点)へドラッグされた場合は、既定の向き (radius, 0) へ
// 丸める(NaN(0/0)を生まない。EigenvectorScene の constrainToUnitCircle と同じ考え方)。
function makeConstrainToRadius(radius: number): ConstraintFunction {
	return ([x, y]) => {
		const norm = Math.hypot(x, y);
		if (norm === 0) return [radius, 0];
		return [(x / norm) * radius, (y / norm) * radius];
	};
}

// 親 (DotProductExperiment) は lib/math/dotProduct.ts の Vec2 (readonly タプル、
// MATH_CONVENTIONS §6) を扱うため、props はそれを受け付ける readonly 型にする。Mafs 側の
// Vector2 は mutable なタプル型のため、Mafs コンポーネントへ渡す直前に新しい mutable タプルへ
// コピーする(readonly を書き換えるわけではなく、値をコピーした別の配列を作るだけ)。
type ReadonlyV2 = readonly [number, number];

export interface DotProductSceneProps {
	/** ベクトル a = (ax, ay) */
	a: ReadonlyV2;
	/** ベクトル b = (bx, by) */
	b: ReadonlyV2;
	/** a と b のなす角(ラジアン、[0, π]。親が lib/math/dotProduct.ts の angleBetween で計算) */
	angle: number;
	/** dot(a, b) が(スケール相対誤差内で)0 かどうか。true のとき直角マーカーを表示する */
	isPerpendicular: boolean;
	/** 予想確定前は false: ドラッグ不可の静的表示にする */
	interactive: boolean;
	/** ドラッグで a が変わったときのコールバック(親が大きさ・角度へ変換して state 化) */
	onAChange: (point: V2) => void;
	/** ドラッグで b が変わったときのコールバック */
	onBChange: (point: V2) => void;
}

export function DotProductScene({
	a: aReadonly,
	b: bReadonly,
	angle,
	isPerpendicular,
	interactive,
	onAChange,
	onBChange,
}: DotProductSceneProps) {
	// Mafs の mutable Vector2 型へ渡すための独立したコピー(readonly の中身を書き換えるのではない)。
	const a: V2 = [aReadonly[0], aReadonly[1]];
	const b: V2 = [bReadonly[0], bReadonly[1]];
	const origin: V2 = [0, 0];
	const radiusA = Math.hypot(a[0], a[1]);
	const radiusB = Math.hypot(b[0], b[1]);

	// viewBox は a, b それぞれの大きさの最大値を収める(可動域全体で図が見切れないように)。
	const bound = Math.max(2, Math.ceil(Math.max(radiusA, radiusB)) + 1);

	const arcColor = isPerpendicular ? COLORS.perpendicular : COLORS.arc;

	// なす角の弧(原点中心、半径は a・b の短い方の半分程度に固定して見やすくする)。
	const arcRadius = Math.max(0.3, Math.min(radiusA, radiusB) * 0.35);
	const arcPoints: V2[] = [];
	const ARC_SEGMENTS = 24;
	const startAngle = Math.atan2(a[1], a[0]);
	// b 側へ向かう向き(短い方の回転方向)で弧を描く。angle は符号なしのなす角なので、
	// a から b への実際の回転方向(外積の符号)を別途求めて弧の向きを決める。
	const cross = a[0] * b[1] - a[1] * b[0];
	const sweep = cross >= 0 ? angle : -angle;
	for (let i = 0; i <= ARC_SEGMENTS; i++) {
		const t = startAngle + (sweep * i) / ARC_SEGMENTS;
		arcPoints.push([Math.cos(t) * arcRadius, Math.sin(t) * arcRadius]);
	}

	// 直角マーカー(原点を角にした小さな正方形)。a, b それぞれの単位方向ベクトルを使う。
	const unitA: V2 = radiusA > 0 ? [a[0] / radiusA, a[1] / radiusA] : [1, 0];
	const unitB: V2 = radiusB > 0 ? [b[0] / radiusB, b[1] / radiusB] : [0, 1];
	const markerSize = Math.max(0.2, Math.min(radiusA, radiusB) * 0.18);
	const markerP1: V2 = [unitA[0] * markerSize, unitA[1] * markerSize];
	const markerP3: V2 = [unitB[0] * markerSize, unitB[1] * markerSize];
	const markerP2: V2 = [markerP1[0] + markerP3[0], markerP1[1] + markerP3[1]];

	return (
		<Mafs
			viewBox={{ x: [-bound, bound], y: [-bound, bound] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={420}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{/* なす角の弧、または直角のときは弧の代わりに直角マーカー(小さな正方形)を表示する */}
			{isPerpendicular ? (
				// 正方形の4辺を折れ線で描く(原点 → markerP1 → markerP2 → markerP3 の経路が直角を示す)。
				<Polyline
					points={[origin, markerP1, markerP2, markerP3]}
					color={COLORS.perpendicular}
					weight={2}
					fillOpacity={0}
				/>
			) : (
				<Polyline points={arcPoints} color={arcColor} weight={1.5} fillOpacity={0} />
			)}

			{/* ベクトル a, b: 予想確定後は可動点(ドラッグ + 矢印キー)、確定前は静的な点 */}
			<Vector tail={origin} tip={a} color={COLORS.a} weight={2} />
			{interactive ? (
				<MovablePoint point={a} constrain={makeConstrainToRadius(radiusA)} color={COLORS.a} onMove={onAChange} />
			) : (
				<Point x={a[0]} y={a[1]} color={COLORS.a} />
			)}
			<LaTeX at={[a[0], a[1]]} tex="a" color={COLORS.a} />

			<Vector tail={origin} tip={b} color={COLORS.b} weight={2} />
			{interactive ? (
				<MovablePoint point={b} constrain={makeConstrainToRadius(radiusB)} color={COLORS.b} onMove={onBChange} />
			) : (
				<Point x={b[0]} y={b[1]} color={COLORS.b} />
			)}
			<LaTeX at={[b[0], b[1]]} tex="b" color={COLORS.b} />
		</Mafs>
	);
}
