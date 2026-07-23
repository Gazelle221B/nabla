import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { COURSES } from '../data.js';
import { validateCourseOrder } from '../validateOrder.js';

// ADR-006 M9d: 既定学習経路(コース)が実際の前提 DAG(content collection の frontmatter
// prerequisites)と矛盾していないことを固定するテスト。src/content/__tests__/prerequisites.test.ts
// と同じ手法(astro:content ランタイムに依存せず frontmatter を生テキストで読む)で、
// COURSES に手で書いた単元順序が「絵に描いた餅」にならないよう独立に検証する。

const rawLessons = import.meta.glob('../../../content/lessons/**/*.mdx', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

function lessonIdFromPath(path: string): string {
	return path.replace(/^.*\/content\/lessons\//, '').replace(/\.mdx$/, '');
}

function frontmatter(raw: string): Record<string, unknown> {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? ((parseYaml(match[1]) ?? {}) as Record<string, unknown>) : {};
}

const entries = Object.entries(rawLessons).map(([path, raw]) => ({
	id: lessonIdFromPath(path),
	title: String(frontmatter(raw).title ?? ''),
	prerequisites: Array.isArray(frontmatter(raw).prerequisites)
		? (frontmatter(raw).prerequisites as string[])
		: [],
}));

const prerequisitesById = new Map(entries.map((e) => [e.id, e.prerequisites]));
const titleById = new Map(entries.map((e) => [e.id, e.title]));

describe('COURSES(既定学習経路、ADR-006 M9d)', () => {
	it('少なくとも2本、5本以下のコースが定義されている(タスク仕様: 2〜3本)', () => {
		expect(COURSES.length).toBeGreaterThanOrEqual(2);
		expect(COURSES.length).toBeLessThanOrEqual(3);
	});

	it('各コースは3〜5単元で構成される(タスク仕様)', () => {
		for (const course of COURSES) {
			expect(course.units.length, course.slug).toBeGreaterThanOrEqual(3);
			expect(course.units.length, course.slug).toBeLessThanOrEqual(5);
		}
	});

	it('コース slug に重複がない', () => {
		const slugs = COURSES.map((c) => c.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it('各コースの全単元が content collection に実在する(実エッジの確認)', () => {
		const missing: string[] = [];
		for (const course of COURSES) {
			for (const unit of course.units) {
				if (!prerequisitesById.has(unit.lessonId)) {
					missing.push(`${course.slug}: ${unit.lessonId}`);
				}
			}
		}
		expect(missing, `実在しない単元 ID: ${missing.join(', ')}`).toEqual([]);
	});

	it('各コースの単元順序は実際の前提 DAG と矛盾しない(validateCourseOrder)', () => {
		for (const course of COURSES) {
			expect(() => validateCourseOrder(course.slug, course.units, prerequisitesById)).not.toThrow();
		}
	});

	it('各コースに、少なくとも1つ前提が空(ルートノード)の単元が先頭にある', () => {
		// コースの最初の単元は、実DAG上でも前提を持たない(またはコース外の前提のみ)ことが
		// 「基礎から始まる経路」として自然——先頭単元がいきなり別単元を前提にするコースは
		// 設計として不自然なため、ここで明示的に固定する。
		for (const course of COURSES) {
			const first = course.units[0]!;
			const prereqs = prerequisitesById.get(first.lessonId) ?? [];
			expect(prereqs, `${course.slug} の先頭単元 ${first.lessonId} は前提を持たないはず`).toEqual([]);
		}
	});

	it('パイロット3単元(M9b/M9c、URL プリセット対象)がそれぞれ異なるコースに1つずつ含まれる', () => {
		const pilotUnits = [
			'geometry/trigonometric-ratios',
			'calculus/derivative-function',
			'probability/permutation-combination',
		];
		for (const pilot of pilotUnits) {
			const coursesContaining = COURSES.filter((c) => c.units.some((u) => u.lessonId === pilot));
			expect(coursesContaining, `${pilot} を含むコース`).toHaveLength(1);
		}
	});

	it('各単元の reachGoal・orderRationale・summary が空でない', () => {
		for (const course of COURSES) {
			expect(course.summary.trim().length, course.slug).toBeGreaterThan(0);
			expect(course.orderRationale.trim().length, course.slug).toBeGreaterThan(0);
			for (const unit of course.units) {
				expect(unit.reachGoal.trim().length, `${course.slug}: ${unit.lessonId}`).toBeGreaterThan(0);
			}
		}
	});

	it('データファイルのコメントに記載した実エッジと、実際の frontmatter が一致する(記録の陳腐化防止)', () => {
		// data.ts 冒頭コメントに書き出した実エッジの記録が、コンテンツ変更後も追随しているかを
		// 機械的に確認する(コメントは人間が読む根拠であり、ここで実データと突き合わせて保証する)。
		const expectedEdges: Record<string, string[]> = {
			'geometry/trigonometric-ratios': ['geometry/pythagorean-theorem'],
			'geometry/law-of-sines-cosines': ['geometry/trigonometric-ratios'],
			'linear-algebra/dot-product': ['geometry/trigonometric-ratios'],
			'calculus/derivative-function': ['calculus/derivative-tangent-line'],
			'calculus/definite-integral-area': ['calculus/derivative-function'],
			'calculus/surface-partial-derivative': ['calculus/derivative-function'],
			'probability/permutation-combination': ['probability/simple-probability'],
			'probability/probability-distribution': ['probability/simple-probability'],
			'probability/normal-distribution-clt': ['probability/probability-distribution'],
		};
		for (const [id, expected] of Object.entries(expectedEdges)) {
			expect(prerequisitesById.get(id), id).toEqual(expected);
		}
	});

	it('各コースの診断設問数は units.length-1で、checksUnitIndex は 0..units.length-2 を昇順で網羅する(CourseEntryDiagnostic の推奨ロジックの前提)', () => {
		for (const course of COURSES) {
			expect(course.diagnostic.questions.length, course.slug).toBe(course.units.length - 1);
			expect(
				course.diagnostic.questions.map((q) => q.checksUnitIndex),
				course.slug,
			).toEqual(course.units.map((_, i) => i).slice(0, -1));
		}
	});

	it('各単元の title が content collection から解決できる(表示用の健全性)', () => {
		for (const course of COURSES) {
			for (const unit of course.units) {
				expect(titleById.get(unit.lessonId), unit.lessonId).toBeTruthy();
			}
		}
	});
});
