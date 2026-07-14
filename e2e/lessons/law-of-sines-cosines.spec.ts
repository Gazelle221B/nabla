import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M5: LawOfSinesCosinesExperiment(正弦定理・余弦定理)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LAW_OF_SINES_COSINES_PATH = './lessons/law-of-sines-cosines/';

test.describe('正弦定理・余弦定理ページ (LawOfSinesCosinesExperiment)', () => {
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
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 三角形の形を変えて正弦定理・余弦定理を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(trigonometric-ratios/similar-figures/inscribed-angle
		// で標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '3つとも等しい値になる', 'バラバラな値になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 角Aの操作 → 正弦定理の比が一致し続け、退化境界でも安全に表示される基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '3つとも等しい値になる', 'バラバラな値になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(角A=90°, b=3, c=4)で辺a=5、a÷sinA・b÷sinB・c÷sinC はすべて5
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const sideARow = page.getByRole('row', { name: /^辺 a/ });
		await expect(sideARow.getByRole('cell')).toHaveText('5');
		const ratioRow = page.getByRole('row', { name: /^a÷sinA/ });
		await expect(ratioRow.getByRole('cell')).toHaveText('5 / 5 / 5');

		// 角Aのスライダーをキーボード (End=上限180、三角形が一直線に潰れる退化ケース) で
		// 操作すると、比は安全に「定義されません」と表示される(クラッシュしない)。
		const sliderAngleA = page.getByRole('slider', { name: '角 A(度)(スライダー)' });
		await sliderAngleA.focus();
		await sliderAngleA.press('End');
		await expect(ratioRow.getByRole('cell')).toHaveText('定義されません');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、角Aが退化境界(180度)から離れて
		// 比が再び定義される(End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		await sliderAngleA.press('ArrowLeft');
		await expect(ratioRow.getByRole('cell')).not.toHaveText('定義されません');

		// GrokBuild H1 回帰: 辺 c を辺 b と同値(3)にして角 A=0° にすると B≡C の退化になる。
		// 修正前は angleAtVertex がゼロ長ベクトルで RangeError を投げ render がクラッシュした
		// 到達可能な UI 経路。安全に「定義されません」表示のままページが生きていることを確認する。
		const numberC = page.getByRole('textbox', { name: '辺 c = AB の長さ' });
		await numberC.fill('3');
		await numberC.blur();
		const numberAngleA = page.getByRole('textbox', { name: '角 A(度)' });
		await numberAngleA.fill('0');
		await numberAngleA.blur();
		await expect(ratioRow.getByRole('cell')).toHaveText('定義されません');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
