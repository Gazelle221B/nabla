import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ラジオボタンは同一選択肢の再クリックでは change が再発火しない(HTML 仕様)。
// client:visible 島のハイドレーション未接続時に初回クリックが失われると、同じラジオへの
// リトライは恒久的に空振りする。別選択肢(decoy)→目的選択肢の順にクリックして目的ラジオの
// change を確実に発火させ、確定ボタンが活性化するまで再試行する(m2 レーンと同方式)。
async function selectPredictionRobustly(
	page: import('@playwright/test').Page,
	targetLabel: string,
	decoyLabel: string,
): Promise<void> {
	const decoyRadio = page.getByRole('radio', { name: decoyLabel });
	const targetRadio = page.getByRole('radio', { name: targetLabel });
	const submitButton = page.getByRole('button', { name: '予想を確定して実験する' });
	await expect(async () => {
		await decoyRadio.click();
		await targetRadio.click();
		await expect(submitButton).toBeEnabled({ timeout: 1000 });
	}).toPass({ timeout: 20000 });
}

// スモーク: 到達性・基本表示・axe Critical/Serious 0件・コンソール未処理例外0件を確認する。
// 対象: トップページ(T5-1)と、三平方の定理の対話ページ(T3-1)。
test.describe('トップページ', () => {
	test('表示される', async ({ page }) => {
		await page.goto('./');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('nabla(∇)');
	});

	test('コンソール未処理例外・console.error が発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		// pageerror(未処理例外)だけでなく console.error も収集し、DoD の
		// 「コンソール未処理例外0」を表現どおり厳密に担保する。
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto('./');
		// React Islandsのハイドレーション等、初期描画後の非同期処理が例外を
		// 出す場合も拾えるよう、判定前にネットワークが落ち着くまで待つ。
		await page.waitForLoadState('networkidle');

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto('./');
		// ハイドレーション後のDOMを検査対象にするため、axe解析前に安定を待つ。
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});
});

// T3-1: InteractiveExperiment(三平方の定理)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const PYTHAGORAS_PATH = './lessons/pythagorean-theorem/';

test.describe('三平方の定理ページ (InteractiveExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(PYTHAGORAS_PATH);
		// Island のハイドレーションと Mafs のマウント後まで待つ。
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 直角三角形の辺を動かす' })).toBeVisible();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(PYTHAGORAS_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → スライダー操作 → 差の表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(PYTHAGORAS_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '常に成り立つ (関係は保たれる)', '三角形の形によって変わる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期の 3-4-5 直角三角形で差 ≈ 0
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const diffRow = page.getByRole('row', { name: /差/ });
		await expect(diffRow).toContainText('≈ 0');

		// 辺 a のスライダーをキーボード (End=最大 5) で操作 → a² が 25 に更新、差は ≈ 0 のまま
		const sliderA = page.getByRole('slider', { name: '辺 a の長さ(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');

		const a2Row = page
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: 'a²', exact: true }) });
		await expect(a2Row.getByRole('cell')).toHaveText('25');
		await expect(diffRow).toContainText('≈ 0');
	});
});

// M3: EigenvectorExperiment(2×2行列と固有ベクトル)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const EIGENVECTORS_PATH = './lessons/eigenvectors/';

test.describe('固有ベクトルページ (EigenvectorExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 単位ベクトルを回して固有ベクトルを見つける' }),
		).toBeVisible();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 角度操作 → 固有ベクトル方向で揃うことの基本フローが機能する', async ({ page }) => {
		// このページは記事本文(導入・形式的定義・誤解の説明)が長く、client:visible の島は
		// 標準的なビューポートでは初期表示位置の外にある。ビューポートを縦に十分広げて記事
		// 全体を初期表示に収めることでスクロール操作自体を不要にする。
		await page.setViewportSize({ width: 1280, height: 4000 });
		await page.goto(EIGENVECTORS_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// 予想を選んで確定する(ハイドレーション未完了時の取りこぼし対策は
		// selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(
			page,
			'特定の向きの v でだけ、Av が v と同じ(または正反対)の向きになる',
			'v をどの向きにしても、Av が v と同じ向きになることはない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 既定の伸縮行列 [[2,1],[1,2]] は 45° 方向 (v=(1,1)/√2) が固有ベクトル (固有値3)。
		// 角度入力で 45 度に設定し、v と Av が揃うことを確認する。
		const numberAngle = page.getByRole('textbox', { name: 'v の向き(度)' });
		await numberAngle.fill('45');
		await numberAngle.blur();

		await expect(page.getByText(/揃いました/)).toBeVisible();
		const residualRow = page.getByRole('row', { name: /残差/ });
		await expect(residualRow).toContainText('≈ 0');

		// 角度スライダーをキーボード(矢印キー)で操作しても状態が更新される
		// (ドラッグ以外の代替操作、docs/DESIGN.md §非機能要件)。45度から1度動かすと
		// 固有ベクトルの向きから外れ、「揃いました」表示が消える。
		const sliderAngle = page.getByRole('slider', { name: 'v の向き(度)' });
		await sliderAngle.focus();
		await sliderAngle.press('ArrowRight');
		await expect(page.getByText(/揃いました/)).toHaveCount(0);

		// 回転行列プリセットに切り替えると、どの角度でも揃わない(誤解例)。
		await page.getByRole('radio', { name: /回転行列/ }).check();
		await expect(page.getByText(/一度も揃うことがありません/)).toBeVisible();
		await expect(page.getByText(/この向きでは v と Av の向きはまだ揃っていません/)).toBeVisible();
	});
});
