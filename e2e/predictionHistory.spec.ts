import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from './helpers';

// ADR-006 M9c: 予想履歴(localStorage)の実ブラウザ検証。単元ページで予想を確定すると
// localStorageに記録され、/history/ページで一覧・エクスポート・全削除ができることを
// エンドツーエンドで確認する(既存Island=TrigonometryExperimentは無変更のまま、
// document委譲だけで記録できていることの実証)。
const TRIGONOMETRIC_RATIOS_PATH = './lessons/trigonometric-ratios/';
const HISTORY_PATH = './history/';

test.describe('予想履歴(localStorage、/history/)', () => {
	test('単元ページで予想を確定すると、/history/に記録が表示される', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		await page.goto(HISTORY_PATH);
		await page.waitForLoadState('networkidle');

		const table = page.getByRole('table');
		await expect(table).toBeVisible();
		await expect(table.getByText('trigonometric-ratios')).toBeVisible();
		await expect(table.getByText('cos θ は 1 から 0 へ向かって減っていく')).toBeVisible();
	});

	test('/history/ページ: 履歴が空のときのa11y・空状態メッセージ', async ({ page }) => {
		await page.goto(HISTORY_PATH);
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { name: 'あなたの予想履歴' })).toBeVisible();
		await expect(
			page.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeVisible();

		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
	});

	test('/history/ページ: 記録ありの表示・a11y・JSONエクスポート・全削除が機能する', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();
		await selectPredictionRobustly(
			page,
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await page.goto(HISTORY_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('table')).toBeVisible();

		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);

		// JSONエクスポート: ダウンロードイベントが発火し、拡張子が.json。
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'JSONでエクスポート' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('nabla-predictions-export.json');
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const content = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
		expect(content.version).toBe('nabla:predictions:v1');
		expect(Array.isArray(content.records)).toBe(true);
		expect(content.records.length).toBeGreaterThan(0);
		expect(content.records[0]).toMatchObject({ unitSlug: 'trigonometric-ratios' });

		// 全削除: 2段階確認を経て履歴が消え、空状態に戻る。
		await page.getByRole('button', { name: 'すべて削除' }).click();
		await expect(page.getByText('本当にすべての履歴を削除しますか?')).toBeVisible();
		await page.getByRole('button', { name: '削除する' }).click();
		await expect(
			page.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeVisible();

		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeVisible();
	});

	test('演習(ExerciseSection)の操作は予想履歴に記録されない(予想確定ボタンのみが記録の起点)', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');

		const exercise = page.locator('section[aria-labelledby="exercise-section-title"]');
		await exercise.waitFor();
		const groups = exercise.getByRole('group');
		await groups.nth(0).getByRole('radio', { name: '(0, -1)' }).check();

		await page.goto(HISTORY_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeVisible();
	});
});
