import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP 2 第1単元: FourierSeriesExperiment(フーリエ級数 — 回転する円で角ばった波を作る)の
// 実ブラウザ検証。ユニットテストは Mafs シーンをスタブ化しているため、実際のハイドレーション・
// Mafs(エピサイクル+波形の2パネル)描画・キーボード操作をここで担保する。ADR-004: この単元は
// エピサイクル型負荷(N<=50、少数要素×高頻度更新)であり Tier 1(Mafs/SVG)のまま実装している。
const FOURIER_SERIES_PATH = './lessons/fourier-series/';

test.describe('フーリエ級数ページ (FourierSeriesExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(他単元と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2800 });
		await page.goto(FOURIER_SERIES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 回転する円をいくつも足し重ねて、角ばった波を作る' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2800 });
		await page.goto(FOURIER_SERIES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) N・tのスライダー・数値入力・観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作UIのa11yが担保されない(標準化した二段構成)。
		await selectPredictionRobustly(
			page,
			'できる(いくらでも近づき、角もそのまま再現できる)',
			'ほぼできるが、角のそばだけどうしても帳尻が合わない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 項数Nを1→10→50と上げてもツノ(最大値約1.18)が残り続けることを観察し、矢印キー操作でも例外なく再計算される', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2800 });
		await page.goto(FOURIER_SERIES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'できる(いくらでも近づき、角もそのまま再現できる)',
			'ほぼできるが、角のそばだけどうしても帳尻が合わない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const numberN = page.getByRole('textbox', { name: '項数 N' });

		// N=1(境界): 1項でも行き過ぎる(S1(t)=4/π なので t=π/2 でも1を超える、node再検算済み)。
		await numberN.fill('1');
		await numberN.blur();
		const nRow = page.getByRole('row', { name: /^項数 N/ });
		await expect(nRow.getByRole('cell')).toHaveText('1');

		// N=10, 25, 50 と増やしても「最大値」が約1.18のまま残り続ける(ギブス現象、
		// node再検算済みgolden値: N=10→1.18, N=25→1.18, N=50→1.18、いずれも1へ戻らない)。
		for (const n of [10, 25, 50]) {
			await numberN.fill(String(n));
			await numberN.blur();
			await expect(nRow.getByRole('cell')).toHaveText(String(n));
			const maxRow = page.getByRole('row', { name: new RegExp(`^S${n} の最大値`) });
			await expect(maxRow.getByRole('cell')).toHaveText('1.18');
		}

		// 矢印キー(ArrowLeft)単独でも1ステップ操作でき、例外なく再計算される
		// (End だけでなく矢印キーの動作も担保する)。
		const sliderN = page.getByRole('slider', { name: '項数 N(スライダー)' });
		await sliderN.focus();
		await sliderN.press('ArrowLeft');
		await expect(nRow.getByRole('cell')).toHaveText('49');

		// 時刻tのスライダーも矢印キーで操作でき、例外なく再計算される。
		const sliderT = page.getByRole('slider', { name: '時刻 t(スライダー)' });
		await sliderT.focus();
		await sliderT.press('ArrowRight');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
