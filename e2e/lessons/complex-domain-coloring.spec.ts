import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP3 最終波: 複素関数を見る — ドメインカラーリング(Tier3a/Three.js ShaderMaterial、
// DomainColoringExperiment)。ADR-005 §5「まず ShaderMaterial」の初適用。
// SurfacePartialExperiment のブロックと同じ観点(コンソールエラー0・二段階axe・
// canvas非空ピクセル)に加え、この単元固有の検証として「プローブ点の色相(シェーダー描画)と
// lib/math(evaluateComplex+argDeg)の偏角計算の対応を1点確認する」(GLSL/TS 二重実装の
// ズレ検出網、色→値の逆算は概算でよい)。
const DOMAIN_COLORING_PATH = './lessons/complex-domain-coloring/';
const DC_HEADING = '実験: 複素関数を色で見る(ドメインカラーリング)';
const DC_PREDICTION_TARGET = '一部の情報なら2次元に描ける';
const DC_PREDICTION_DECOY = '描けない(4次元必要)';

test.describe('複素関数を見るページ (DomainColoringExperiment, Tier3a/Three.js ShaderMaterial)', () => {
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
		await page.goto(DOMAIN_COLORING_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: DC_HEADING })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOMAIN_COLORING_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		await selectPredictionRobustly(page, DC_PREDICTION_TARGET, DC_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('WebGL(ShaderMaterial)が実際に描画している(canvas非空ピクセル+プローブ色相の対応1点) → 予想確定 → 関数切替で巻き数が既知例どおりに変化し、ズームボタンがキーボード操作できる', async ({
		page,
	}) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOMAIN_COLORING_PATH);
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		await expect(page.getByRole('alert')).toHaveCount(0);
		const canvas = page.locator('canvas');
		await expect(canvas).toHaveCount(1);
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);

		await page.locator('section[data-hydrated="true"]').waitFor();

		// QA 指摘の反映: 予想ゲート前は関数のカラーマップを表示しない(この単元の予想は
		// 「描けるか?」なので、描けた結果=色こそが答え)。中央画素が無彩色(RGB 各成分の
		// 差が小さい中立グリッド)であることを確認する。
		const preGateSaturation = await page.evaluate(() => {
			const el = document.querySelector('canvas');
			if (!el) return null;
			const gl = el.getContext('webgl2') ?? el.getContext('webgl');
			if (!gl) return null;
			const pixel = new Uint8Array(4);
			gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			return Math.max(pixel[0], pixel[1], pixel[2]) - Math.min(pixel[0], pixel[1], pixel[2]);
		});
		expect(preGateSaturation).not.toBeNull();
		expect(preGateSaturation ?? 255).toBeLessThan(30);

		await selectPredictionRobustly(page, DC_PREDICTION_TARGET, DC_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

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

		// プローブを z=(1,1) に設定する(初期プリセット square: f(z)=z²=(1+i)²=2i=(0,2)、
		// 手計算・再検算済み。|f(z)|=2、arg(f(z))=90°)。
		const probeReInput = page.getByLabel('プローブ z の実部(re)');
		const probeImInput = page.getByLabel('プローブ z の虚部(im)');
		await probeReInput.fill('1');
		await probeReInput.blur();
		await probeImInput.fill('1');
		await probeImInput.blur();

		const fzRow = page.getByRole('row', { name: /^f\(z\)/ });
		await expect(fzRow.getByRole('cell')).toHaveText('(0, 2)');
		const modulusRow = page.getByRole('row', { name: /^\|f\(z\)\|/ });
		await expect(modulusRow.getByRole('cell')).toHaveText('2');
		const argRow = page.getByRole('row', { name: /^arg\(f\(z\)\)/ });
		await expect(argRow.getByRole('cell')).toHaveText('90');

		// プローブ点の色相とlib/math(evaluateComplex+argDeg)の偏角計算の対応を1点検証
		// (GLSL/TSの二重実装のズレ検出網、ADR-005/タスク仕様)。初期表示領域(中心(0,0)・
		// halfWidth=3)のもとで z=(1,1) に対応する画素を readPixels で読み、RGB→HSLの
		// 色相からTSの計算値(arg=90°)を色→値の逆算で概算検証する(厳密一致は要求しない)。
		const argFromColorDeg = await page.evaluate(() => {
			const el = document.querySelector('canvas');
			if (!el) return null;
			const gl = (el.getContext('webgl2') || el.getContext('webgl')) as
				| WebGLRenderingContext
				| WebGL2RenderingContext
				| null;
			if (!gl) return null;
			const width = el.width;
			const height = el.height;
			// 座標変換(DomainColoringScene.tsx と同一の定義): 中心(0,0)・halfWidth=3・
			// アスペクト比0.75(=480/640)。z=(1,1) の uv = (0.5 + z/(2*halfWidth), ...)。
			const halfWidth = 3;
			const aspect = 0.75;
			const halfHeight = halfWidth * aspect;
			const u = 0.5 + 1 / (2 * halfWidth);
			const v = 0.5 + 1 / (2 * halfHeight);
			const px = Math.round(u * width);
			const py = Math.round(v * height); // WebGL readPixelsは下からの行なので反転不要(vと同じ向き)
			const pixel = new Uint8Array(4);
			gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			const r = pixel[0] / 255;
			const g = pixel[1] / 255;
			const b = pixel[2] / 255;
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			const delta = max - min;
			if (delta < 1e-3) return null; // 無彩色(判定不能)
			let h: number;
			if (max === r) h = ((g - b) / delta) % 6;
			else if (max === g) h = (b - r) / delta + 2;
			else h = (r - g) / delta + 4;
			h *= 60;
			if (h < 0) h += 360;
			// hue(度) = arg + 180(シェーダーの色相=(arg+π)/(2π)と同じ対応)。
			let arg = h - 180;
			if (arg > 180) arg -= 360;
			if (arg <= -180) arg += 360;
			return arg;
		});
		expect(argFromColorDeg).not.toBeNull();
		// 色の量子化(8bit)・画素中心のサンプリング誤差を許容し、概算一致(±20°)を確認する。
		expect(Math.abs((argFromColorDeg as number) - 90)).toBeLessThan(20);

		// 関数プリセット切替 → 巻き数が既知例どおりに変化する(reciprocal の極 z=0 は巻き数-1)。
		await page.getByRole('button', { name: /逆数/ }).click();

		await probeReInput.fill('0');
		await probeReInput.blur();
		await probeImInput.fill('0');
		await probeImInput.blur();
		const expectedWindingRow = page.getByRole('row', { name: /^期待巻き数/ });
		await expect(expectedWindingRow.getByRole('cell')).toHaveText('-1');
		const matchRow = page.getByRole('row', { name: /^両経路の一致/ });
		await expect(matchRow.getByRole('cell')).toHaveText('一致');
		// GLSL/TS 二重実装のズレ検出網を cdiv 経路にも張る(GrokBuild レビュー指摘の反映):
		// reciprocal で z=(1,1) → w=1/(1+i)=(0.5,−0.5)、arg=−45°。square と同じ画素逆算で概算確認。
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const argReciprocalDeg = await page.evaluate(() => {
			const el = document.querySelector('canvas');
			if (!el) return null;
			const gl = el.getContext('webgl2') ?? el.getContext('webgl');
			if (!gl) return null;
			const width = gl.drawingBufferWidth;
			const height = gl.drawingBufferHeight;
			// 初期ビュー(中心0+0i、halfWidth=3)で z=(1,1): u=(1/6)+0.5, v=((1/(3*(h/w)))... と
			// 同一写像だが、square 検証と同じく縦横比込みの逆算をシェーダー定義から再現する。
			const halfWidth = 3;
			const aspect = height / width;
			const halfHeight = halfWidth * aspect;
			const u = 0.5 + 1 / (2 * halfWidth);
			const v = 0.5 + 1 / (2 * halfHeight);
			const px = Math.min(width - 1, Math.round(u * width));
			const py = Math.min(height - 1, Math.round(v * height));
			const pixel = new Uint8Array(4);
			gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			const r = pixel[0] / 255;
			const g = pixel[1] / 255;
			const b = pixel[2] / 255;
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			if (max === min) return null;
			let h;
			if (max === r) h = ((g - b) / (max - min)) % 6;
			else if (max === g) h = (b - r) / (max - min) + 2;
			else h = (r - g) / (max - min) + 4;
			const hueDeg = ((h * 60) + 360) % 360;
			return hueDeg - 180;
		});
		expect(argReciprocalDeg).not.toBeNull();
		expect(Math.abs((argReciprocalDeg as number) - -45)).toBeLessThan(20);


		// ズームボタン(キーボード操作代替、ADR-005 §5)。Enter で操作してもエラーや
		// クラッシュが起きず、canvas は存在し続け、観察表の値(DOM主担保)も影響を受けない。
		const zoomInButton = page.getByRole('button', { name: 'ズームイン(拡大 ×2)' });
		await zoomInButton.focus();
		await zoomInButton.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(canvas).toHaveCount(1);
		await expect(expectedWindingRow.getByRole('cell')).toHaveText('-1');

		const panRightButton = page.getByRole('button', { name: '右へパン' });
		await panRightButton.focus();
		await panRightButton.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(canvas).toHaveCount(1);

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});
});
