import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// content collection スキーマの zod は Astro 公式が案内する `astro/zod` から取る
// (Zod 4 対応の再エクスポート。astro:content 経由の `z` は非推奨)。
import { z } from 'astro/zod';

// 単元(lesson)コンテンツコレクションのスキーマ (docs/DESIGN.md §データ構造・スキーマ)。
// curriculum は type で判別する (中学・高校 = mext / 大学教養 = independent)。
// 憲法 C-2: この curriculum スキーマの形は勝手に変更しない。prerequisites が指す単元 ID は
// 実在すること (孤立ノード・リンク切れ禁止)。MVP 1 は記事が独立しているため既定は空配列。

const referenceSchema = z.object({
	title: z.string(),
	type: z.string(),
	locator: z.string(),
});

// 中学・高校 (文部科学省 学習指導要領準拠)
const mextCurriculum = z.object({
	type: z.literal('mext'),
	jurisdiction: z.literal('jp'),
	stage: z.enum(['junior-high', 'high-school']),
	guidelineYear: z.number(),
	subject: z.string(),
	grade: z.number().optional(), // 高校は履修順序が揺れるため必須にしない
	units: z.array(z.string()).nonempty(),
});

// 大学教養 (全国統一カリキュラムがないため独自参照フレームワーク)
const independentCurriculum = z.object({
	type: z.literal('independent'),
	stage: z.literal('university-general'),
	frameworkVersion: z.number(),
	domains: z.array(z.string()).nonempty(),
	referenceSources: z.array(z.string()).optional(),
});

const lessons = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// 学習目標は 1〜2 個に限定する (DoD)。スキーマで上限を強制する。
		learningGoals: z.array(z.string()).min(1).max(2),
		// 前提単元の ID。実在する単元 ID のみを指すこと (C-2)。既定は空。
		prerequisites: z.array(z.string()).default([]),
		curriculum: z.discriminatedUnion('type', [mextCurriculum, independentCurriculum]),
		lastReviewed: z.coerce.date(),
		references: z.array(referenceSchema).default([]),
		contentReview: z.object({
			// 数学的レビュー状態と教育効果検証状態を分離 (教育効果は MVP 1 では未検証)。
			mathematicalStatus: z.enum(['unreviewed', 'self-reviewed', 'peer-reviewed']),
			educationalStatus: z.enum(['unvalidated', 'validated']),
		}),
	}),
});

export const collections = { lessons };
