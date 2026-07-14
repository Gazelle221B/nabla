import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: GraphTheoryExperiment(グラフ理論入門 — 一筆書きとオイラー路)の実ブラウザ検証。
// ユニットテストは GraphScene(SVG)を実コンポーネントのまま結合テスト済みだが、実際の
// ハイドレーション・SVG描画・キーボードでの辺トグルはここで実ブラウザ上で担保する。
const GRAPH_THEORY_PATH = './lessons/graph-theory-intro/';

test.describe('グラフ理論入門ページ (GraphTheoryExperiment)', () => {
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
		await page.goto(GRAPH_THEORY_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 橋(辺)をON/OFFして一筆書きの可否を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(GRAPH_THEORY_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。Scene(SVG図)はこの時点でも常時マウントされている。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) プリセット切替・辺のON/OFFトグル・観察表は予想確定後にのみ現れる(あるいは
		// 操作可能になる)ため、確定前 axe だけでは操作 UI の a11y が担保されない
		// (標準化した二段構成)。
		await selectPredictionRobustly(page, 'できる', 'できない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 橋(辺)をクリックでOFF → 奇数次数4→2・判定「不可能」→「可能」の変化を観察し、キーボード(Enter)でも同じ操作ができる、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(GRAPH_THEORY_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「下の図はケーニヒスベルクの7つの橋です」と図を参照するため、常時マウントの方針)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		await expect(page.getByRole('img', { name: /グラフの図/ })).toBeVisible();

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'できる', 'できない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期状態(ケーニヒスベルク・全7辺ON)で奇数次数4・判定「不可能」
		// (手計算・再検算済み、graphTheory.test.ts の黄金値テストと同じ値)。
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const oddCountRow = page.getByRole('row', { name: /^奇数次数の頂点数/ });
		const judgementRow = page.getByRole('row', { name: /^判定: 一筆書き/ });
		await expect(oddCountRow.getByRole('cell')).toHaveText('4');
		await expect(judgementRow.getByRole('cell')).toHaveText('不可能');

		// 辺 A-D(唯一の重複のない橋)をクリックでOFFにすると、奇数次数が4→2に減り、
		// 判定が「可能(出発点には戻れない)」に変わる。
		const bridgeAD = page.getByRole('switch', { name: /^辺 A-D/ });
		await bridgeAD.click();
		await expect(bridgeAD).toHaveAttribute('aria-checked', 'false');
		await expect(oddCountRow.getByRole('cell')).toHaveText('2');
		await expect(judgementRow.getByRole('cell')).toHaveText('可能(出発点には戻れない)');

		// キーボード(Enter)でも同じ辺をONに戻せる(クリックだけに依存しないことの担保)。
		await bridgeAD.focus();
		await bridgeAD.press('Enter');
		await expect(bridgeAD).toHaveAttribute('aria-checked', 'true');
		await expect(oddCountRow.getByRole('cell')).toHaveText('4');
		await expect(judgementRow.getByRole('cell')).toHaveText('不可能');

		// プリセットを「五芒星」に切り替えると、辺がすべてONの状態で奇数次数0・
		// 判定「可能(出発点に戻れる)」になる(手計算・再検算済み)。
		await page.getByRole('radio', { name: /五芒星/ }).check();
		await expect(oddCountRow.getByRole('cell')).toHaveText('0');
		await expect(judgementRow.getByRole('cell')).toHaveText('可能(出発点に戻れる)');

		// 判定式と構成的アルゴリズムの実行時交差検証が常に「一致しています」と表示される。
		await expect(page.getByText(/一致しています/)).toBeVisible();
	});
});
