import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M6: DerivativeFunctionExperiment(導関数 — 微分係数から関数へ)の実ブラウザ検証。ユニット
// テストは Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(上下2段)・
// キーボード操作・関数切替をここで担保する。
const DERIVATIVE_FUNCTION_PATH = './lessons/derivative-function/';

test.describe('導関数ページ (DerivativeFunctionExperiment)', () => {
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
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 接線の傾きを集めて導関数のグラフを作る' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/関数切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '直線になる', '放物線になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 点 a の操作 → f(a)・f’(a) が数学モデル通りに更新される基本フローが機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '直線になる', '放物線になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(f(x)=x^2, a=1)で f(a)=1、微分係数=2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const faRow = page.getByRole('row', { name: /^f\(a\)/ });
		await expect(faRow.getByRole('cell')).toHaveText('1');
		const derivRow = page.getByRole('row', { name: /^微分係数/ });
		await expect(derivRow.getByRole('cell')).toHaveText('2');

		// a のスライダーをキーボード (End=可動域最大 2) で操作 → f(a)=4, f'(a)=4 に更新
		const sliderA = page.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');
		await expect(faRow.getByRole('cell')).toHaveText('4');
		await expect(derivRow.getByRole('cell')).toHaveText('4');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		await sliderA.press('ArrowLeft');
		await expect(faRow.getByRole('cell')).not.toHaveText('4');
		await expect(derivRow.getByRole('cell')).not.toHaveText('4');

		// 関数を f(x)=x^3 に切り替えると、導関数のグラフの形が変わる。数値入力で a=1 に戻し、
		// 切替直後の再クランプでも例外が起きないことを確認する。
		const numberA = page.getByRole('textbox', { name: '接点 a の位置' });
		await numberA.fill('1');
		await numberA.blur();
		await expect(faRow.getByRole('cell')).toHaveText('1');
		await page.getByRole('radio', { name: 'f(x) = x³' }).check();
		await expect(faRow.getByRole('cell')).toHaveText('1');
		await expect(derivRow.getByRole('cell')).toHaveText('3');

		// 関数切替直後、可動域の外にあった a(切替前に x^2 の可動域最大 2 まで動かしていた)は
		// 新しい可動域 [-1.5, 1.5] へ再クランプされ、境界でも例外なく観察が続く
		// (タスク厳守事項: 関数切替直後の境界入力で例外がレンダーに漏れないこと)。
		await sliderA.focus();
		await sliderA.press('End');
		await expect(faRow.getByRole('cell')).toHaveText('3.38'); // f(1.5)=1.5^3=3.375 → round2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
