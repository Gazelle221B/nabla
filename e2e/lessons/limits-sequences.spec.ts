import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: LimitsSequencesExperiment(数列の極限)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LIMITS_SEQUENCES_PATH = './lessons/limits-sequences/';

test.describe('数列の極限ページ (LimitsSequencesExperiment)', () => {
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
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 公比 r を動かして等比数列の行き先を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 公比rのスライダー・数値入力・表示切替・観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		await selectPredictionRobustly(page, '符号を変えながら暴れ続け、特定の値には近づかない', '0 に近づいていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → r を 0.8→1→1.2→−1 と動かして4分類すべてを観察し、矢印キー操作でも境界を跨いで再分類される、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「公比r=0.8の等比数列を考えます」と図を参照するため、常時マウントの方針)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '符号を変えながら暴れ続け、特定の値には近づかない', '0 に近づいていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 r=0.8 で分類「0へ収束」・a15≈0.04(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const classRow = page.getByRole('row', { name: /^分類/ });
		const a15Row = page.getByRole('row', { name: /^a15/ });
		const s15Row = page.getByRole('row', { name: /^S15/ });
		await expect(classRow.getByRole('cell')).toHaveText('0 へ収束');
		await expect(a15Row.getByRole('cell')).toHaveText('0.04');

		const numberR = page.getByRole('textbox', { name: '公比 r' });

		// r=1(境界ちょうど): 分類「一定」、全項が1のまま、S15=15
		await numberR.fill('1');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('一定(収束、極限は1)');
		await expect(a15Row.getByRole('cell')).toHaveText('1');
		await expect(s15Row.getByRole('cell')).toHaveText('15');

		// r=1.2(発散): 分類「発散」、項が増大し続ける(手計算、再検算済み)
		await numberR.fill('1.2');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('発散');
		await expect(a15Row.getByRole('cell')).toHaveText('12.84');

		// r=-1(境界ちょうど): 分類「振動」、例外なく安全に再計算される
		await numberR.fill('-1');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('振動(収束しない)');
		await expect(a15Row.getByRole('cell')).toHaveText('1');

		// 矢印キー(ArrowRight)単独でも1ステップ操作でき、r=-1→-0.9 と境界を跨いで
		// 「振動」から「0へ収束」へ再分類される(End だけでなく矢印キーの動作も担保する)。
		const sliderR = page.getByRole('slider', { name: '公比 r(スライダー)' });
		await sliderR.focus();
		await sliderR.press('ArrowRight');
		await expect(classRow.getByRole('cell')).toHaveText('0 へ収束');

		// 表示切替(部分和)に切り替えても例外なく表示され続ける
		await page.getByRole('radio', { name: '部分和 (n, Sₙ)' }).check();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
