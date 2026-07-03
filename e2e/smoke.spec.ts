import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// T5-1スモーク: 記事がまだ無いため、既存の唯一のページ(トップページ)を対象に
// 到達性・基本表示・axeでのCritical/Serious 0件のみを確認する。
// 記事追加時(T4-1〜)は対象ページを拡張する。
test.describe('トップページ', () => {
	test('表示される', async ({ page }) => {
		await page.goto('./');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('nabla(∇)');
	});

	test('コンソール未処理例外が発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));

		await page.goto('./');

		expect(pageErrors).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto('./');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});
});
