import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// client:visible の島は交差検出後に JS チャンクを取得してハイドレーションするため、
// ページ到達直後や scrollIntoViewIfNeeded 直後のクリックはリスナー未接続のまま
// ネイティブ DOM だけを変化させて失われることがある。ここで厄介なのは、ラジオボタンは
// 「既にチェック済みの選択肢」を再クリックしても checked 状態が変化しないため
// change イベントが再発火しない、というネイティブ HTML の仕様: 1回目のクリックが
// ハイドレーション未接続で失われると、同じ選択肢を何度リトライしてもネイティブ DOM 側は
// 既に checked のままなので新たな change は一切発火せず、click() の単純なリトライは
// 効果がない(実測: 20秒リトライしても解消しないフレークを確認)。
// 対策: 別の選択肢 (decoy) → 目的の選択肢、を1セットにしてクリックする。こうすると
// 毎回のリトライが必ず「未選択→選択」または「別の選択肢→目的の選択肢」という
// 本物の状態遷移になり、native の change イベントが確実に発火する。ハイドレーションが
// 完了した直後のセットで React 側が拾い、確定ボタンが有効になる(実測: 5/5 成功、
// いずれも初回セットかつ100ms未満で成功)。三平方(T4-1)・微分係数(M2)の両レーンで
// 独立に同じ問題を発見し、同じ対策に収束した(全ページ共通で使う)。
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

// M4: LinearFunctionExperiment(一次関数とグラフ)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LINEAR_FUNCTION_PATH = './lessons/linear-function/';

test.describe('一次関数とグラフページ (LinearFunctionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ。こうしないとハイドレーション自体が起きず「例外0」が空振りで
		// 通ってしまう(独立レビュー GrokBuild U1)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 傾き a と切片 b を動かす' })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.goto(LINEAR_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 傾き操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_FUNCTION_PATH);
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
			'右上がりの直線から右下がりの直線に変わる',
			'y 軸との交点(切片)が変わる',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (a=2, b=1) で y 切片=(0, 1)、2点法の傾き=2 と一致
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const slopeRow = page.getByRole('row', { name: /から求めた傾き/ });
		await expect(slopeRow.getByRole('cell')).toHaveText('2');

		// 傾き a のスライダーをキーボード (End=最大 3) で操作 → a=3 に更新され、
		// 2点法で求めた傾きも 3 のまま一致し続ける(傾き不変性)
		const sliderA = page.getByRole('slider', { name: '傾き a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');

		const aRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^傾き a/ }) });
		await expect(aRow.getByRole('cell')).toHaveText('3');
		await expect(slopeRow.getByRole('cell')).toHaveText('3');
	});
});
