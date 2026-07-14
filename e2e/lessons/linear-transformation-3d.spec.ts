import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP3 第1単元: LinearTransform3dExperiment(一次変換(3×3)— 空間をまるごと変換する)の
// 実ブラウザ検証。プロジェクト初の Tier 3a(Three.js/WebGL)単元(ADR-005)。ユニットテストは
// Scene を Three.js ごとスタブ化しているため、実際のハイドレーション・WebGL 初期化・
// OrbitControls・離散カメラボタンのキーボード操作はここで担保する。headless Chromium は
// SwiftShader によるソフトウェア WebGL(WebGL1)を持つため、実 GPU なしでも Three.js の
// WebGLRenderer 初期化が成功することを確認する(ADR-005 検証済み)。
const LINEAR_TRANSFORM_3D_PATH = './lessons/linear-transformation-3d/';
const LT3D_HEADING = '実験: 3×3 行列で空間をまるごと変換する';
const LT3D_PREDICTION_TARGET = '行列の成分によって決まった倍率になる';
const LT3D_PREDICTION_DECOY = '変わらない';

test.describe('一次変換(3×3)ページ (LinearTransform3dExperiment, Tier3a/Three.js)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション・WebGL初期化含む)', async ({
		page,
	}) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible。ビューポートを縦に広げて初期表示に含め、ハイドレーション
		// (Three.js WebGLRenderer の初期化を含む)を確実に走らせる。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORM_3D_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: LT3D_HEADING })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORM_3D_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y(canvas は aria-hidden の装飾のみ、離散カメラボタンは
		// ゲート前から表示されている——OrbitControls の a11y代替はゲートに関係なく常時必要)。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作UIのa11yが担保されない(標準化した二段構成)。確定して操作UIを出してから再検査。
		await selectPredictionRobustly(page, LT3D_PREDICTION_TARGET, LT3D_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('WebGL(Three.js)が実際に描画している(canvas非空ピクセル) → 予想確定 → プリセット切替でdetが既知例どおりに変化し、離散カメラボタンがキーボード操作できる', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORM_3D_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// WebGL(Three.js)の初期化に失敗すると Scene の initError フォールバックにより
		// role="alert" のメッセージが出て canvas は現れない(C-3の精神)。headless Chromium
		// (SwiftShader によるソフトウェア WebGL)でも実際に canvas が生成されることを確認する。
		await expect(page.getByRole('alert')).toHaveCount(0);
		const canvas = page.locator('canvas');
		await expect(canvas).toHaveCount(1);
		const box = await canvas.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		expect(box?.height ?? 0).toBeGreaterThan(0);

		await page.locator('section[data-hydrated="true"]').waitFor();
		await selectPredictionRobustly(page, LT3D_PREDICTION_TARGET, LT3D_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 初期値(a=2,b=1,c=0,d=0,e=1,f=0,g=0,h=0,i=1、det=2)。
		const detRow = page.getByRole('row', { name: /^行列式/ });
		await expect(detRow.getByRole('cell')).toHaveText('2');

		// canvas(WebGL + preserveDrawingBuffer:true)が実際に描画されており、単色の空白では
		// ないことを readPixels で確認する(ADR-005: 非空ピクセル判定には preserveDrawingBuffer
		// が必須——既定 false では readPixels が常に0を返す)。
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

		// プリセット切替 → det が既知例どおりに変化する(対角→1、回転→1、鏡映→-1、退化→0)。
		await page.getByRole('button', { name: /対角行列 diag\(2, 1, 0\.5\)/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('1');

		await page.getByRole('button', { name: /z軸まわり45°回転/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('1');

		await page.getByRole('button', { name: /鏡映/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('-1');
		const orientationRow = page.getByRole('row', { name: /^向き/ });
		await expect(orientationRow.getByRole('cell')).toHaveText('反転');

		await page.getByRole('button', { name: /退化/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('0');
		await expect(orientationRow.getByRole('cell')).toHaveText('定義されません(退化)');

		// 離散カメラボタン(キーボード操作代替、ADR-005 §3)。Enter で回転してもエラーや
		// クラッシュが起きず、canvas は存在し続ける(WebGL初期化失敗のフォールバック
		// role=alert が出ない)。
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

		// カメラ操作の後も det の表示(DOM主担保)は影響を受けない(描画層の変更が数学モデルの
		// 値に波及しないことの確認)。
		await expect(detRow.getByRole('cell')).toHaveText('0');
	});
});
