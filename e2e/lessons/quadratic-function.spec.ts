import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M4: QuadraticFunctionExperiment(二次関数とグラフ)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const QUADRATIC_FUNCTION_PATH = './lessons/quadratic-function/';

test.describe('二次関数とグラフページ (QuadraticFunctionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 頂点 (p, q) と開き a を動かす' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		// ハイドレーション完了後の操作 UI(radio/slider 等)まで含めて axe 検査する
		// (未接続 DOM だけを検査して穴が残るのを防ぐ、GrokBuild C2)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 開き a の操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
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
			'開き方が狭くなり、より急な(とがった)グラフになる',
			'開き方は変わらず、頂点の位置だけが動く',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (a=1, p=2, q=-3) で頂点=(2, -3)、対称軸 x=2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const vertexRow = page.getByRole('row', { name: /^頂点の座標/ });
		await expect(vertexRow.getByRole('cell')).toHaveText('(2, -3)');
		const axisRow = page.getByRole('row', { name: /^対称軸/ });
		await expect(axisRow.getByRole('cell')).toHaveText('x = 2');

		// 開き a のスライダーをキーボード (End=最大 3) で操作 → a=3 に更新されても、
		// 頂点の座標(p, q に依らない a)は変わらないまま(頂点が a に依存しないことの確認)
		const sliderA = page.getByRole('slider', { name: '開き a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');

		const aRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^開き a/ } ) });
		await expect(aRow.getByRole('cell')).toHaveText('3');
		await expect(vertexRow.getByRole('cell')).toHaveText('(2, -3)');
	});
});
