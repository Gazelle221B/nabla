import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8: CircleLineExperiment(円の方程式と点と直線の距離)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const CIRCLE_EQUATION_PATH = './lessons/circle-equation/';

test.describe('円の方程式と点と直線の距離ページ (CircleLineExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(quadratic-equation/exp-log 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CIRCLE_EQUATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 直線を動かして円との交点の個数を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CIRCLE_EQUATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(
			page,
			'直線を円に近づける(切片 k を小さくする)と、交点の個数は0個→1個→2個と増えていく',
			'直線を動かしても、交点の個数はいつも同じ',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → k を操作 → 交点が0個→1個→2個と増えていく基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(CIRCLE_EQUATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(
			page,
			'直線を円に近づける(切片 k を小さくする)と、交点の個数は0個→1個→2個と増えていく',
			'直線を動かしても、交点の個数はいつも同じ',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(m=0,k=2)で単位円との距離 d=2、半径 r=1、交点0個
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const dRow = page.getByRole('row', { name: /^中心から直線までの距離 d/ });
		await expect(dRow.getByRole('cell')).toHaveText('2');
		const countRow = page.getByRole('row', { name: /^交点の個数/ });
		await expect(countRow.getByRole('cell')).toHaveText('0個(交わらない)');

		// k を数値入力で1に設定 → d=r=1(ちょうど接する)、交点1個、座標(0,1)
		const numberK = page.getByRole('textbox', { name: '直線の切片 k' });
		await numberK.fill('1');
		await numberK.blur();
		await expect(dRow.getByRole('cell')).toHaveText('1');
		await expect(countRow.getByRole('cell')).toHaveText('1個(ちょうど接する)');
		const pointsRow = page.getByRole('row', { name: /^交点の座標/ });
		await expect(pointsRow.getByRole('cell')).toHaveText('(0, 1)');

		// さらに k を0に設定 → d=0<r(交点2個)、座標(-1,0)・(1,0)。境界を超えても例外なく安全に表示される。
		await numberK.fill('0');
		await numberK.blur();
		await expect(dRow.getByRole('cell')).toHaveText('0');
		await expect(countRow.getByRole('cell')).toHaveText('2個(異なる2点で交わる)');
		await expect(pointsRow.getByRole('cell')).toHaveText('(-1, 0), (1, 0)');
		await expect(page.getByText(/確かに0に戻ることを確認しました/)).toBeVisible();

		// k のスライダーを矢印キー(ArrowLeft)単独で操作しても例外なく状態が更新される
		// (quadratic-equation/exp-log C3 と同じ観点)。k=0→k=-1(対称な接線配置、d=1=r、交点1個)
		const sliderK = page.getByRole('slider', { name: '直線の切片 k(スライダー)' });
		await sliderK.focus();
		await sliderK.press('ArrowLeft');
		await expect(dRow.getByRole('cell')).toHaveText('1');
		await expect(countRow.getByRole('cell')).toHaveText('1個(ちょうど接する)');
	});
});
