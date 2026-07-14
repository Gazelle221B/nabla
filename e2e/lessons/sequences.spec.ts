import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M6: SequenceExperiment(数列 — 等差数列と等比数列)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(点列+等差モードの直線重ね)・
// キーボード操作・タイプ切替(等差/等比)をここで担保する。
const SEQUENCES_PATH = './lessons/sequences/';

test.describe('数列ページ (SequenceExperiment)', () => {
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
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 初項と公差(公比)を動かして点の並び方を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/タイプ切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'まっすぐ一直線に並ぶ', 'ばらばら');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 公差の操作 → 等比切替 → 退化ケース(r=0)まで例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'まっすぐ一直線に並ぶ', 'ばらばら');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(等差, a1=1, d=2)で aₙ の第1項は1
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const aRow = page.getByRole('row', { name: /^aₙ/ });
		await expect(aRow.getByRole('cell').first()).toHaveText('1');

		// 公差 d のスライダーをキーボード (End=可動域最大5) で操作 → 階差の列が5に更新
		const sliderD = page.getByRole('slider', { name: '公差 d(スライダー)' });
		await sliderD.focus();
		await sliderD.press('End');
		const diffRow = page.getByRole('row', { name: /^階差/ });
		await expect(diffRow.getByRole('cell').first()).toHaveText('5');

		// 矢印キー(ArrowLeft)単独でも1ステップ操作できる(End だけでなく矢印キーの動作も担保する、
		// GrokBuild C3 と同じ観点)。
		await sliderD.press('ArrowLeft');
		await expect(diffRow.getByRole('cell').first()).toHaveText('4');

		// 等比数列に切り替え、公比 r=0(退化ケース: 第2項以降が0になる)にしても例外なく
		// 安全に表示される(タスク厳守事項: 等比 r=0/負/a1=0 で例外なし)。
		await page.getByRole('radio', { name: '等比数列' }).check();
		const numberR = page.getByRole('textbox', { name: '公比 r' });
		await numberR.fill('0');
		await numberR.blur();

		await expect(aRow.getByRole('cell').first()).toHaveText('1');
		await expect(aRow.getByRole('cell').nth(1)).toHaveText('0');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
