import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: ProbabilityDistributionExperiment(確率分布と期待値)の実ブラウザ検証。ユニットテストは
// Mafs シーンをスタブ化しているため、実際のハイドレーション・Mafs 描画(棒グラフ+期待値マーカー)・
// キーボード操作・賞金額/本数変更による期待値の変化・n を増やしたときの標本平均の収束傾向を
// ここで担保する。
const PROBABILITY_DISTRIBUTION_PATH = './lessons/probability-distribution/';

test.describe('確率分布と期待値ページ (ProbabilityDistributionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(data-analysis 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: くじの賞金額・本数を変えて期待値と標本平均の関係を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 賞金額/本数/n のスライダー・数値入力・観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		await selectPredictionRobustly(
			page,
			'回数を増やすと、いちばん大きい賞金額に近づいていく',
			'回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 初期値(期待値83.33円)を確認 → 賞金額変更で期待値が動く → nを増やすと標本平均が期待値へ近づく、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。棒グラフ(Scene)自体はゲート前から
		// 表示される(GrokBuild 指摘の是正パターンの踏襲: 本文が図を参照するため)。
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'回数を増やすと、いちばん大きい賞金額に近づいていく',
			'回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(1等300円×1本・2等100円×2本・はずれ0円×3本)で
		// 期待値は83.33円(手計算、再検算済み: 500/6)
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toBeVisible();
		const expectedRow = page.getByRole('row', { name: /^期待値 E\[X\]/ });
		await expect(expectedRow.getByRole('cell')).toHaveText('83.33');

		// 1等の賞金額を数値入力で600に設定 → 期待値が動く(手計算、再検算済み: 83.33 → 133.33)
		const numberPrize1 = page.getByRole('textbox', { name: '1等の賞金額(円)' });
		await numberPrize1.fill('600');
		await numberPrize1.blur();
		await expect(expectedRow.getByRole('cell')).toHaveText('133.33');

		// 矢印キー(ArrowRight)単独ではずれの本数を1ステップ動かす(3→4)と、期待値がさらに変わる
		// (賞金や本数を動かすと期待値が動くという中核性質の回帰検証)。
		const sliderCount3 = page.getByRole('slider', { name: 'はずれの本数(スライダー)' });
		await sliderCount3.focus();
		await sliderCount3.press('ArrowRight');
		// 手計算(再検算済み): 総本数=1+2+4=7, E[X] = (600×1+100×2+0×4)/7 = 800/7 ≈ 114.29
		await expect(expectedRow.getByRole('cell')).toHaveText('114.29');

		// 試行回数 n を最大(End)まで増やすと、標本平均が期待値の近くに収まる
		// (固定シードでの決定的な観察。理論的性質を実ブラウザでも確かめる)。
		const sliderN = page.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		await sliderN.focus();
		await sliderN.press('End');
		const sampleMeanRow = page.getByRole('row', { name: /^標本平均/ });
		await expect(sampleMeanRow).toBeVisible();
		const sampleMeanText = await sampleMeanRow.getByRole('cell').textContent();
		const sampleMean = Number(sampleMeanText);
		expect(Number.isFinite(sampleMean)).toBe(true);
		expect(Math.abs(sampleMean - 114.29)).toBeLessThanOrEqual(15);
	});
});
