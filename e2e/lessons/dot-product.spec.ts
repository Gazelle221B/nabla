import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M7: DotProductExperiment(ベクトルの内積)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(2ベクトル+なす角の弧+直角
// マーカー)・キーボード操作・直角判定(内積≈0)をここで担保する。
const DOT_PRODUCT_PATH = './lessons/dot-product/';

test.describe('ベクトルの内積ページ (DotProductExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(sequences 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 2つのベクトルの向きを動かして内積を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 角度スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(sequences 以降で標準化した
		// 二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '内積はちょうど0になる', '内積は最大になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → bの向きを90°に設定して直角(内積0)を確認 → 矢印キーで動かすと0からずれる、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '内積はちょうど0になる', '内積は最大になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=0°,|a|=3, b=50°,|b|=4)で a の行は (3, 0)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const aRow = page.getByRole('row', { name: /^a\b/ });
		await expect(aRow.getByRole('cell')).toHaveText('(3, 0)');

		// b の向きを数値入力で 90° に設定 → a(0°) と直角になり、成分計算の内積が 0 になる
		const numberB = page.getByRole('textbox', { name: 'b の向き(度)' });
		await numberB.fill('90');
		await numberB.blur();

		const componentRow = page.getByRole('row', { name: /^成分計算/ });
		await expect(componentRow.getByRole('cell')).toHaveText('0');
		await expect(page.getByText(/ちょうど直角です/)).toBeVisible();

		// 矢印キー(ArrowRight)単独でも b のスライダーを1ステップ操作でき、直角から外れて
		// 内積が0でなくなることを確認する(GrokBuild C3 と同じ観点、End だけでなく
		// 矢印キーの動作も担保する単独テスト)。
		const sliderB = page.getByRole('slider', { name: 'b の向き(スライダー)' });
		await sliderB.focus();
		await sliderB.press('ArrowRight');
		await expect(componentRow.getByRole('cell')).not.toHaveText('0');
		await expect(page.getByText(/ちょうど直角です/)).toHaveCount(0);
	});
});
