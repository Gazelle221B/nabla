import { useMemo } from 'react';
import styles from './GraphScene.module.css';

// Tier 1 の描画層 (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
//
// 設計判断(タスク厳守事項): この単元の本質はグラフ(頂点と辺の接続関係)そのものであり、
// 座標平面上の関数や図形ではないため、Mafs(座標系レンダラー)を無理に使わず SVG を直接
// 記述する。CombinatoricsEnumerationScene(場合の数単元、Mafs を使わない DOM Scene の前例)
// と同じ判断: Tier 1 の趣旨(軽量な SVG/DOM 描画で足りるなら座標系レンダラーを持ち出さない)
// に沿う。頂点の位置は「見やすいレイアウト」であって座標平面上の量的な意味を持たないため、
// 軸・グリッドは描かない。数学の値(次数・判定結果)はすべて親 Island 側
// (GraphTheoryExperiment、graphTheory.ts の純粋関数)で計算し、この層はその結果をそのまま
// 表示するだけで計算はしない(DESIGN.md「数学モデルと描画の分離」)。
//
// 予想ゲートの規範(前単元 M8「数列の極限」PR #31 で確立): 図自体は予想ゲート確定前から
// 常時マウントするが、「答え」を構成する表示(ここでは次数の偶奇の色・ラベル)は
// `interactive` が真になる(=予想確定後)まで隠す。辺のON/OFFトグルも同様に、操作(=答えを
// 探る行為)そのものを予想確定後に限定する。

export interface GraphSceneProps {
	/** 頂点の総数(0..vertexCount-1)。 */
	vertexCount: number;
	/** 頂点の表示ラベル(A, B, C, … の見た目上のID。lib/math とは独立な表示専用の名前)。 */
	vertexLabels: readonly string[];
	/** 各頂点の描画座標(SVG viewBox 座標系)。 */
	positions: ReadonlyArray<readonly [number, number]>;
	/** プリセットが持つ辺の全リスト(固定インデックス、辺ID = 配列インデックス)。 */
	edges: ReadonlyArray<readonly [number, number]>;
	/** 現在ONになっている辺IDの集合。 */
	activeEdgeIds: ReadonlySet<number>;
	/** ON の辺だけで計算した各頂点の次数(graphTheory.ts の degrees をアクティブ部分グラフに
	 *  適用した結果を親から渡す。このコンポーネント自身は計算しない)。 */
	degrees: readonly number[];
	/** 辺をトグルする(親 Island の状態を更新する)。interactive が偽の間は呼ばれない。 */
	onToggleEdge: (edgeId: number) => void;
	/** 予想確定後かどうか。偽の間は辺のトグル操作と次数の偶奇表示(色・ラベル)を無効化する。 */
	interactive: boolean;
}

const VIEW_BOX = '0 0 200 200';
const VERTEX_RADIUS = 10;
const CURVE_SPACING = 16;
const HIT_AREA_HALF_WIDTH = 8;

// 多重辺(同じ頂点対を結ぶ複数の辺)は重ねて描くと見分けがつかなくなるため、二次ベジェ曲線で
// 分離する(タスク厳守事項)。同じ頂点対の辺が1本だけなら直線(オフセット0)のまま。
function curveOffsetFor(indexWithinGroup: number, groupSize: number): number {
	if (groupSize <= 1) return 0;
	const center = (groupSize - 1) / 2;
	return (indexWithinGroup - center) * CURVE_SPACING;
}

function pairKey(u: number, v: number): string {
	return u <= v ? `${u}-${v}` : `${v}-${u}`;
}

// クリック・キーボード操作の当たり判定(ヒット領域)を、細い <path> のstrokeではなく実際に
// 面積を持つ四角形(polygon)として作る。理由: SVG の getBoundingClientRect()/getBBox() は
// パスの生の頂点座標(stroke幅を含まない)だけで矩形を決めるため、完全に垂直・水平な辺
// (この単元の「田の字」プリセットに多数存在する)は幅または高さがちょうど0になり、
// ブラウザ・テストツールの両方から「見えている要素」とみなされず操作できなくなる
// (実機検証で発見: Playwright の isVisible()/クリックが幅0の要素で失敗する)。
// 線の両端を進行方向に垂直な向きへ half-width だけ広げた4頂点の四角形にすることで、
// 向きに関わらず常に正の幅・高さを持つ図形になる。
function hitAreaPolygonPoints(x1: number, y1: number, x2: number, y2: number, halfWidth: number): string {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const length = Math.hypot(dx, dy) || 1;
	const normalX = (-dy / length) * halfWidth;
	const normalY = (dx / length) * halfWidth;
	const points: [number, number][] = [
		[x1 + normalX, y1 + normalY],
		[x2 + normalX, y2 + normalY],
		[x2 - normalX, y2 - normalY],
		[x1 - normalX, y1 - normalY],
	];
	return points.map(([x, y]) => `${x},${y}`).join(' ');
}

export function GraphScene({
	vertexCount,
	vertexLabels,
	positions,
	edges,
	activeEdgeIds,
	degrees,
	onToggleEdge,
	interactive,
}: GraphSceneProps) {
	// 同じ頂点対を結ぶ辺をグループ化し、辺ごとの「グループ内インデックス」と「グループの
	// 大きさ」を求める(多重辺の曲線分離に使う)。
	const { edgeGroupIndex, groupSizeByEdge } = useMemo(() => {
		const seenCount = new Map<string, number>();
		const groupIndex = edges.map(([u, v]) => {
			const key = pairKey(u, v);
			const idx = seenCount.get(key) ?? 0;
			seenCount.set(key, idx + 1);
			return idx;
		});
		const totalByKey = new Map<string, number>();
		for (const [u, v] of edges) {
			const key = pairKey(u, v);
			totalByKey.set(key, (totalByKey.get(key) ?? 0) + 1);
		}
		const sizeByEdge = edges.map(([u, v]) => totalByKey.get(pairKey(u, v)) ?? 1);
		return { edgeGroupIndex: groupIndex, groupSizeByEdge: sizeByEdge };
	}, [edges]);

	// role="img" は「これ以上分解できない1枚の画像」を意味し、ARIA上フォーカス可能な
	// 子要素を持ってはいけない(axe: nested-interactive/no-focusable-content)。予想確定前
	// (interactive=false)は辺がフォーカス不可能なただの静止画なので role="img" のままでよいが、
	// 確定後(interactive=true)は辺が role="switch" のフォーカス可能な操作対象になるため、
	// 図全体は「スイッチの集まり」を表す role="group" に切り替える(aria-label はそのまま)。
	const sceneRole = interactive ? 'group' : 'img';

	return (
		<svg
			className={styles.graphScene}
			viewBox={VIEW_BOX}
			role={sceneRole}
			aria-label="グラフの図。頂点を丸、辺を線で表す。"
		>
			{edges.map(([u, v], edgeId) => {
				const [x1, y1] = positions[u];
				const [x2, y2] = positions[v];
				const groupSize = groupSizeByEdge[edgeId];
				const offset = curveOffsetFor(edgeGroupIndex[edgeId], groupSize);
				const isOn = activeEdgeIds.has(edgeId);

				const midX = (x1 + x2) / 2;
				const midY = (y1 + y2) / 2;
				const dx = x2 - x1;
				const dy = y2 - y1;
				const length = Math.hypot(dx, dy) || 1;
				const normalX = -dy / length;
				const normalY = dx / length;
				const controlX = midX + normalX * offset;
				const controlY = midY + normalY * offset;
				const path =
					offset === 0 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;

				const edgeLabel = `辺 ${vertexLabels[u]}-${vertexLabels[v]}${
					groupSize > 1 ? `(${edgeGroupIndex[edgeId] + 1}本目)` : ''
				}: ${isOn ? '通行可能' : '通行止め'}`;

				const toggle = () => {
					if (!interactive) return;
					onToggleEdge(edgeId);
				};

				return (
					<g
						key={edgeId}
						className={[!isOn && styles.edgeOff, interactive && styles.edgeInteractive].filter(Boolean).join(' ')}
						role={interactive ? 'switch' : undefined}
						aria-checked={interactive ? isOn : undefined}
						aria-label={interactive ? edgeLabel : undefined}
						tabIndex={interactive ? 0 : undefined}
						onClick={toggle}
						onKeyDown={(event) => {
							if (!interactive) return;
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								onToggleEdge(edgeId);
							}
						}}
					>
						{/* クリック・キーボード操作の当たり判定を広げる透明な四角形(実際に見える線は
						    下の edgeVisible)。polygon にする理由は hitAreaPolygonPoints のコメントを
						    参照(水平・垂直な辺でも bounding box が0にならないようにするため)。 */}
						<polygon
							points={hitAreaPolygonPoints(x1, y1, x2, y2, HIT_AREA_HALF_WIDTH)}
							className={styles.edgeHitArea}
						/>
						<path d={path} className={styles.edgeVisible} />
					</g>
				);
			})}

			{Array.from({ length: vertexCount }, (_, v) => {
				const [x, y] = positions[v];
				const deg = degrees[v];
				const isEven = deg % 2 === 0;
				// a11y: 偶奇の区別を色だけに頼らない。予想ゲート確定後のみ、色に加えて
				// 「偶」「奇」というテキストラベルを併記する(タスク厳守事項)。
				const parityLabel = isEven ? '偶' : '奇';

				return (
					<g key={v}>
						<circle
							cx={x}
							cy={y}
							r={VERTEX_RADIUS}
							className={interactive ? (isEven ? styles.vertexEven : styles.vertexOdd) : styles.vertexNeutral}
						/>
						<text x={x} y={y} className={styles.vertexLabel} textAnchor="middle" dominantBaseline="central">
							{vertexLabels[v]}
						</text>
						{interactive && (
							<text x={x} y={y + VERTEX_RADIUS + 11} className={styles.parityLabel} textAnchor="middle">
								{parityLabel}(次数{deg})
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

export default GraphScene;
