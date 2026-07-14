import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP3 第3波: 2変数関数の曲面と偏微分(Tier3a/Three.js、SurfacePartialExperiment)。
// LinearTransform3dExperiment のブロックと同じ観点(コンソールエラー0・二段階axe・
// canvas非空ピクセル・離散カメラボタン)を担保する。
const SURFACE_PARTIAL_PATH = './lessons/surface-partial-derivative/';
const SP_HEADING = '実験: 曲面の上で向きを変えて傾きを調べる';
const SP_PREDICTION_TARGET = '向きによって変わる';
const SP_PREDICTION_DECOY = 'どの向きでも同じ';

test.describe('2変数関数の曲面と偏微分ページ (SurfacePartialExperiment, Tier3a/Three.js)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション・WebGL初期化含む)', async ({
		page,
	}) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SURFACE_PARTIAL_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: SP_HEADING })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SURFACE_PARTIAL_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		await selectPredictionRobustly(page, SP_PREDICTION_TARGET, SP_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('WebGL(Three.js)が実際に描画している(canvas非空ピクセル) → 予想確定 → 関数プリセット切替で偏微分が既知例どおりに変化し、離散カメラボタンがキーボード操作できる', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SURFACE_PARTIAL_PATH);
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		await expect(page.getByRole('alert')).toHaveCount(0);
		const canvas = page.locator('canvas');
		await expect(canvas).toHaveCount(1);
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);

		await page.locator('section[data-hydrated="true"]').waitFor();
		await selectPredictionRobustly(page, SP_PREDICTION_TARGET, SP_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 初期値(paraboloid, x0=1, y0=1: ∂f/∂x=2, ∂f/∂y=2)。
		const dxRow = page.getByRole('row', { name: /^∂f\/∂x\(解析解\)/ });
		await expect(dxRow.getByRole('cell')).toHaveText('2');

		// canvas(WebGL + preserveDrawingBuffer:true)が実際に描画されており、単色の空白では
		// ないことを readPixels で確認する(ADR-005)。
		const canvasHasVariedPixels = await page.evaluate(() => {
			const el = document.querySelector('canvas');
			if (!el) return false;
			const gl = (el.getContext('webgl2') || el.getContext('webgl')) as
				| WebGLRenderingContext
				| WebGL2RenderingContext
				| null;
			if (!gl) return false;
			const width = el.width;
			const height = el.height;
			const pixels = new Uint8Array(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			const colors = new Set<string>();
			for (let i = 0; i < pixels.length; i += 4 * 97) {
				colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
			}
			return colors.size > 1;
		});
		expect(canvasHasVariedPixels).toBe(true);

		// 関数プリセット切替 → 偏微分が既知例どおりに変化する(鞍点面・尾根面・平面)。
		await page.getByRole('button', { name: /鞍点面/ }).click();
		await expect(dxRow.getByRole('cell')).toHaveText('2');
		const dyRow = page.getByRole('row', { name: /^∂f\/∂y\(解析解\)/ });
		await expect(dyRow.getByRole('cell')).toHaveText('-2');

		await page.getByRole('button', { name: /尾根面/ }).click();
		await expect(dyRow.getByRole('cell')).toHaveText('0');

		await page.getByRole('button', { name: /^平面/ }).click();
		await expect(dxRow.getByRole('cell')).toHaveText('1');
		await expect(dyRow.getByRole('cell')).toHaveText('2');

		// 離散カメラボタン(キーボード操作代替、ADR-005 §3)。Enter で回転してもエラーや
		// クラッシュが起きず、canvas は存在し続ける。
		const cameraGroup = page.getByRole('group', { name: 'カメラ回転(キーボード操作代替)' });
		await expect(cameraGroup).toBeVisible();
		const rotateRight = cameraGroup.getByRole('button', { name: '右へ回転' });
		await rotateRight.focus();
		await rotateRight.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(canvas).toHaveCount(1);

		const rotateUp = cameraGroup.getByRole('button', { name: '上へ回転' });
		await rotateUp.focus();
		await rotateUp.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);

		const resetViewButton = cameraGroup.getByRole('button', { name: '視点リセット' });
		await resetViewButton.focus();
		await resetViewButton.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(canvas).toHaveCount(1);

		// カメラ操作の後も偏微分の表示(DOM主担保)は影響を受けない。
		await expect(dxRow.getByRole('cell')).toHaveText('1');
		await expect(dyRow.getByRole('cell')).toHaveText('2');
	});
});
