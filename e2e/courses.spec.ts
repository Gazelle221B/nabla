import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 既定学習経路(コース、ADR-006 M9d)の実ブラウザ検証。
// - /courses/ は静的生成ページ(unit-list と同型)。
// - /courses/{slug}/ は単元順序リスト(静的)+ 入口診断(CourseEntryDiagnostic、client:only)。

declare global {
	interface Window {
		__gtagCalls?: [string, string, Record<string, unknown>][];
	}
}

test.describe('コース一覧ページ (/courses/)', () => {
	test('表示され、3コースへのリンクを持つ', async ({ page }) => {
		await page.goto('./courses/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('既定学習経路(コース)');
		await expect(page.getByRole('link', { name: /図形と三角比/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /微分と積分の考え方/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /場合の数と確率/ })).toBeVisible();
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto('./courses/');
		await page.waitForLoadState('networkidle');
		const results = await new AxeBuilder({ page }).analyze();
		const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
	});

	test('トップページから /courses/ へ遷移できる', async ({ page }) => {
		await page.goto('./');
		await page.getByRole('link', { name: /既定学習経路/ }).click();
		await expect(page).toHaveURL(/\/courses\/$/);
	});
});

test.describe('コース詳細ページ (/courses/geometry-and-trigonometry/)', () => {
	const COURSE_PATH = './courses/geometry-and-trigonometry/';

	test('単元が前提順で表示され、各単元ページへリンクする', async ({ page }) => {
		await page.goto(COURSE_PATH);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('図形と三角比');

		const items = page.locator('.unit-order li');
		await expect(items).toHaveCount(4);
		await expect(items.nth(0)).toContainText('三平方の定理');
		await expect(items.nth(1)).toContainText('三角比と単位円');
		await expect(items.nth(2)).toContainText('正弦定理・余弦定理');
		await expect(items.nth(3)).toContainText('内積');

		await items.nth(0).getByRole('link').click();
		await expect(page).toHaveURL(/\/lessons\/pythagorean-theorem\/$/);
	});

	test('「この順で進む理由」セクションが表示される', async ({ page }) => {
		await page.goto(COURSE_PATH);
		await expect(page.getByRole('heading', { name: 'この順で進む理由' })).toBeVisible();
	});

	test('コンソール未処理例外・console.error が発生しない(入口診断のハイドレーション含む)', async ({
		page,
	}) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(COURSE_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '入口診断' })).toBeVisible();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(診断表示時+採点後+スキップ後の3状態)', async ({ page }) => {
		await page.goto(COURSE_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '入口診断' })).toBeVisible();

		const before = await new AxeBuilder({ page }).analyze();
		const beforeBad = before.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(beforeBad, JSON.stringify(beforeBad, null, 2)).toEqual([]);

		const groups = page.getByRole('group');
		await groups.nth(0).getByRole('radio').first().check();
		await groups.nth(1).getByRole('radio').first().check();
		await groups.nth(2).getByRole('radio').first().check();
		await page.getByRole('button', { name: '診断する' }).click();

		const after = await new AxeBuilder({ page }).analyze();
		const afterBad = after.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(afterBad, JSON.stringify(afterBad, null, 2)).toEqual([]);

		// スキップ後状態(ダーク自己完結カードの外にレンダリングされる .dismissedNotice)の
		// a11y も固定する(数学QA指摘、2026-07-24: M9c /history/ と同型のコントラスト欠陥が
		// 再発していたため、回帰ガードとして明示的に検証する)。
		await page.getByRole('button', { name: 'スキップして最初の単元から始める' }).click();
		await expect(page.getByRole('heading', { name: '入口診断' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'もう一度診断する' })).toBeVisible();

		const dismissed = await new AxeBuilder({ page }).analyze();
		const dismissedBad = dismissed.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(dismissedBad, JSON.stringify(dismissedBad, null, 2)).toEqual([]);
	});

	test('入口診断: 全問正解すると最後の単元(内積)が推奨され、スキップ動線も機能する', async ({ page }) => {
		await page.goto(COURSE_PATH);
		await page.waitForLoadState('networkidle');
		const diagnostic = page.locator('section[aria-labelledby="course-diagnostic-title"]');
		await diagnostic.waitFor();

		// Q1(脚9・12の斜辺): 正解 15。Q2(cosθ=60°): 正解 0.5。Q3(余弦定理): 正解 7.5。
		await diagnostic.getByRole('radio', { name: '15', exact: true }).check();
		await diagnostic.getByRole('radio', { name: '0.5' }).check();
		await diagnostic.getByRole('radio', { name: '7.5' }).check();
		await diagnostic.getByRole('button', { name: '診断する' }).click();

		const recommendation = diagnostic.getByRole('link', { name: /内積/ });
		await expect(recommendation).toBeVisible();
		await expect(recommendation).toHaveAttribute('href', /\/lessons\/dot-product\/$/);

		// 強制ブロックしない: スキップして畳める。
		await diagnostic.getByRole('button', { name: 'スキップして最初の単元から始める' }).click();
		await expect(page.getByRole('heading', { name: '入口診断' })).toHaveCount(0);
		await page.getByRole('button', { name: 'もう一度診断する' }).click();
		await expect(page.getByRole('heading', { name: '入口診断' })).toBeVisible();
	});

	test('入口診断: 1問目を誤答すると最初の単元(三平方の定理)が推奨される', async ({ page }) => {
		await page.goto(COURSE_PATH);
		await page.waitForLoadState('networkidle');
		const diagnostic = page.locator('section[aria-labelledby="course-diagnostic-title"]');
		await diagnostic.waitFor();

		await diagnostic.getByRole('radio', { name: '18' }).check(); // Q1誤答
		await diagnostic.getByRole('radio', { name: '0.5' }).check();
		await diagnostic.getByRole('radio', { name: '7.5' }).check();
		await diagnostic.getByRole('button', { name: '診断する' }).click();

		const recommendation = diagnostic.getByRole('link', { name: /三平方の定理/ });
		await expect(recommendation).toBeVisible();
		await expect(recommendation).toHaveAttribute('href', /\/lessons\/pythagorean-theorem\/$/);
	});

	test('入口診断の操作はGA4中核ループイベント(experiment_interact等)を発火しない', async ({ page }) => {
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});
		await page.goto(COURSE_PATH);
		await page.waitForLoadState('networkidle');
		const diagnostic = page.locator('section[aria-labelledby="course-diagnostic-title"]');
		await diagnostic.waitFor();

		await diagnostic.getByRole('radio', { name: '15', exact: true }).check();
		await diagnostic.getByRole('radio', { name: '0.5' }).check();
		await diagnostic.getByRole('radio', { name: '7.5' }).check();
		await diagnostic.getByRole('button', { name: '診断する' }).click();

		const firedNames = await page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);
		expect(firedNames).toEqual([]);
	});
});
