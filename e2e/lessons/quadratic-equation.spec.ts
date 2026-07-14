import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: QuadraticEquationExperiment(二次方程式と判別式)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const QUADRATIC_EQUATION_PATH = './lessons/quadratic-equation/';

test.describe('二次方程式と判別式ページ (QuadraticEquationExperiment)', () => {
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
		await page.goto(QUADRATIC_EQUATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 放物線を上下に動かして交点の個数を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_EQUATION_PATH);
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
			'放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
			'放物線を上下に動かしても、x軸との交点の個数は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → c を大きくする操作 → 交点が2個→1個→0個と減っていく基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_EQUATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(
			page,
			'放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
			'放物線を上下に動かしても、x軸との交点の個数は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=1,b=-4,c=3)で D=4、交点2個、解={1,3}
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const dRow = page.getByRole('row', { name: /^判別式 D/ });
		await expect(dRow.getByRole('cell')).toHaveText('4');
		const countRow = page.getByRole('row', { name: /^x軸との交点の個数/ });
		await expect(countRow.getByRole('cell')).toHaveText('2個(異なる2つの実数解)');

		// c を数値入力で4に設定 → D=0(重解)、交点1個
		const numberC = page.getByRole('textbox', { name: '係数 c(y切片)' });
		await numberC.fill('4');
		await numberC.blur();
		await expect(dRow.getByRole('cell')).toHaveText('0');
		await expect(countRow.getByRole('cell')).toHaveText('1個(重解)');

		// さらに c を5に設定 → D=-4(実数解なし)、交点0個。境界を超えても例外なく安全に表示される。
		await numberC.fill('5');
		await numberC.blur();
		await expect(dRow.getByRole('cell')).toHaveText('-4');
		await expect(countRow.getByRole('cell')).toHaveText('0個(実数の範囲に解はない)');
		await expect(page.getByText(/実数の範囲に解はないため/)).toBeVisible();

		// c のスライダーを矢印キー(ArrowLeft)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、similar-figures/inscribed-angle C3 と同じ観点)。
		const sliderC = page.getByRole('slider', { name: '係数 c(スライダー)' });
		await sliderC.focus();
		await sliderC.press('ArrowLeft');
		await expect(dRow.getByRole('cell')).toHaveText('0');
		await expect(countRow.getByRole('cell')).toHaveText('1個(重解)');
	});
});
