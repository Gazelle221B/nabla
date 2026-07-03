import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';

// 憲法 C-2 の実効化: prerequisites が指す単元 ID が実在すること(孤立ノード・リンク切れ禁止)を
// 全 lesson 走査で機械的に検証する。コンテンツを増やしても壊れたリンクをビルド前に検出する。
// content collection 実行時(astro:content)に依存せず、frontmatter を生テキストで読んで判定する。

const rawLessons = import.meta.glob('../lessons/**/*.mdx', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

function lessonIdFromPath(path: string): string {
	// 例: /.../src/content/lessons/geometry/pythagorean-theorem.mdx → geometry/pythagorean-theorem
	return path.replace(/^.*\/content\/lessons\//, '').replace(/\.mdx$/, '');
}

function frontmatter(raw: string): Record<string, unknown> {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? ((parseYaml(match[1]) ?? {}) as Record<string, unknown>) : {};
}

const entries = Object.entries(rawLessons).map(([path, raw]) => ({
	id: lessonIdFromPath(path),
	prerequisites: (frontmatter(raw).prerequisites as string[] | undefined) ?? [],
}));

describe('lessons コンテンツグラフ (C-2)', () => {
	it('少なくとも 1 つの lesson が存在する', () => {
		expect(entries.length).toBeGreaterThan(0);
	});

	it('prerequisites はすべて実在する lesson ID を指す (リンク切れ禁止)', () => {
		const ids = new Set(entries.map((e) => e.id));
		const brokenLinks: string[] = [];
		for (const entry of entries) {
			for (const prereq of entry.prerequisites) {
				if (!ids.has(prereq)) brokenLinks.push(`${entry.id} → ${prereq}`);
			}
		}
		expect(brokenLinks, `未定義の前提単元への参照: ${brokenLinks.join(', ')}`).toEqual([]);
	});

	it('lesson は自分自身を前提にしない (循環の最小形)', () => {
		const selfRefs = entries.filter((e) => e.prerequisites.includes(e.id)).map((e) => e.id);
		expect(selfRefs).toEqual([]);
	});
});
