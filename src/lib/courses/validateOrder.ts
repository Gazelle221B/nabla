// 既定学習経路(コース、ADR-006 M9d)の並び順が、実際の前提 DAG(content collection の
// frontmatter prerequisites)と矛盾していないことをビルド時に検証する純粋 TypeScript
// (AGENTS.md §5: React/描画ライブラリを一切 import しない)。
//
// 単元マップ(lib/graph/unitMap.ts)の topologicalDepth は「全単元」の深さを計算するが、
// コースは32単元のうちの一部だけを選んだ部分列であり、コース外の単元を経由する前提関係を
// 強制すると無関係な深さの縛りが入ってしまう。そこでコース固有の検証として、
// 「コースに含まれる単元 i の前提のうち、同じコースにも含まれるものは、必ず i より前の
// 位置に置かれている」ことだけを確認する(コース外の前提は無視——それは既に一般に
// 公開済みの単元であり、コースの外で前提を満たしていればよいという設計)。
//
// 循環・ダングリング参照そのものは unitMap.ts / prerequisites.test.ts が別途保証しているため
// (二重防御)、ここでは「順序の整合性」だけに責務を絞る。

export interface CourseOrderUnit {
	/** content collection の entry.id と同じ形("subject/slug")。 */
	readonly lessonId: string;
}

/**
 * コース内の単元順序が、実際の前提関係(prerequisitesById)と矛盾していないかを検証する。
 * 矛盾があれば例外を投げる(C-7: サイレントな誤った順序の公開を防ぐ、unitMap.ts の
 * 循環検出と同じ fail-loud の方針)。
 *
 * @param courseSlug エラーメッセージ用のコース識別子。
 * @param units コース内の単元(表示順)。
 * @param prerequisitesById 単元 ID → その単元の prerequisites(実 DAG、全単元分)。
 */
export function validateCourseOrder(
	courseSlug: string,
	units: readonly CourseOrderUnit[],
	prerequisitesById: ReadonlyMap<string, readonly string[]>,
): void {
	const positionById = new Map(units.map((unit, index) => [unit.lessonId, index]));

	for (const [index, unit] of units.entries()) {
		const prerequisites = prerequisitesById.get(unit.lessonId);
		if (prerequisites === undefined) {
			throw new Error(
				`コース "${courseSlug}": 単元 "${unit.lessonId}" が content collection に実在しません。`,
			);
		}
		for (const prereqId of prerequisites) {
			const prereqPosition = positionById.get(prereqId);
			// コース外の前提は対象外(その単元は一般公開されており、コースの外で満たされていればよい)。
			if (prereqPosition === undefined) continue;
			if (prereqPosition >= index) {
				throw new Error(
					`コース "${courseSlug}": 単元 "${unit.lessonId}"(位置 ${index})の前提 "${prereqId}" が` +
						`同じコース内でそれより後(位置 ${prereqPosition})に置かれています。前提単元を先に配置してください。`,
				);
			}
		}
	}
}
