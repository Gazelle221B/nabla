import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M5: SimilarityExperiment(相似と拡大縮小)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const SIMILAR_FIGURES_PATH = './lessons/similar-figures/';

test.describe('相似と拡大縮小ページ (SimilarityExperiment)', () => {
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
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 相似の中心から相似比 k で拡大する' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(trigonometric-ratios で標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '面積比は4倍になる', '面積比も2倍になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 相似比 k の操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '面積比は4倍になる', '面積比も2倍になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 k=2 で辺の比=2、面積比=4(元の三角形の面積=3、拡大後=12)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const sideRatioRow = page.getByRole('row', { name: /^辺の比/ });
		await expect(sideRatioRow.getByRole('cell')).toHaveText('2');
		const areaRatioRow = page.getByRole('row', { name: /^面積比/ });
		await expect(areaRatioRow.getByRole('cell')).toHaveText('4');

		// 相似比 k のスライダーをキーボード (End=最大 3) で操作 → 辺の比=3、面積比=9 (k²) に更新
		const sliderK = page.getByRole('slider', { name: '相似比 k(スライダー)' });
		await sliderK.focus();
		await sliderK.press('End');

		const kRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^相似比 k/ } ) });
		await expect(kRow.getByRole('cell')).toHaveText('3');
		await expect(sideRatioRow.getByRole('cell')).toHaveText('3');
		await expect(areaRatioRow.getByRole('cell')).toHaveText('9');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、k・辺の比・面積比が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3)。
		await sliderK.press('ArrowLeft');
		await expect(kRow.getByRole('cell')).not.toHaveText('3');
		await expect(areaRatioRow.getByRole('cell')).not.toHaveText('9');
	});
});
