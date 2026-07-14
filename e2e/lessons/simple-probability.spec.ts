import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

const SIMPLE_PROBABILITY_PATH = './lessons/simple-probability/';

test.describe('確率ページ (ProbabilityExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(linear-transformation-2d 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: サイコロを振る回数を増やして相対度数の変化を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) n のスライダー/数値入力/振り直す/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(dot-product 以降で標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'どの目もほぼ同じ割合に落ち着く', 'どれか1つの目に偏っていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → n を増やすと理論確率との差が縮む観察(固定初期シードなので決定的)→ 矢印キー操作も例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'どの目もほぼ同じ割合に落ち着く', 'どれか1つの目に偏っていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 初期値(seed=42, n=10)での「理論確率との差」の最大絶対値を読む。
		const diffRow = page.getByRole('row', { name: /^理論確率との差/ });
		const initialDiffs = (await diffRow.getByRole('cell').allTextContents()).map(Number);
		const initialMaxAbsDiff = Math.max(...initialDiffs.map(Math.abs));

		// 数値入力で n=6000 に設定する(固定初期シードなので決定的な結果になる、統計的フレークにならない)。
		const numberN = page.getByRole('textbox', { name: '試行回数 n' });
		await numberN.fill('6000');
		await numberN.blur();

		await expect(page.getByText(/度数の総和\(6000\)は試行回数 n\(6000\)と一致しています/)).toBeVisible();

		const largeDiffs = (await diffRow.getByRole('cell').allTextContents()).map(Number);
		const largeMaxAbsDiff = Math.max(...largeDiffs.map(Math.abs));
		expect(largeMaxAbsDiff).toBeLessThan(initialMaxAbsDiff);

		// n のスライダーを矢印キー(ArrowLeft)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、linear-transformation-2d C3 と同じ観点)。
		const sliderN = page.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		await sliderN.focus();
		await sliderN.press('ArrowLeft');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
