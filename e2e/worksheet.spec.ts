import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 印刷可能な予想ワークシート(/worksheet/、ADR-006 M9d)の実ブラウザ検証。完全に静的な HTML
// のみで構成される(React Island なし)。

test.describe('予想ワークシートページ (/worksheet/)', () => {
	test('表示され、予想・観察・説明の4つの記入欄を持つ', async ({ page }) => {
		await page.goto('./worksheet/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('予想ワークシート');
		await expect(page.getByRole('heading', { name: '1. 単元名' })).toBeVisible();
		await expect(page.getByRole('heading', { name: '2. 予想(操作する前に書く)' })).toBeVisible();
		await expect(page.getByRole('heading', { name: '3. 操作して観察したこと' })).toBeVisible();
		await expect(page.getByRole('heading', { name: '4. 自分の言葉での説明' })).toBeVisible();
		// C-5: 教育効果は未検証である旨の明記(ワークシート自体にも明記)。
		await expect(page.getByText(/nabla の教育効果は未検証/)).toBeVisible();
	});

	test('コンソール未処理例外・console.error が発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		await page.goto('./worksheet/');
		await page.waitForLoadState('networkidle');
		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(通常表示)', async ({ page }) => {
		await page.goto('./worksheet/');
		await page.waitForLoadState('networkidle');
		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
	});

	test('印刷プレビュー(print メディア)でも Critical/Serious 違反が0件で、no-print要素が隠れ、A4 1枚に収まる', async ({
		page,
	}) => {
		await page.goto('./worksheet/');
		await page.waitForLoadState('networkidle');
		await page.emulateMedia({ media: 'print' });

		await expect(page.getByRole('link', { name: /トップへ戻る/ })).toBeHidden();
		await expect(page.getByRole('button', { name: '印刷する' })).toBeHidden();

		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);

		// A4(210mm×297mm、96dpi換算で約1123px高さ)相当のビューポートに設定し、
		// 本文が縦にその高さへ収まる(=1枚に収まる)ことを概算で確認する。
		// @page margin(14mm上下)を差し引いた印字可能領域の目安として1000pxをしきい値とする。
		await page.setViewportSize({ width: 794, height: 1123 }); // A4 @ 96dpi
		const bodyHeight = await page.evaluate(() => document.querySelector('main.print-page')!.scrollHeight);
		expect(bodyHeight, `印刷本文の高さ(px): ${bodyHeight}`).toBeLessThanOrEqual(1000);
	});

	test('伴走者向けガイドへの導線を持つ', async ({ page }) => {
		await page.goto('./worksheet/');
		await page.getByRole('link', { name: /伴走者向けガイド/ }).click();
		await expect(page).toHaveURL(/\/guide\/$/);
	});
});
