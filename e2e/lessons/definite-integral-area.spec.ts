import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M6: DefiniteIntegralExperiment(定積分と面積)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(曲線+長方形 n 本)・
// キーボード操作・関数切替をここで担保する。
const DEFINITE_INTEGRAL_AREA_PATH = './lessons/definite-integral-area/';

test.describe('定積分と面積ページ (DefiniteIntegralExperiment)', () => {
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
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 長方形の本数を増やして面積を近似する' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/関数切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'ある一定の値に近づく', '限りなく大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → n の操作 → 合計面積が厳密な面積へ近づく基本フローが機能する', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'ある一定の値に近づく', '限りなく大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(f(x)=x^2, n=4)で合計面積=0.22、厳密な面積=0.33
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const approxRow = page.getByRole('row', { name: /^長方形の合計面積/ });
		await expect(approxRow.getByRole('cell')).toHaveText('0.22');
		const exactRow = page.getByRole('row', { name: /^厳密な面積/ });
		await expect(exactRow.getByRole('cell')).toHaveText('0.33');

		// n のスライダーをキーボード (End=可動域最大 64) で操作 → 合計面積が厳密な面積へ近づく
		// (中核体験: n を増やすと差が縮む)。
		const nRow = page.getByRole('row', { name: /^n\(/ });
		const sliderN = page.getByRole('slider', { name: '長方形の本数 n(スライダー)' });
		await sliderN.focus();
		await sliderN.press('End');
		await expect(nRow.getByRole('cell')).toHaveText('64');
		const approxAtN4 = 0.21875;
		const exactValue = 1 / 3;
		const approxTextAtN64 = await approxRow.getByRole('cell').textContent();
		const diffAtN4 = Math.abs(approxAtN4 - exactValue);
		const diffAtN64 = Math.abs(Number(approxTextAtN64) - exactValue);
		expect(diffAtN64).toBeLessThan(diffAtN4);

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点、derivative-function
		// と同じ観点で単独テストとして担保する)。
		await sliderN.press('ArrowLeft');
		await expect(nRow.getByRole('cell')).toHaveText('63');

		// 関数を f(x)=x+1 に切り替えると、厳密な面積の値が変わる(収束先が変わる)。
		await page.getByRole('radio', { name: 'f(x) = x + 1' }).check();
		await expect(exactRow.getByRole('cell')).toHaveText('1.5');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
