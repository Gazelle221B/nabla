import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M2: DerivativeExperiment(微分係数と接線)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const DERIVATIVE_PATH = './lessons/derivative-tangent-line/';

test.describe('微分係数と接線ページ (DerivativeExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(DERIVATIVE_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 割線を接線に近づける' })).toBeVisible();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(DERIVATIVE_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → h スライダー操作 → 割線の傾きが微分係数に近づく基本フローが機能する', async ({
		page,
	}) => {
		// このページは記事本文(導入・形式的定義・誤解の説明)が長く、client:visible の島は
		// 標準的なビューポートでは初期表示位置の外にある。ビューポートを縦に十分広げて記事
		// 全体を初期表示に収めておくと、ページ読み込み時点で島が既に交差済みとなり
		// goto 直後には概ねハイドレーションが完了しているため、素朴な操作でも安定する
		// (実際のハイドレーション未完了レースへの耐性は selectPredictionRobustly が担保する
		// ので、ここでは「スクロール操作自体が要らない経路」の確認に主眼を置く。
		// 標準ビューポートでスクロールが必要な経路は次のテストで別途検証する)。
		await page.setViewportSize({ width: 1280, height: 4000 });
		await page.goto(DERIVATIVE_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '微分係数(接線の傾き)に近づく', '0 に近づく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (a=1, h=1) で割線の傾き=3、微分係数=2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const secantRow = page.getByRole('row', { name: /^割線の傾き/ });
		await expect(secantRow.getByRole('cell')).toHaveText('3');

		// h のスライダーをキーボード (Home=最小 0.05) で操作 → 割線の傾きが微分係数 (2) に近づく
		const sliderH = page.getByRole('slider', { name: 'h(a からの距離)(スライダー)' });
		await sliderH.focus();
		await sliderH.press('Home');

		await expect(secantRow.getByRole('cell')).toHaveText('2.05');
	});

	test('通常ビューポート → スクロール → ハイドレーション → 操作可能、という実ユーザー経路が機能する', async ({
		page,
	}) => {
		// 上のテストはビューポートを縦に拡大してスクロール自体を不要にすることでレースを
		// 構造的に避けているが、実際の読者は標準的な画面サイズで記事を読み進めてスクロール
		// することで client:visible の島と交差する。その経路も別途検証する
		// (レビュー指摘: height:4000 方式だけでは実ユーザー経路を検証できていない)。
		await page.goto(DERIVATIVE_PATH);
		await page.waitForLoadState('networkidle');

		// 標準ビューポートでは実験セクションは初期表示外にあるはず
		await expect(
			page.getByRole('heading', { name: '実験: 割線を接線に近づける' }),
		).not.toBeInViewport();

		await page
			.getByRole('heading', { name: '実験: 割線を接線に近づける' })
			.scrollIntoViewIfNeeded();

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '微分係数(接線の傾き)に近づく', '0 に近づく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
