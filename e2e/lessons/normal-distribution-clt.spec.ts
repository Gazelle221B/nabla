import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP2: CltExperiment(大量試行 — 大数の法則と中心極限定理)の実ブラウザ検証。
// プロジェクト初の Tier 2(Pixi.js/WebGL)単元(ADR-004)。ユニットテストは CltScene を
// スタブ化しているため、実際のハイドレーション・Pixi(WebGL)初期化・キーボード操作は
// ここで担保する。headless Chromium は SwiftShader によるソフトウェア WebGL 実装を持つため、
// 実 GPU なしでも Pixi の初期化(app.init({ preference: 'webgl' }))が成功することを確認する。
const CLT_PATH = './lessons/normal-distribution-clt/';
const CLT_HEADING = '実験: サイコロを何個も足して、試行回数と個数を変えてみる';
const CLT_PREDICTION_TARGET = '真ん中が高い山形(釣鐘のような形)になる';
const CLT_PREDICTION_DECOY = 'でこぼこで、特に規則性はない';

test.describe('大量試行ページ (CltExperiment, Tier2/Pixi.js)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション・Pixi初期化含む)', async ({
		page,
	}) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible。ビューポートを縦に広げて初期表示に含め、ハイドレーション
		// (Pixi Application の初期化を含む)を確実に走らせる。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CLT_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: CLT_HEADING })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想確定前・確定後の二段階)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CLT_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		const beforeResults = await new AxeBuilder({ page }).analyze();
		const beforeCriticalOrSerious = beforeResults.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(beforeCriticalOrSerious, JSON.stringify(beforeCriticalOrSerious, null, 2)).toEqual([]);

		await selectPredictionRobustly(page, CLT_PREDICTION_TARGET, CLT_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察: 標本平均と正規近似' })).toBeVisible();

		const afterResults = await new AxeBuilder({ page }).analyze();
		const afterCriticalOrSerious = afterResults.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(afterCriticalOrSerious, JSON.stringify(afterCriticalOrSerious, null, 2)).toEqual([]);
	});

	test('Pixi(WebGL)が実際に描画している(canvas存在・エラー表示なし) → 予想確定 → k/n操作の基本フローが機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CLT_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察: 標本平均と正規近似' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// Pixi(WebGL)の初期化に失敗すると CltScene.tsx の initError フォールバックにより
		// role="alert" のメッセージが出て canvas は現れない(C-3の精神)。headless Chromium
		// (SwiftShader によるソフトウェア WebGL)でも実際に canvas が生成されることを確認する
		// (「Pixi app 存在」側の確認——描画ピクセルの内容までは検査しない)。
		await expect(page.getByRole('alert')).toHaveCount(0);
		const canvas = page.locator('canvas');
		await expect(canvas).toHaveCount(1);
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);

		await selectPredictionRobustly(page, CLT_PREDICTION_TARGET, CLT_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察: 標本平均と正規近似' })).toBeVisible();

		// 初期値 k=1, n=100, seed=42 で期待値=3.5(centralLimit.test.ts の golden と整合)。
		const meanRow = page.getByRole('row', { name: /^期待値 3\.5k/ });
		await expect(meanRow.getByRole('cell')).toHaveText('3.5');

		// k のスライダーをキーボード (End=最大12) で操作 → 期待値が 3.5×12=42 に更新される
		const sliderK = page.getByRole('slider', { name: 'サイコロの個数 k(スライダー)' });
		await sliderK.focus();
		await sliderK.press('End');
		await expect(meanRow.getByRole('cell')).toHaveText('42');

		// n のスライダーをキーボード (End=最大50,000) で操作しても例外・クラッシュしない
		const sliderN = page.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		await sliderN.focus();
		await sliderN.press('End');
		await expect(page.getByRole('heading', { name: '観察: 標本平均と正規近似' })).toBeVisible();

		// Pixi の canvas は k/n の操作後も存在し続ける(クラッシュしていないことの確認)。
		await expect(canvas).toHaveCount(1);
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});
