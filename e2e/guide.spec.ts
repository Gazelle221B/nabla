import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 伴走者向けガイド(/guide/、ADR-006 M9d)の実ブラウザ検証。完全に静的な HTML のみで
// 構成される(React Island なし)ため、他のページと違いハイドレーション待ちは不要。

test.describe('伴走者向けガイドページ (/guide/)', () => {
	test('表示され、進行プロトコル・教育効果未検証の明記を含む', async ({ page }) => {
		await page.goto('./guide/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('伴走者向けガイド');
		await expect(page.getByRole('heading', { name: '進行プロトコル(推奨)' })).toBeVisible();
		await expect(page.getByText(/予想を先に言わせる/)).toBeVisible();
		await expect(page.getByText(/正解をすぐ教えない/)).toBeVisible();
		await expect(page.getByText(/自分の言葉で説明させる/)).toBeVisible();
		// C-5: 教育効果は未検証である旨の明記。
		await expect(page.getByText(/教育効果検証を実施していません/)).toBeVisible();
	});

	test('コンソール未処理例外・console.error が発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		await page.goto('./guide/');
		await page.waitForLoadState('networkidle');
		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(通常表示)', async ({ page }) => {
		await page.goto('./guide/');
		await page.waitForLoadState('networkidle');
		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
	});

	test('印刷プレビュー(print メディア)でも Critical/Serious 違反が0件で、no-print要素が隠れる', async ({
		page,
	}) => {
		await page.goto('./guide/');
		await page.waitForLoadState('networkidle');
		await page.emulateMedia({ media: 'print' });

		await expect(page.getByRole('link', { name: /トップへ戻る/ })).toBeHidden();
		await expect(page.getByRole('button', { name: '印刷する' })).toBeHidden();

		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
	});

	test('他ページ(コース・単元マップ・履歴・ワークシート)への導線を持つ', async ({ page }) => {
		await page.goto('./guide/');
		await expect(page.getByRole('link', { name: /コース一覧/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /単元マップ/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /予想履歴ページ/ })).toBeVisible();
		await page.getByRole('link', { name: /予想ワークシート/ }).click();
		await expect(page).toHaveURL(/\/worksheet\/$/);
	});

	test('トップページから /guide/ へ遷移できる', async ({ page }) => {
		await page.goto('./');
		await page.getByRole('link', { name: /伴走者向けガイド/ }).click();
		await expect(page).toHaveURL(/\/guide\/$/);
	});
});
