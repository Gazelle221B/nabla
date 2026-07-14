import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M3: EigenvectorExperiment(2×2行列と固有ベクトル)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const EIGENVECTORS_PATH = './lessons/eigenvectors/';

test.describe('固有ベクトルページ (EigenvectorExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 単位ベクトルを回して固有ベクトルを見つける' }),
		).toBeVisible();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 角度操作 → 固有ベクトル方向で揃うことの基本フローが機能する', async ({ page }) => {
		// このページは記事本文(導入・形式的定義・誤解の説明)が長く、client:visible の島は
		// 標準的なビューポートでは初期表示位置の外にある。ビューポートを縦に十分広げて記事
		// 全体を初期表示に収めることでスクロール操作自体を不要にする。
		await page.setViewportSize({ width: 1280, height: 4000 });
		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// 予想を選んで確定する(ハイドレーション未完了時の取りこぼし対策は
		// selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(
			page,
			'特定の向きの v でだけ、Av が v と同じ(または正反対)の向きになる',
			'v をどの向きにしても、Av が v と同じ向きになることはない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 既定の伸縮行列 [[2,1],[1,2]] は 45° 方向 (v=(1,1)/√2) が固有ベクトル (固有値3)。
		// 角度入力で 45 度に設定し、v と Av が揃うことを確認する。
		const numberAngle = page.getByRole('textbox', { name: 'v の向き(度)' });
		await numberAngle.fill('45');
		await numberAngle.blur();

		await expect(page.getByText(/揃いました/)).toBeVisible();
		const residualRow = page.getByRole('row', { name: /残差/ });
		await expect(residualRow).toContainText('≈ 0');

		// 角度スライダーをキーボード(矢印キー)で操作しても状態が更新される
		// (ドラッグ以外の代替操作、docs/DESIGN.md §非機能要件)。45度から1度動かすと
		// 固有ベクトルの向きから外れ、「揃いました」表示が消える。
		const sliderAngle = page.getByRole('slider', { name: 'v の向き(度)' });
		await sliderAngle.focus();
		await sliderAngle.press('ArrowRight');
		await expect(page.getByText(/揃いました/)).toHaveCount(0);

		// 回転行列プリセットに切り替えると、どの角度でも揃わない(誤解例)。
		await page.getByRole('radio', { name: /回転行列/ }).check();
		await expect(page.getByText(/一度も揃うことがありません/)).toBeVisible();
		await expect(page.getByText(/この向きでは v と Av の向きはまだ揃っていません/)).toBeVisible();
	});
});
