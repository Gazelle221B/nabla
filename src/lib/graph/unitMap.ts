// 単元マップ(/map/)のためのレイアウトロジック(AGENTS.md §5: React/描画ライブラリを
// 一切 import しない純粋 TypeScript)。DESIGN.md の未決事項「単元マップは記事20〜30本後に
// 導入」の実施(公開単元数がしきい値を超えたため導入)。
//
// 責務は2つ: (1) prerequisites から前提 DAG の深さを求める topologicalDepth、
// (2) 深さを行・subject を列内の並び順とした静的 SVG 用の座標を組み立てる
// buildUnitMapLayout。どちらも astro:content 等のフレームワーク API に依存せず、
// プレーンな UnitInput 配列だけを入力に取る(テスト・ビルド双方から同じ関数を呼べるため)。
//
// 循環検出(C-2 の防波堤): prerequisites.test.ts は「実在する ID を指すか」と
// 「自己参照(最小の循環)」のみを検証しており、A→B→C→A のような多段の循環は
// 未検証だった(実装前に確認済み)。この単元マップはビルド時に必ず全単元の深さを
// 計算するため、多段の循環があれば深さが定義できず無限再帰になる——それを防ぐため
// topologicalDepth は再帰スタック上の「訪問中」集合を持ち、循環を検出したら
// ビルドを止める例外を投げる(fail-open で孤立ノード扱いにはしない)。

/** 単元マップの入力単位。content collection の frontmatter から作る(id は entry.id と同じ形)。 */
export interface UnitInput {
	/** 単元 ID。"subject/slug" の名前空間(prerequisites が指す形式と同じ)。 */
	readonly id: string;
	readonly title: string;
	/** グループ化・色分けに使う分野キー(id の "/" より前の部分と一致させる)。 */
	readonly subject: string;
	/** 前提単元の ID の配列。実在しない ID を含む場合は topologicalDepth が例外を投げる。 */
	readonly prerequisites: readonly string[];
}

/**
 * 各単元の「深さ」(前提なし = 0、それ以外は前提の深さの最大値 + 1)を求める。
 *
 * 循環検出: DFS の再帰スタック上にある ID の集合(visiting)を保持し、そこに既にある ID を
 * 再訪したら循環と判定して throw する(メモ化用の depths とは別に持つ必要がある——
 * depths だけで判定すると「まだ深さが確定していない」を「循環している」と区別できない)。
 *
 * ダングリング参照検出: prerequisites が指す ID が units に存在しない場合も、曖昧に
 * NaN や undefined を伝播させず、ここで明示的に throw する(C-2 の「孤立ノード・
 * リンク切れ禁止」をこの関数自身でも防波堤にする。通常は prerequisites.test.ts が
 * 別経路で先に検出するはずだが、ここでも二重に守る)。
 */
export function topologicalDepth(units: readonly UnitInput[]): Map<string, number> {
	const byId = new Map(units.map((unit) => [unit.id, unit]));
	const depths = new Map<string, number>();
	const visiting = new Set<string>();

	function resolve(id: string, chain: readonly string[]): number {
		const cached = depths.get(id);
		if (cached !== undefined) return cached;

		if (visiting.has(id)) {
			const cycleStart = chain.indexOf(id);
			const cyclePath = [...chain.slice(cycleStart), id];
			throw new Error(
				`単元マップ: prerequisites に循環を検出しました(${cyclePath.join(' → ')})。` +
					`前提関係が閉路にならないよう見直してください。`,
			);
		}

		const unit = byId.get(id);
		if (!unit) {
			const referrer = chain[chain.length - 1] ?? '(トップレベル)';
			throw new Error(
				`単元マップ: 前提単元 "${id}" が実在しません(${referrer} から参照されています)。`,
			);
		}

		visiting.add(id);
		const nextChain = [...chain, id];
		const depth =
			unit.prerequisites.length === 0
				? 0
				: Math.max(...unit.prerequisites.map((prereqId) => resolve(prereqId, nextChain))) + 1;
		visiting.delete(id);
		depths.set(id, depth);
		return depth;
	}

	for (const unit of units) {
		resolve(unit.id, []);
	}

	return depths;
}

/** SVG 上のノード1つ(単元カード)の座標付きデータ。 */
export interface UnitMapNode {
	readonly id: string;
	readonly title: string;
	readonly subject: string;
	readonly depth: number;
	readonly x: number;
	readonly y: number;
}

/** SVG 上のエッジ1本(前提関係)。path は <path d="..."> にそのまま渡せる。 */
export interface UnitMapEdge {
	readonly from: string;
	readonly to: string;
	readonly path: string;
}

export interface UnitMapLayout {
	readonly nodes: readonly UnitMapNode[];
	readonly edges: readonly UnitMapEdge[];
	readonly width: number;
	readonly height: number;
	readonly rowCount: number;
}

/** ノードの寸法・間隔(px)。SVG の viewBox 計算とも共有するため定数として export する。 */
export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 56;
export const COLUMN_GAP = 20;
export const ROW_GAP = 72;
export const LAYOUT_PADDING = 24;

// 分野(subject)の表示順・日本語ラベル・色。AGENTS.md §6 のディレクトリ列挙順
// (geometry, algebra, calculus, linear-algebra, probability, discrete-math)と揃える。
// 色は Okabe-Ito の色覚多様性対応パレットから6色を選び、かつテキストラベル(subject名)を
// 必ず併記する(色だけに意味を持たせない——「色以外の区別」の要件)。
export const SUBJECT_ORDER: readonly string[] = [
	'geometry',
	'algebra',
	'calculus',
	'linear-algebra',
	'probability',
	'discrete-math',
];

export const SUBJECT_LABELS: Readonly<Record<string, string>> = {
	geometry: '幾何',
	algebra: '代数',
	calculus: '解析(微積分)',
	'linear-algebra': '線形代数',
	probability: '確率統計',
	'discrete-math': '離散数学',
};

export const SUBJECT_COLORS: Readonly<Record<string, string>> = {
	geometry: '#CC79A7',
	algebra: '#0072B2',
	calculus: '#D55E00',
	'linear-algebra': '#E69F00',
	probability: '#56B4E9',
	'discrete-math': '#009E73',
};

/** 未知の subject(将来ディレクトリが増えた場合)のフォールバック色。 */
const FALLBACK_SUBJECT_COLOR = '#888888';

export function subjectLabel(subject: string): string {
	return SUBJECT_LABELS[subject] ?? subject;
}

export function subjectColor(subject: string): string {
	return SUBJECT_COLORS[subject] ?? FALLBACK_SUBJECT_COLOR;
}

function subjectOrderIndex(subject: string): number {
	const index = SUBJECT_ORDER.indexOf(subject);
	return index === -1 ? SUBJECT_ORDER.length : index;
}

/**
 * 深さを行(0が最上段)、subject を列内の並び順とした2次元レイアウトを組み立てる。
 * 座標計算のみを行い、DOM/SVG の生成そのものは呼び出し側(Astro ページ)の責務とする
 * (このモジュールはフレームワーク非依存のまま保つ)。
 *
 * 循環・ダングリング参照があれば topologicalDepth がここで例外を投げ、ビルドが止まる。
 */
export function buildUnitMapLayout(units: readonly UnitInput[]): UnitMapLayout {
	const depths = topologicalDepth(units);

	const rowCount = units.length === 0 ? 0 : Math.max(...Array.from(depths.values())) + 1;

	const nodes: UnitMapNode[] = [];
	let maxColumnsInAnyRow = 0;

	for (let depth = 0; depth < rowCount; depth++) {
		const rowUnits = units
			.filter((unit) => depths.get(unit.id) === depth)
			.slice()
			.sort(
				(a, b) =>
					subjectOrderIndex(a.subject) - subjectOrderIndex(b.subject) ||
					a.title.localeCompare(b.title, 'ja'),
			);

		maxColumnsInAnyRow = Math.max(maxColumnsInAnyRow, rowUnits.length);

		rowUnits.forEach((unit, column) => {
			nodes.push({
				id: unit.id,
				title: unit.title,
				subject: unit.subject,
				depth,
				x: LAYOUT_PADDING + column * (NODE_WIDTH + COLUMN_GAP),
				y: LAYOUT_PADDING + depth * (NODE_HEIGHT + ROW_GAP),
			});
		});
	}

	const nodeById = new Map(nodes.map((node) => [node.id, node]));

	const edges: UnitMapEdge[] = [];
	for (const unit of units) {
		const target = nodeById.get(unit.id);
		if (!target) continue; // 到達不能(理論上は起きない。topologicalDepth が先に例外を投げるため)。
		for (const prereqId of unit.prerequisites) {
			const source = nodeById.get(prereqId);
			if (!source) continue; // 同上。
			const startX = source.x + NODE_WIDTH / 2;
			const startY = source.y + NODE_HEIGHT;
			const endX = target.x + NODE_WIDTH / 2;
			const endY = target.y;
			const midY = (startY + endY) / 2;
			edges.push({
				from: prereqId,
				to: unit.id,
				// 縦方向の3次ベジェ曲線: 同じ列同士は直線に、列が違う場合は緩やかなS字になり
				// 行内で重なるノード間のエッジが視覚的に区別しやすくなる。
				path: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`,
			});
		}
	}

	const width =
		maxColumnsInAnyRow === 0
			? LAYOUT_PADDING * 2
			: LAYOUT_PADDING * 2 + maxColumnsInAnyRow * NODE_WIDTH + (maxColumnsInAnyRow - 1) * COLUMN_GAP;
	const height =
		rowCount === 0
			? LAYOUT_PADDING * 2
			: LAYOUT_PADDING * 2 + rowCount * NODE_HEIGHT + (rowCount - 1) * ROW_GAP;

	return { nodes, edges, width, height, rowCount };
}
