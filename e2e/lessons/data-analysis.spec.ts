import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: DataAnalysisExperiment(データの分析 — 平均・分散・相関)の実ブラウザ検証。ユニットテストは
// Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(5固定点+1可動点+平均点マーカー)・
// キーボード操作・外れ値移動による相関係数の変化・全点同一xでの safe 表示をここで担保する。
const DATA_ANALYSIS_PATH = './lessons/data-analysis/';

test.describe('データの分析ページ (DataAnalysisExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(dot-product 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 散布図の点を動かして平均・分散・相関係数の変化を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 可動点のスライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '平均も相関係数も大きく変わる', '点は1個だけなので、平均も相関係数もほとんど変わらない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 初期値を確認 → 外れ値(y=-5)で相関係数が大きく変わる → xを1増やすとさらに変わる(外れ値の「距離」が効く)、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)。散布図(Scene)自体は
		// ゲート前から表示される(GrokBuild 指摘の是正: 本文が図を参照するため)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '平均も相関係数も大きく変わる', '点は1個だけなので、平均も相関係数もほとんど変わらない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(可動点=(8,8))で相関係数は0.98(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const rRow = page.getByRole('row', { name: /^相関係数 r/ });
		await expect(rRow.getByRole('cell')).toHaveText('0.98');

		// 可動点の y 座標を数値入力で -5 に設定 → 5固定点の右上がりの傾向から大きく外れ、
		// 相関係数が激変する(手計算、再検算済み: 0.98 → -0.37)。
		const numberY = page.getByRole('textbox', { name: '可動点の y 座標' });
		await numberY.fill('-5');
		await numberY.blur();
		await expect(rRow.getByRole('cell')).toHaveText('-0.37');

		// 矢印キー(ArrowRight)単独で可動点の x を1ステップ動かす(8→9)と、相関係数が
		// さらに変わる(-0.37 → -0.46)。旧配置(固定5点が縦一列)では x をどれだけ動かしても
		// |r| が不変だった(QA_MEMORY FAIL 指摘)——外れ値の「距離」が効くことの回帰検証。
		const sliderX = page.getByRole('slider', { name: '可動点の x 座標(スライダー)' });
		await sliderX.focus();
		await sliderX.press('ArrowRight');
		await expect(rRow.getByRole('cell')).toHaveText('-0.46');
	});
});
