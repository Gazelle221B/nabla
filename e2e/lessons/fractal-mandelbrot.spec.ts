import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// MVP 2 第3波(最終単元)・PR本体: MandelbrotExperiment(フラクタル — 拡大しても終わらない図形)の
// 実ブラウザ検証。ユニットテストは Canvas2D シーンをスタブ化しているため、実際のハイドレーション・
// Canvas2D(putImageData)描画・ズーム/パンのボタン操作・キーボード操作をここで担保する。
// ADR-004: この単元は Canvas2D + 確定時再計算(rAF ループなし)で実装している。
const FRACTAL_PATH = './lessons/fractal-mandelbrot/';

test.describe('フラクタルページ (MandelbrotExperiment)', () => {
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
		await page.goto(FRACTAL_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 座標を繰り返し動かして、拡大しても終わらない図形を探す' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2800 });
		await page.goto(FRACTAL_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y(canvas は aria-hidden の装飾のみ)。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) ズーム/パンボタン・数値入力・観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作UIのa11yが担保されない(標準化した二段構成)。
		await selectPredictionRobustly(page, '同じような複雑な形が現れ続ける', 'だんだん滑らかな線に見えてくる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → ズーム操作で拡大率とプローブのescapeTimeの変化を観察し、canvasに非空(かつ単色でない)ピクセルが描画される', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2800 });
		await page.goto(FRACTAL_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		// ゲート前はズーム操作(答えを構成する操作)が不可視。
		await expect(page.getByRole('button', { name: /ズームイン/ })).toHaveCount(0);

		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '同じような複雑な形が現れ続ける', 'だんだん滑らかな線に見えてくる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 初期状態: 拡大率1倍、プローブ(既定 c=0、主カージオイド内部)は maxIter(100) まで留まる。
		const zoomRow = page.getByRole('row', { name: /^拡大率/ });
		await expect(zoomRow.getByRole('cell')).toHaveText('1倍(10^0.0)');
		const escapeRow = page.getByRole('row', { name: /^プローブの escapeTime/ });
		await expect(escapeRow.getByRole('cell')).toContainText('100');

		// ズームインボタン(マウス操作)で拡大率が2倍(10^0.3)に変化する。
		const zoomInButton = page.getByRole('button', { name: /ズームイン/ });
		await zoomInButton.click();
		await expect(zoomRow.getByRole('cell')).toHaveText('2倍(10^0.3)');

		// プローブを c=1 に変更すると escapeTime=3(node 再検算済み: 0→1→2→5 で3回目に脱出)。
		const probeCx = page.getByRole('textbox', { name: 'プローブの x 座標(cx)' });
		await probeCx.fill('1');
		await probeCx.blur();
		await expect(escapeRow.getByRole('cell')).toContainText('3');

		// canvas(Canvas2D + putImageData)が実際に描画されており、単色の空白ではないことを
		// 確認する(黒=内部と、脱出の速さを表す装飾色が混在するはず)。
		const canvasHasVariedPixels = await page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			if (!canvas) return false;
			const ctx = canvas.getContext('2d');
			if (!ctx) return false;
			const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const colors = new Set<string>();
			for (let i = 0; i < data.length; i += 4 * 97) {
				colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
			}
			return colors.size > 1;
		});
		expect(canvasHasVariedPixels).toBe(true);

		// キーボード操作: ズームアウトボタンにフォーカスして Enter で拡大率が1倍に戻る。
		const zoomOutButton = page.getByRole('button', { name: /ズームアウト/ });
		await zoomOutButton.focus();
		await zoomOutButton.press('Enter');
		await expect(zoomRow.getByRole('cell')).toHaveText('1倍(10^0.0)');

		// パンボタンもキーボード(Enter)で操作でき、表示中心が移動する。
		const centerRow = page.getByRole('row', { name: /^表示中心/ });
		const centerBefore = await centerRow.getByRole('cell').textContent();
		const panRightButton = page.getByRole('button', { name: '右へパン' });
		await panRightButton.focus();
		await panRightButton.press('Enter');
		await expect(centerRow.getByRole('cell')).not.toHaveText(centerBefore ?? '');
	});
});
