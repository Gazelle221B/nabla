import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { topologicalDepth, buildUnitMapLayout, type UnitInput } from '../unitMap';

// 実データ(src/content/lessons/**/*.mdx)の frontmatter を生テキストで読んで UnitInput を
// 組み立てる。src/content/__tests__/prerequisites.test.ts と同じ方式(astro:content の
// content collection 実行時に依存しない)を踏襲し、深さ計算の golden 値を実データで固定する。
const rawLessons = import.meta.glob('../../../content/lessons/**/*.mdx', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

function frontmatter(raw: string): Record<string, unknown> {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? ((parseYaml(match[1]) ?? {}) as Record<string, unknown>) : {};
}

function unitIdFromPath(path: string): string {
	// import.meta.glob のキーはこのテストファイルからの相対パス
	// (例: ../../../content/lessons/geometry/pythagorean-theorem.mdx)。
	return path.replace(/^\.\.\/\.\.\/\.\.\/content\/lessons\//, '').replace(/\.mdx$/, '');
}

const realUnits: UnitInput[] = Object.entries(rawLessons).map(([path, raw]) => {
	const id = unitIdFromPath(path);
	const fm = frontmatter(raw);
	return {
		id,
		title: typeof fm.title === 'string' ? fm.title : id,
		subject: id.split('/')[0]!,
		prerequisites: Array.isArray(fm.prerequisites) ? (fm.prerequisites as string[]) : [],
	};
});

describe('topologicalDepth (実データ golden)', () => {
	it('少なくとも1つの単元が存在する(データ読み取りの健全性)', () => {
		expect(realUnits.length).toBeGreaterThan(0);
	});

	it('前提のない単元(三平方の定理)は深さ0', () => {
		const depths = topologicalDepth(realUnits);
		expect(depths.get('geometry/pythagorean-theorem')).toBe(0);
	});

	it('三角比と単位円(前提: 三平方の定理)は深さ1', () => {
		const depths = topologicalDepth(realUnits);
		expect(depths.get('geometry/trigonometric-ratios')).toBe(1);
	});

	it('正弦定理・余弦定理(前提: 三角比と単位円)は深さ2', () => {
		const depths = topologicalDepth(realUnits);
		expect(depths.get('geometry/law-of-sines-cosines')).toBe(2);
	});

	it(`公開中の全${realUnits.length}単元で例外を投げず、すべてに深さが割り当たる`, () => {
		const depths = topologicalDepth(realUnits);
		expect(depths.size).toBe(realUnits.length);
		for (const unit of realUnits) {
			expect(depths.get(unit.id)).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('topologicalDepth (循環検出・ダングリング参照検出)', () => {
	it('人工的な3ノードの循環(A→B→C→A)を検出して throw する', () => {
		const cyclic: UnitInput[] = [
			{ id: 'x/a', title: 'A', subject: 'x', prerequisites: ['x/c'] },
			{ id: 'x/b', title: 'B', subject: 'x', prerequisites: ['x/a'] },
			{ id: 'x/c', title: 'C', subject: 'x', prerequisites: ['x/b'] },
		];
		expect(() => topologicalDepth(cyclic)).toThrow(/循環/);
	});

	it('自己参照の循環(最小形)も検出する', () => {
		const selfCyclic: UnitInput[] = [{ id: 'x/a', title: 'A', subject: 'x', prerequisites: ['x/a'] }];
		expect(() => topologicalDepth(selfCyclic)).toThrow(/循環/);
	});

	it('循環していない通常のダイヤモンド型 DAG では throw しない', () => {
		const diamond: UnitInput[] = [
			{ id: 'x/root', title: 'root', subject: 'x', prerequisites: [] },
			{ id: 'x/left', title: 'left', subject: 'x', prerequisites: ['x/root'] },
			{ id: 'x/right', title: 'right', subject: 'x', prerequisites: ['x/root'] },
			{ id: 'x/merge', title: 'merge', subject: 'x', prerequisites: ['x/left', 'x/right'] },
		];
		const depths = topologicalDepth(diamond);
		expect(depths.get('x/root')).toBe(0);
		expect(depths.get('x/left')).toBe(1);
		expect(depths.get('x/right')).toBe(1);
		expect(depths.get('x/merge')).toBe(2);
	});

	it('存在しない前提単元は分かりやすいエラーで throw する(ダングリング参照)', () => {
		const dangling: UnitInput[] = [
			{ id: 'x/a', title: 'A', subject: 'x', prerequisites: ['x/does-not-exist'] },
		];
		expect(() => topologicalDepth(dangling)).toThrow(/実在しません/);
	});
});

describe('buildUnitMapLayout', () => {
	it('全ノードに座標が割り当たり、エッジ数が前提関係の総数と一致する', () => {
		const layout = buildUnitMapLayout(realUnits);
		expect(layout.nodes).toHaveLength(realUnits.length);

		const totalPrereqs = realUnits.reduce((sum, unit) => sum + unit.prerequisites.length, 0);
		expect(layout.edges).toHaveLength(totalPrereqs);

		for (const node of layout.nodes) {
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(node.y).toBeGreaterThanOrEqual(0);
		}
	});

	it('同じ深さのノードは同じ y 座標を持つ(行レイアウト)', () => {
		const layout = buildUnitMapLayout(realUnits);
		const yByDepth = new Map<number, number>();
		for (const node of layout.nodes) {
			const existing = yByDepth.get(node.depth);
			if (existing === undefined) {
				yByDepth.set(node.depth, node.y);
			} else {
				expect(node.y).toBe(existing);
			}
		}
	});

	it('width/height はノード配置を包含する正の値になる', () => {
		const layout = buildUnitMapLayout(realUnits);
		expect(layout.width).toBeGreaterThan(0);
		expect(layout.height).toBeGreaterThan(0);
		for (const node of layout.nodes) {
			expect(node.x).toBeLessThan(layout.width);
			expect(node.y).toBeLessThan(layout.height);
		}
	});

	it('空配列を渡しても例外を投げず、空のレイアウトを返す', () => {
		const layout = buildUnitMapLayout([]);
		expect(layout.nodes).toEqual([]);
		expect(layout.edges).toEqual([]);
		expect(layout.rowCount).toBe(0);
	});
});
