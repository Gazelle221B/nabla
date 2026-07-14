import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: TaylorApproximationExperiment(テイラー展開による近似)の実ブラウザ検証。
// ユニットテストは Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画・
// キーボード操作をここで担保する。
const TAYLOR_APPROXIMATION_PATH = './lessons/taylor-approximation/';

test.describe('テイラー展開による近似ページ (TaylorApproximationExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(probability-distribution 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 次数を上げて、曲線にどこまで寄り添えるか' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 次数スライダー・関数選択・評価点xのスライダー・観察テーブルは予想確定後にのみ
		// マウントされるため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した
		// 二段構成)。
		await selectPredictionRobustly(
			page,
			'関数や x によっては、次数を上げてもかえって誤差が大きくなることがある',
			'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → log1p に切り替えて x=1.5 で次数を上げ誤差増大を観察し、矢印キー操作でも次数が変わる、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「下の実験には...があります」と図を参照するため、常時マウントの方針)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'関数や x によっては、次数を上げてもかえって誤差が大きくなることがある',
			'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(sin, degree=1, x=2)で P1(2)=2(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const errorRow = page.getByRole('row', { name: /^\|誤差\|/ });
		await expect(page.getByRole('row', { name: /^P1\(x\)/ }).getByRole('cell')).toHaveText('2');

		// log1p に切り替え、評価点 x を 1.5(収束半径1の外側)に設定する。
		await page.getByRole('radio', { name: 'f(x) = ln(1+x)' }).click();
		const numberX = page.getByRole('textbox', { name: '評価点 x の位置' });
		await numberX.fill('1.5');
		await numberX.blur();

		const sliderDegree = page.getByRole('slider', { name: '近似の次数 n(スライダー)' });

		// 次数 n=4: |誤差|≈0.68(手計算、再検算済み)
		await sliderDegree.fill('4');
		await expect(errorRow.getByRole('cell')).toHaveText('0.68');

		// 次数 n=8: |誤差|≈1.82(拡大)
		await sliderDegree.fill('8');
		await expect(errorRow.getByRole('cell')).toHaveText('1.82');

		// 次数 n=12: |誤差|≈6.27(さらに拡大——反例の核心部分)
		await sliderDegree.fill('12');
		await expect(errorRow.getByRole('cell')).toHaveText('6.27');

		// 矢印キー(ArrowLeft)単独でも1ステップ操作でき、次数が11へ変わる
		// (End だけでなく矢印キーの動作も担保する)。
		await sliderDegree.focus();
		await sliderDegree.press('ArrowLeft');
		await expect(page.getByRole('row', { name: /^次数 n/ }).getByRole('cell')).toHaveText('11');
	});
});
