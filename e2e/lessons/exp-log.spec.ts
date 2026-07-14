import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: ExpLogExperiment(指数関数と対数関数)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const EXP_LOG_PATH = './lessons/exp-log/';

test.describe('指数関数と対数関数ページ (ExpLogExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(quadratic-equation 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 指数関数のグラフを折り返して対数関数のグラフを見つける' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(
			page,
			'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
			'折り返しても y=2^x のグラフのままで、形は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → a・t を操作 → 対応点の鏡映(往復 log_a(a^t)=t)が保たれる基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
			'折り返しても y=2^x のグラフのままで、形は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=2,t=1)で a^t=2, log_a(a^t)=1(往復一致)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const atRow = page.getByRole('row', { name: /^a\^t/ });
		await expect(atRow.getByRole('cell')).toHaveText('2');
		const roundTripRow = page.getByRole('row', { name: /^log_a\(a\^t\)/ });
		await expect(roundTripRow.getByRole('cell')).toHaveText('1');

		// a を数値入力で4に設定 → a^t=4, 往復 log_a(a^t) は依然として t(=1)と一致する
		// (対応点の鏡映観察: 底を変えても「a^tを対数で戻すと元のtに戻る」関係は崩れない)。
		const numberA = page.getByRole('textbox', { name: '底 a' });
		await numberA.fill('4');
		await numberA.blur();
		await expect(atRow.getByRole('cell')).toHaveText('4');
		await expect(roundTripRow.getByRole('cell')).toHaveText('1');
		await expect(page.getByText(/確かに元の t/)).toBeVisible();

		// t を数値入力で-2に設定 → 境界を超えても例外なく安全に表示される。
		const numberT = page.getByRole('textbox', { name: '対応点のパラメータ t' });
		await numberT.fill('-2');
		await numberT.blur();
		const tRow = page.getByRole('row', { name: /^パラメータ t/ });
		await expect(tRow.getByRole('cell')).toHaveText('-2');
		await expect(roundTripRow.getByRole('cell')).toHaveText('-2');

		// t のスライダーを矢印キー(ArrowRight)単独で操作しても例外なく状態が更新される
		// (quadratic-equation C3 と同じ観点)。
		const sliderT = page.getByRole('slider', { name: '対応点のパラメータ t(スライダー)' });
		await sliderT.focus();
		await sliderT.press('ArrowRight');
		await expect(tRow.getByRole('cell')).toHaveText('-1.9');
		await expect(roundTripRow.getByRole('cell')).toHaveText('-1.9');
	});
});
