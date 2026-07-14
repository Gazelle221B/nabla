import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M7: LinearTransformationExperiment(一次変換と行列式)の実ブラウザ検証。ユニットテストは
// Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(単位正方形+変換後の
// 平行四辺形+基底ベクトルの像)・キーボード操作・鏡映プリセットでの向き反転(det<0)を
// ここで担保する。
const LINEAR_TRANSFORMATION_PATH = './lessons/linear-transformation-2d/';

test.describe('一次変換と行列式ページ (LinearTransformationExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(dot-product 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 行列の成分を変えて単位正方形の変換を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 成分スライダー/数値入力/プリセット/観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(dot-product 以降で標準化した
		// 二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '行列式(の絶対値)で決まる', 'トレース(対角成分の和)で決まる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 鏡映プリセットに切り替えて向き反転(det<0)を確認 → 矢印キーで操作しても例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '行列式(の絶対値)で決まる', 'トレース(対角成分の和)で決まる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=2,b=1,c=0,d=1)で行列式=2、実測面積=2、向き=保持
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const detRow = page.getByRole('row', { name: /^行列式/ });
		await expect(detRow.getByRole('cell')).toHaveText('2');
		const orientationRow = page.getByRole('row', { name: /^向き/ });
		await expect(orientationRow.getByRole('cell')).toHaveText('保持');

		// 鏡映行列プリセットに切り替える → 行列式=-1、面積比は1のまま、向きだけが反転する
		// (この単元の核心の誤解を反証する具体例)。
		await page.getByRole('button', { name: /鏡映行列/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('-1');
		const ratioRow = page.getByRole('row', { name: /^面積比/ });
		await expect(ratioRow.getByRole('cell')).toHaveText('1');
		await expect(orientationRow.getByRole('cell')).toHaveText('反転');
		await expect(page.getByText(/向きが反転しています/)).toBeVisible();

		// 成分 a のスライダーを矢印キー(ArrowRight)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		const sliderA = page.getByRole('slider', { name: '成分 a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('ArrowRight');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
