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
	// import.meta.glob のキーはこのテストファイルからの相対パス
	// (例: ../lessons/geometry/pythagorean-theorem.mdx)。Astro の entry.id と同じ
	// 名前空間 (geometry/pythagorean-theorem) になるよう先頭 ../lessons/ と拡張子を除く。
	return path.replace(/^\.\.\/lessons\//, '').replace(/\.mdx$/, '');
}

function frontmatter(raw: string): Record<string, unknown> {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? ((parseYaml(match[1]) ?? {}) as Record<string, unknown>) : {};
}

// prerequisites は frontmatter 由来なので型は信用できない。string[] と決め打ちキャストすると
// 誤って文字列を書いた場合に for-of が文字単位で走り検出が壊れるため、生値を保持して検証する。
const entries = Object.entries(rawLessons).map(([path, raw]) => ({
	id: lessonIdFromPath(path),
	rawPrerequisites: frontmatter(raw).prerequisites,
}));

// 検証済みの prerequisites 配列を返す。配列でも undefined でもない値は空扱いにし、
// 別テスト(下記)で不正 frontmatter として明示的に失敗させる。
function prerequisitesOf(entry: (typeof entries)[number]): string[] {
	return Array.isArray(entry.rawPrerequisites) ? (entry.rawPrerequisites as string[]) : [];
}

describe('lessons コンテンツグラフ (C-2)', () => {
	it('少なくとも 1 つの lesson が存在する', () => {
		expect(entries.length).toBeGreaterThan(0);
	});

	it('導出 ID は Astro の entry.id 名前空間と一致する (glob キー形式ズレの検出)', () => {
		// この既知 ID が含まれない = 導出ロジックが Astro の entry.id とズレている証拠。
		const ids = new Set(entries.map((e) => e.id));
		expect(ids.has('geometry/pythagorean-theorem')).toBe(true);
	});

	it('prerequisites は配列である (不正 frontmatter の検出)', () => {
		// undefined(未指定)は許容。文字列など配列以外は不正として失敗させる。
		const nonArray = entries
			.filter((e) => e.rawPrerequisites !== undefined && !Array.isArray(e.rawPrerequisites))
			.map((e) => `${e.id}: ${JSON.stringify(e.rawPrerequisites)}`);
		expect(nonArray, `prerequisites が配列でない lesson: ${nonArray.join(', ')}`).toEqual([]);
	});

	it('prerequisites はすべて実在する lesson ID を指す (リンク切れ禁止)', () => {
		const ids = new Set(entries.map((e) => e.id));
		const brokenLinks: string[] = [];
		for (const entry of entries) {
			for (const prereq of prerequisitesOf(entry)) {
				if (!ids.has(prereq)) brokenLinks.push(`${entry.id} → ${prereq}`);
			}
		}
		expect(brokenLinks, `未定義の前提単元への参照: ${brokenLinks.join(', ')}`).toEqual([]);
	});

	it('lesson は自分自身を前提にしない (循環の最小形)', () => {
		const selfRefs = entries.filter((e) => prerequisitesOf(e).includes(e.id)).map((e) => e.id);
		expect(selfRefs).toEqual([]);
	});

	// 上の自己参照テストは循環の最小形(長さ1)のみを見ており、A→B→A のような
	// 多段の循環は未検証だった(単元マップ導入時に確認・追加。src/lib/graph/unitMap.ts の
	// topologicalDepth にも独立した循環検出があるが、ここでは別実装の DFS で
	// コンテンツ側からも二重に守る)。
	it('prerequisites は自己参照に限らない一般の循環も持たない', () => {
		const prereqsById = new Map(entries.map((e) => [e.id, prerequisitesOf(e)]));
		const state = new Map<string, 'visiting' | 'done'>();
		const cyclesFound: string[] = [];

		function visit(id: string, path: readonly string[]): void {
			if (state.get(id) === 'done') return;
			if (state.get(id) === 'visiting') {
				cyclesFound.push([...path, id].join(' → '));
				return;
			}
			state.set(id, 'visiting');
			// ダングリング参照(実在しない前提)は別テストの守備範囲なので、ここでは
			// 単に「これ以上辿る前提が無い」として扱い、循環検出だけに専念する。
			for (const prereq of prereqsById.get(id) ?? []) {
				visit(prereq, [...path, id]);
			}
			state.set(id, 'done');
		}

		for (const entry of entries) {
			visit(entry.id, []);
		}

		expect(cyclesFound, `循環を検出した前提関係: ${cyclesFound.join(', ')}`).toEqual([]);
	});
});
