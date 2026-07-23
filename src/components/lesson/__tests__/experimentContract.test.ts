import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M9a 計測基盤 (docs/METRICS_PLAN.md) は全32単元の Experiment Island 自体には手を
// 入れず、共通の DOM 構造規約に依拠したドキュメントレベルのイベント委譲
// (src/lib/analytics/coreLoopObserver.ts)で計測する。この契約が新単元の追加や
// リファクタで無言で破られると、計測が静かに欠落する(誰も気づかない)。
//
// このテストは全 Experiment コンポーネントのソース(+ それが import する Scene
// コンポーネント。GraphTheoryExperiment のように操作コントロールの実マークアップが
// 子の Scene 側にある場合があるため)を静的に走査し、以下の契約を強制する
// (独立レビュー指摘、2026-07-24。docs/METRICS_PLAN.md §3・§6 と 1:1):
//   1. 実験セクション: aria-labelledby="*-exp-title"
//   2. 予想ラジオ: name="*-prediction"
//   3. 予想確定ボタン: 文言が完全一致する <button>予想を確定して実験する</button>
//   4. チェックポイント見出し: <h3>予想と結果</h3>
//   5. 計測可能な操作コントロールが最低1つ存在する(coreLoopObserver.ts の
//      isOperateControl が拾える形: -slider/-number の id、role="switch"/"button"、
//      tabIndex={0}、または(フォールバックとして)予想確定ボタン以外のもう1つの <button>)

const lessonDir = dirname(fileURLToPath(import.meta.url)).replace(/__tests__$/, '');
const scenesRootDir = resolve(lessonDir, '../scenes');

function readExperimentFiles(): { name: string; path: string; source: string }[] {
	return readdirSync(lessonDir)
		.filter((file) => file.endsWith('Experiment.tsx'))
		.map((file) => {
			const path = resolve(lessonDir, file);
			return { name: file, path, source: readFileSync(path, 'utf-8') };
		});
}

/** `from '../scenes/dom/GraphScene.js'` のような相対importを解決し、そのソースを返す。 */
function resolveImportedSceneSources(experimentSource: string): string[] {
	const importPattern = /from\s+'(\.\.\/scenes\/[^']+)\.js'/g;
	const sources: string[] = [];
	for (const match of experimentSource.matchAll(importPattern)) {
		const relativePath = match[1];
		try {
			const scenePath = resolve(lessonDir, `${relativePath}.tsx`);
			sources.push(readFileSync(scenePath, 'utf-8'));
		} catch {
			// import先が .tsx でない(例: dotDensity.ts のようなヘルパー)場合はスキップする。
			// このテストの目的はマークアップ契約の検証であり、全importの解決可能性ではない。
			continue;
		}
	}
	return sources;
}

const OPERATE_CONTROL_SIGNALS: RegExp[] = [
	/id="[a-zA-Z0-9-]*-(slider|number)"/,
	/role=\{?[^}]*?['"]switch['"]/,
	/role=\{?[^}]*?['"]button['"]/,
	/tabIndex\s*=\s*\{?[^}]*?0/,
];

function hasMeasurableOperateControl(combinedSource: string): boolean {
	if (OPERATE_CONTROL_SIGNALS.some((pattern) => pattern.test(combinedSource))) return true;
	// フォールバック: 予想確定ボタン以外にもう1つ <button> がある(例: リセット)。
	const buttonCount = (combinedSource.match(/<button/g) ?? []).length;
	return buttonCount >= 2;
}

describe('全単元 Experiment の計測構造契約 (docs/METRICS_PLAN.md §3, coreLoopObserver.ts が前提とする DOM 規約)', () => {
	const experiments = readExperimentFiles();

	it('少なくとも1つの Experiment コンポーネントが見つかる(走査対象が空でないことの前提確認)', () => {
		expect(experiments.length).toBeGreaterThan(0);
	});

	it.each(experiments.map((e) => [e.name, e] as const))('%s', (_name, experiment) => {
		const sceneSources = resolveImportedSceneSources(experiment.source);
		const combinedSource = [experiment.source, ...sceneSources].join('\n');

		expect(
			/aria-labelledby="[a-z0-9-]+-exp-title"/.test(experiment.source),
			`${experiment.name}: section の aria-labelledby="*-exp-title" が見つからない`,
		).toBe(true);

		expect(
			/name="[a-z0-9-]*-prediction"/.test(experiment.source),
			`${experiment.name}: 予想ラジオの name="*-prediction" が見つからない`,
		).toBe(true);

		// [\s\S]*? (非貪欲): JSX 属性値の onClick={() => ...} に含まれる `=>` の `>` で
		// 早期にマッチが打ち切られないよう、実際のタグ終端 `>` まで後方追跡させる。
		expect(
			/<button[\s\S]*?>\s*予想を確定して実験する\s*<\/button>/.test(experiment.source),
			`${experiment.name}: 予想確定ボタン(文言完全一致)が見つからない`,
		).toBe(true);

		expect(
			combinedSource.includes('<h3>予想と結果</h3>'),
			`${experiment.name}: チェックポイント見出し <h3>予想と結果</h3> が見つからない`,
		).toBe(true);

		expect(
			hasMeasurableOperateControl(combinedSource),
			`${experiment.name}: coreLoopObserver.ts が検出できる操作コントロール` +
				'(-slider/-number の id、role="switch"/"button"、tabIndex={0}、または予想確定ボタン以外の <button>)' +
				'が見つからない。experiment_interact が発火しないまま公開される可能性がある。',
		).toBe(true);
	});

	it('scenesRootDir が実在する(import解決の前提確認、パス設定ミスの検知)', () => {
		expect(() => readdirSync(scenesRootDir)).not.toThrow();
	});
});
