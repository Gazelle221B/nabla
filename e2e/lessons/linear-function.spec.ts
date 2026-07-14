import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M4: LinearFunctionExperiment(一次関数とグラフ)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LINEAR_FUNCTION_PATH = './lessons/linear-function/';

test.describe('一次関数とグラフページ (LinearFunctionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ。こうしないとハイドレーション自体が起きず「例外0」が空振りで
		// 通ってしまう(独立レビュー GrokBuild U1)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 傾き a と切片 b を動かす' })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(LINEAR_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 傾き操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(
			page,
			'右上がりの直線から右下がりの直線に変わる',
			'y 軸との交点(切片)が変わる',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (a=2, b=1) で y 切片=(0, 1)、2点法の傾き=2 と一致
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const slopeRow = page.getByRole('row', { name: /から求めた傾き/ });
		await expect(slopeRow.getByRole('cell')).toHaveText('2');

		// 傾き a のスライダーをキーボード (End=最大 3) で操作 → a=3 に更新され、
		// 2点法で求めた傾きも 3 のまま一致し続ける(傾き不変性)
		const sliderA = page.getByRole('slider', { name: '傾き a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');

		const aRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^傾き a/ }) });
		await expect(aRow.getByRole('cell')).toHaveText('3');
		await expect(slopeRow.getByRole('cell')).toHaveText('3');
	});
});
