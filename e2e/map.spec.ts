import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 単元マップ(/map/)の実ブラウザ検証。このページは React Island を使わない静的生成ページ
// (unitMap.ts が純粋 TypeScript でレイアウトを組み立て、Astro がビルド時に SVG/DOM を
// 生成する)ため、他の単元ページと違いハイドレーション待ちは不要。
const MAP_PATH = './map/';

test.describe('単元マップページ (/map/)', () => {
	test('表示される', async ({ page }) => {
		await page.goto(MAP_PATH);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('単元マップ');
	});

	test('コンソール未処理例外・console.error が発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(MAP_PATH);
		await page.waitForLoadState('networkidle');

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(MAP_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('DOM リストの前提リンクが実在する単元ページへ飛ぶ (三角比と単位円 → 三平方の定理)', async ({
		page,
	}) => {
		await page.goto(MAP_PATH);

		// 「前提: 三角比と単位円」という同じ文言のリンクは別単元(正弦定理・余弦定理)の
		// prereq 段落にも現れうるため、単元カード自身のタイトルリンク(li の直接の子)で
		// 対象の li を一意に特定してから、その中の前提段落のリンクをたどる。
		const trigonometricItem = page.locator('li').filter({
			has: page.locator(':scope > a', { hasText: '三角比と単位円' }),
		});
		await expect(trigonometricItem).toHaveCount(1);
		await expect(trigonometricItem.locator('p.prereq')).toContainText('前提:');
		await trigonometricItem.locator('p.prereq a', { hasText: '三平方の定理' }).click();

		await expect(page).toHaveURL(/\/lessons\/pythagorean-theorem\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('三平方の定理');
	});

	test('前提のない単元は「前提: なし」と表示される (三平方の定理)', async ({ page }) => {
		await page.goto(MAP_PATH);
		const pythagorasItem = page.locator('li').filter({
			has: page.locator(':scope > a', { hasText: '三平方の定理' }),
		});
		await expect(pythagorasItem).toHaveCount(1);
		await expect(pythagorasItem.locator('p.prereq')).toHaveText('前提: なし');
	});
});

test.describe('トップページからの導線', () => {
	test('トップページから /map/ へ遷移できる', async ({ page }) => {
		await page.goto('./');
		await page.getByRole('link', { name: /単元マップ/ }).click();

		await expect(page).toHaveURL(/\/map\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('単元マップ');
	});
});
