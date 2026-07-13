import styles from './CombinatoricsEnumerationScene.module.css';

// Tier 1 の描画層 (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
//
// 設計判断(タスク厳守事項): この単元の本質は座標平面上の図形ではなく「列挙そのもの」
// (実際に数え上げた1件1件の並び方・選び方)なので、Mafs を無理に使わず、アクセシブルな
// HTML リスト(<ol>/<ul>)で列挙を可視化する。Tier 1 の趣旨(軽量な SVG/DOM 描画で足りるなら
// 座標系レンダラーを持ち出さない)に沿った選択であり、既存単元(Mafs 図解)とは描画技術が
// 異なるだけで、周囲のトークン・配色・フォーカス表現は既存単元(MATH_CONVENTIONS.md §9)を
// 踏襲する。数学の値そのものは lib/math/combinatorics.ts の純粋関数(親 Island 側)から
// 渡されたものをそのまま表示するだけで、この層で計算はしない(DESIGN.md の
// 「数学モデルと描画の分離」)。

export interface CombinatoricsEnumerationSceneProps {
	/** 表示モード: 順列(並べる、順序を区別する)か組合せ(選ぶだけ、順序を区別しない)か。 */
	mode: 'permutation' | 'combination';
	/** 列挙結果(enumeratePermutations/enumerateCombinations の戻り値をそのまま渡す)。 */
	tuples: readonly (readonly string[])[];
}

function formatTuple(tuple: readonly string[], mode: 'permutation' | 'combination'): string {
	if (tuple.length === 0) {
		return mode === 'permutation' ? '()' : '{}';
	}
	return mode === 'permutation' ? `(${tuple.join(', ')})` : `{${tuple.join(', ')}}`;
}

export function CombinatoricsEnumerationScene({ mode, tuples }: CombinatoricsEnumerationSceneProps) {
	const label =
		mode === 'permutation' ? `並べ方(順列)の一覧: ${tuples.length} 通り` : `選び方(組合せ)の一覧: ${tuples.length} 通り`;

	return (
		<div className={styles.enumerationScene}>
			<p className={styles.sceneCaption}>{label}</p>
			{/* 列挙数が多い(最大 6P6=720 通り)場合に備えてスクロール領域にする。
			    スクロール可能な領域はキーボードで操作できるよう tabIndex を与える
			    (axe: scrollable-region-focusable への対応)。 */}
			<div
				className={styles.enumerationList}
				role="group"
				aria-label={label}
				tabIndex={0}
			>
				<ol className={styles.chipList}>
					{tuples.map((tuple, i) => (
						<li key={i} className={styles.chip}>
							{formatTuple(tuple, mode)}
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}

export default CombinatoricsEnumerationScene;
