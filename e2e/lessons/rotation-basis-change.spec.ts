import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP3 第2単元: RotationBasisExperiment(回転行列と基底変換 — 座標は「ものさし」で変わる)の
// 実ブラウザ検証。Tier 3a(Three.js/WebGL)の2単元目(ADR-005 の前例をそのまま踏襲)。
// ユニットテストは Scene を Three.js ごとスタブ化しているため、実際のハイドレーション・
// WebGL初期化・OrbitControls・離散カメラボタンのキーボード操作はここで担保する。
const ROTATION_BASIS_PATH = './lessons/rotation-basis-change/';
const ROTATION_BASIS_HEADING = '実験: 座標軸(基底)を回転させて座標の変化を確かめる';
const ROTATION_BASIS_PREDICTION_TARGET = '点が逆向きに動いたかのように変わる';
const ROTATION_BASIS_PREDICTION_DECOY = '変わらない';

test.describe('回転行列と基底変換ページ (RotationBasisExperiment, Tier3a/Three.js)', () => {
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
		await page.goto(ROTATION_BASIS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: ROTATION_BASIS_HEADING })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(ROTATION_BASIS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y(canvas は aria-hidden の装飾のみ、離散カメラボタンは
		// ゲートに関係なく常時表示されている——OrbitControls の a11y代替は常時必要)。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作UIのa11yが担保されない(標準化した二段構成)。確定して操作UIを出してから再検査。
		await selectPredictionRobustly(page, ROTATION_BASIS_PREDICTION_TARGET, ROTATION_BASIS_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('WebGL(Three.js)が実際に描画している(canvas非空ピクセル) → 予想確定 → golden(z軸・θ=90°・v=(1,0,0)→新基底での座標(0,-1,0))を確認し、離散カメラボタンがキーボード操作できる', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(ROTATION_BASIS_PATH);
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
		await selectPredictionRobustly(page, ROTATION_BASIS_PREDICTION_TARGET, ROTATION_BASIS_PREDICTION_DECOY);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

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

		// golden: 回転軸は既定で z。θ を 90 に設定し、v を (1,0,0) に設定する
		// (既定の v は (1, 0.5, 0.3))。新基底での座標は転置・クラメル法の両経路で (0,-1,0) になる。
		const thetaSlider = page.getByRole('slider', { name: '角度 θ(度)(スライダー)' });
		await thetaSlider.focus();
		await thetaSlider.fill('90');
		await thetaSlider.dispatchEvent('change');

		const numberVy = page.getByRole('textbox', { name: 'ベクトル v の成分 y' });
		await numberVy.fill('0');
		await numberVy.blur();
		const numberVz = page.getByRole('textbox', { name: 'ベクトル v の成分 z' });
		await numberVz.fill('0');
		await numberVz.blur();

		const transposeRow = page.getByRole('row', { name: /^新基底での座標/ });
		await expect(transposeRow.getByRole('cell')).toHaveText('(0, -1, 0)');
		const cramerRow = page.getByRole('row', { name: /^クラメル法の座標/ });
		await expect(cramerRow.getByRole('cell')).toHaveText('(0, -1, 0)');

		// 両経路の一致・ノルム保存の表示も確認する(C-7 交差検証の実行時証拠)。
		await expect(page.getByText(/結果が一致しています/)).toBeVisible();
		await expect(page.getByText(/ノルム保存/).first()).toBeVisible();

		// 回転軸をxに切り替えると新基底での座標が変わる(数学モデルが操作に追従することの確認)。
		await page.getByRole('radio', { name: 'x軸' }).check();
		await expect(transposeRow.getByRole('cell')).not.toHaveText('(0, -1, 0)');

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
	});
});
