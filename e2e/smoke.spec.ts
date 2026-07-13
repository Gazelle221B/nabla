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

// M4: QuadraticFunctionExperiment(二次関数とグラフ)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const QUADRATIC_FUNCTION_PATH = './lessons/quadratic-function/';

test.describe('二次関数とグラフページ (QuadraticFunctionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 頂点 (p, q) と開き a を動かす' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		// ハイドレーション完了後の操作 UI(radio/slider 等)まで含めて axe 検査する
		// (未接続 DOM だけを検査して穴が残るのを防ぐ、GrokBuild C2)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		const results = await new AxeBuilder({ page }).analyze();
		const criticalOrSerious = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);

		expect(criticalOrSerious, JSON.stringify(criticalOrSerious, null, 2)).toEqual([]);
	});

	test('予想確定 → 開き a の操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_FUNCTION_PATH);
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
			'開き方が狭くなり、より急な(とがった)グラフになる',
			'開き方は変わらず、頂点の位置だけが動く',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (a=1, p=2, q=-3) で頂点=(2, -3)、対称軸 x=2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const vertexRow = page.getByRole('row', { name: /^頂点の座標/ });
		await expect(vertexRow.getByRole('cell')).toHaveText('(2, -3)');
		const axisRow = page.getByRole('row', { name: /^対称軸/ });
		await expect(axisRow.getByRole('cell')).toHaveText('x = 2');

		// 開き a のスライダーをキーボード (End=最大 3) で操作 → a=3 に更新されても、
		// 頂点の座標(p, q に依らない a)は変わらないまま(頂点が a に依存しないことの確認)
		const sliderA = page.getByRole('slider', { name: '開き a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');

		const aRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^開き a/ } ) });
		await expect(aRow.getByRole('cell')).toHaveText('3');
		await expect(vertexRow.getByRole('cell')).toHaveText('(2, -3)');
	});
});

// M4: TrigonometryExperiment(三角比と単位円)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const TRIGONOMETRIC_RATIOS_PATH = './lessons/trigonometric-ratios/';

test.describe('三角比と単位円ページ (TrigonometryExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 単位円上の角度 θ を動かす' })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(GrokBuild 指摘)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(
			page,
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 角度 θ の操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
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
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 θ=0 で cos=1, sin=0, tan=0, sin²+cos²=1
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const cosRow = page.getByRole('row', { name: /^cos θ/ });
		await expect(cosRow.getByRole('cell')).toHaveText('1');
		const identityRow = page.getByRole('row', { name: /^sin²θ \+ cos²θ/ });
		await expect(identityRow.getByRole('cell')).toHaveText('1');

		// θ の数値入力で 90 に設定 → cos が 0 に近づき、tan は「定義されません」と安全に表示される
		// (退化ケース、例外でクラッシュしない)
		const numberTheta = page.getByRole('textbox', { name: '角度 θ(度)' });
		await numberTheta.fill('90');
		await numberTheta.blur();

		await expect(cosRow.getByRole('cell')).toHaveText('0');
		const tanRow = page.getByRole('row', { name: /^tan θ/ });
		await expect(tanRow.getByRole('cell')).toHaveText('定義されません (cos θ ≈ 0)');
		await expect(page.getByText(/tan θ は定義されません/)).toBeVisible();
		// ピタゴラス恒等式自体は θ=90° でも破綻しない
		await expect(identityRow.getByRole('cell')).toHaveText('1');

		// θ のスライダーをキーボード(矢印キー)で操作しても状態が更新される
		// (ドラッグ以外の代替操作、docs/DESIGN.md §非機能要件)。90度から1度動かすと
		// cos が 0 から離れ、tan が再び定義された数値表示に戻る。
		const sliderTheta = page.getByRole('slider', { name: '角度 θ(スライダー)' });
		await sliderTheta.focus();
		await sliderTheta.press('ArrowRight');
		await expect(page.getByText(/tan θ は定義されません/)).toHaveCount(0);
	});
});

// M5: SimilarityExperiment(相似と拡大縮小)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const SIMILAR_FIGURES_PATH = './lessons/similar-figures/';

test.describe('相似と拡大縮小ページ (SimilarityExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 相似の中心から相似比 k で拡大する' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(trigonometric-ratios で標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '面積比は4倍になる', '面積比も2倍になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 相似比 k の操作 → 観察表示の基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMILAR_FIGURES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '面積比は4倍になる', '面積比も2倍になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 k=2 で辺の比=2、面積比=4(元の三角形の面積=3、拡大後=12)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const sideRatioRow = page.getByRole('row', { name: /^辺の比/ });
		await expect(sideRatioRow.getByRole('cell')).toHaveText('2');
		const areaRatioRow = page.getByRole('row', { name: /^面積比/ });
		await expect(areaRatioRow.getByRole('cell')).toHaveText('4');

		// 相似比 k のスライダーをキーボード (End=最大 3) で操作 → 辺の比=3、面積比=9 (k²) に更新
		const sliderK = page.getByRole('slider', { name: '相似比 k(スライダー)' });
		await sliderK.focus();
		await sliderK.press('End');

		const kRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^相似比 k/ } ) });
		await expect(kRow.getByRole('cell')).toHaveText('3');
		await expect(sideRatioRow.getByRole('cell')).toHaveText('3');
		await expect(areaRatioRow.getByRole('cell')).toHaveText('9');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、k・辺の比・面積比が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3)。
		await sliderK.press('ArrowLeft');
		await expect(kRow.getByRole('cell')).not.toHaveText('3');
		await expect(areaRatioRow.getByRole('cell')).not.toHaveText('9');
	});
});

// M5: InscribedAngleExperiment(円周角の定理)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const INSCRIBED_ANGLE_PATH = './lessons/inscribed-angle/';

test.describe('円周角の定理ページ (InscribedAngleExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(INSCRIBED_ANGLE_PATH);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: '実験: 円周上の点 P を動かす' })).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(INSCRIBED_ANGLE_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(trigonometric-ratios/similar-figures で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '変わらない', '大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 点 P の角度操作 → 円周角が一定であることの基本フローが機能する', async ({ page }) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(INSCRIBED_ANGLE_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '変わらない', '大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 θ=330° で円周角=60°、中心角=120°、比=0.5
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const inscribedRow = page.getByRole('row', { name: /^円周角 ∠APB/ });
		await expect(inscribedRow.getByRole('cell')).toHaveText('60');
		const centralRow = page.getByRole('row', { name: /^中心角 ∠AOB/ });
		await expect(centralRow.getByRole('cell')).toHaveText('120');

		// 点 P の角度 θ のスライダーをキーボード (End=優弧内の上限 445) で操作しても、
		// P は大きく動くが円周角は変わらない(同じ弧に対する円周角は等しい)。
		const sliderTheta = page.getByRole('slider', { name: '点 P の角度 θ(スライダー)' });
		await sliderTheta.focus();
		await sliderTheta.press('End');

		const thetaRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^点 P の角度 θ/ } ) });
		await expect(thetaRow.getByRole('cell')).toHaveText('445');
		await expect(inscribedRow.getByRole('cell')).toHaveText('60');
		await expect(centralRow.getByRole('cell')).toHaveText('120');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、P は動くが円周角は依然として一定
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		await sliderTheta.press('ArrowLeft');
		await expect(thetaRow.getByRole('cell')).not.toHaveText('445');
		await expect(inscribedRow.getByRole('cell')).toHaveText('60');
	});
});

// M5: LawOfSinesCosinesExperiment(正弦定理・余弦定理)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LAW_OF_SINES_COSINES_PATH = './lessons/law-of-sines-cosines/';

test.describe('正弦定理・余弦定理ページ (LawOfSinesCosinesExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 三角形の形を変えて正弦定理・余弦定理を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、確定前 axe
		// だけでは操作 UI の a11y が担保されない(trigonometric-ratios/similar-figures/inscribed-angle
		// で標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '3つとも等しい値になる', 'バラバラな値になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 角Aの操作 → 正弦定理の比が一致し続け、退化境界でも安全に表示される基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LAW_OF_SINES_COSINES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '3つとも等しい値になる', 'バラバラな値になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(角A=90°, b=3, c=4)で辺a=5、a÷sinA・b÷sinB・c÷sinC はすべて5
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const sideARow = page.getByRole('row', { name: /^辺 a/ });
		await expect(sideARow.getByRole('cell')).toHaveText('5');
		const ratioRow = page.getByRole('row', { name: /^a÷sinA/ });
		await expect(ratioRow.getByRole('cell')).toHaveText('5 / 5 / 5');

		// 角Aのスライダーをキーボード (End=上限180、三角形が一直線に潰れる退化ケース) で
		// 操作すると、比は安全に「定義されません」と表示される(クラッシュしない)。
		const sliderAngleA = page.getByRole('slider', { name: '角 A(度)(スライダー)' });
		await sliderAngleA.focus();
		await sliderAngleA.press('End');
		await expect(ratioRow.getByRole('cell')).toHaveText('定義されません');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、角Aが退化境界(180度)から離れて
		// 比が再び定義される(End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		await sliderAngleA.press('ArrowLeft');
		await expect(ratioRow.getByRole('cell')).not.toHaveText('定義されません');

		// GrokBuild H1 回帰: 辺 c を辺 b と同値(3)にして角 A=0° にすると B≡C の退化になる。
		// 修正前は angleAtVertex がゼロ長ベクトルで RangeError を投げ render がクラッシュした
		// 到達可能な UI 経路。安全に「定義されません」表示のままページが生きていることを確認する。
		const numberC = page.getByRole('textbox', { name: '辺 c = AB の長さ' });
		await numberC.fill('3');
		await numberC.blur();
		const numberAngleA = page.getByRole('textbox', { name: '角 A(度)' });
		await numberAngleA.fill('0');
		await numberAngleA.blur();
		await expect(ratioRow.getByRole('cell')).toHaveText('定義されません');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});


// M6: DerivativeFunctionExperiment(導関数 — 微分係数から関数へ)の実ブラウザ検証。ユニット
// テストは Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(上下2段)・
// キーボード操作・関数切替をここで担保する。
const DERIVATIVE_FUNCTION_PATH = './lessons/derivative-function/';

test.describe('導関数ページ (DerivativeFunctionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 接線の傾きを集めて導関数のグラフを作る' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/関数切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '直線になる', '放物線になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 点 a の操作 → f(a)・f’(a) が数学モデル通りに更新される基本フローが機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '直線になる', '放物線になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(f(x)=x^2, a=1)で f(a)=1、微分係数=2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const faRow = page.getByRole('row', { name: /^f\(a\)/ });
		await expect(faRow.getByRole('cell')).toHaveText('1');
		const derivRow = page.getByRole('row', { name: /^微分係数/ });
		await expect(derivRow.getByRole('cell')).toHaveText('2');

		// a のスライダーをキーボード (End=可動域最大 2) で操作 → f(a)=4, f'(a)=4 に更新
		const sliderA = page.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');
		await expect(faRow.getByRole('cell')).toHaveText('4');
		await expect(derivRow.getByRole('cell')).toHaveText('4');

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		await sliderA.press('ArrowLeft');
		await expect(faRow.getByRole('cell')).not.toHaveText('4');
		await expect(derivRow.getByRole('cell')).not.toHaveText('4');

		// 関数を f(x)=x^3 に切り替えると、導関数のグラフの形が変わる。数値入力で a=1 に戻し、
		// 切替直後の再クランプでも例外が起きないことを確認する。
		const numberA = page.getByRole('textbox', { name: '接点 a の位置' });
		await numberA.fill('1');
		await numberA.blur();
		await expect(faRow.getByRole('cell')).toHaveText('1');
		await page.getByRole('radio', { name: 'f(x) = x³' }).check();
		await expect(faRow.getByRole('cell')).toHaveText('1');
		await expect(derivRow.getByRole('cell')).toHaveText('3');

		// 関数切替直後、可動域の外にあった a(切替前に x^2 の可動域最大 2 まで動かしていた)は
		// 新しい可動域 [-1.5, 1.5] へ再クランプされ、境界でも例外なく観察が続く
		// (タスク厳守事項: 関数切替直後の境界入力で例外がレンダーに漏れないこと)。
		await sliderA.focus();
		await sliderA.press('End');
		await expect(faRow.getByRole('cell')).toHaveText('3.38'); // f(1.5)=1.5^3=3.375 → round2
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

// M6: DefiniteIntegralExperiment(定積分と面積)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(曲線+長方形 n 本)・
// キーボード操作・関数切替をここで担保する。
const DEFINITE_INTEGRAL_AREA_PATH = './lessons/definite-integral-area/';

test.describe('定積分と面積ページ (DefiniteIntegralExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 長方形の本数を増やして面積を近似する' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/関数切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'ある一定の値に近づく', '限りなく大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → n の操作 → 合計面積が厳密な面積へ近づく基本フローが機能する', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DEFINITE_INTEGRAL_AREA_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'ある一定の値に近づく', '限りなく大きくなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(f(x)=x^2, n=4)で合計面積=0.22、厳密な面積=0.33
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const approxRow = page.getByRole('row', { name: /^長方形の合計面積/ });
		await expect(approxRow.getByRole('cell')).toHaveText('0.22');
		const exactRow = page.getByRole('row', { name: /^厳密な面積/ });
		await expect(exactRow.getByRole('cell')).toHaveText('0.33');

		// n のスライダーをキーボード (End=可動域最大 64) で操作 → 合計面積が厳密な面積へ近づく
		// (中核体験: n を増やすと差が縮む)。
		const nRow = page.getByRole('row', { name: /^n\(/ });
		const sliderN = page.getByRole('slider', { name: '長方形の本数 n(スライダー)' });
		await sliderN.focus();
		await sliderN.press('End');
		await expect(nRow.getByRole('cell')).toHaveText('64');
		const approxAtN4 = 0.21875;
		const exactValue = 1 / 3;
		const approxTextAtN64 = await approxRow.getByRole('cell').textContent();
		const diffAtN4 = Math.abs(approxAtN4 - exactValue);
		const diffAtN64 = Math.abs(Number(approxTextAtN64) - exactValue);
		expect(diffAtN64).toBeLessThan(diffAtN4);

		// 矢印キー(ArrowLeft)単独でも 1 ステップ操作でき、状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点、derivative-function
		// と同じ観点で単独テストとして担保する)。
		await sliderN.press('ArrowLeft');
		await expect(nRow.getByRole('cell')).toHaveText('63');

		// 関数を f(x)=x+1 に切り替えると、厳密な面積の値が変わる(収束先が変わる)。
		await page.getByRole('radio', { name: 'f(x) = x + 1' }).check();
		await expect(exactRow.getByRole('cell')).toHaveText('1.5');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

// M6: SequenceExperiment(数列 — 等差数列と等比数列)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(点列+等差モードの直線重ね)・
// キーボード操作・タイプ切替(等差/等比)をここで担保する。
const SEQUENCES_PATH = './lessons/sequences/';

test.describe('数列ページ (SequenceExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(独立レビュー GrokBuild U1 と同じ理由、linear-function の学び)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 初項と公差(公比)を動かして点の並び方を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) スライダー/数値入力/タイプ切替/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(trigonometric-ratios 以降で
		// 標準化した二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'まっすぐ一直線に並ぶ', 'ばらばら');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 公差の操作 → 等比切替 → 退化ケース(r=0)まで例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'まっすぐ一直線に並ぶ', 'ばらばら');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(等差, a1=1, d=2)で aₙ の第1項は1
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const aRow = page.getByRole('row', { name: /^aₙ/ });
		await expect(aRow.getByRole('cell').first()).toHaveText('1');

		// 公差 d のスライダーをキーボード (End=可動域最大5) で操作 → 階差の列が5に更新
		const sliderD = page.getByRole('slider', { name: '公差 d(スライダー)' });
		await sliderD.focus();
		await sliderD.press('End');
		const diffRow = page.getByRole('row', { name: /^階差/ });
		await expect(diffRow.getByRole('cell').first()).toHaveText('5');

		// 矢印キー(ArrowLeft)単独でも1ステップ操作できる(End だけでなく矢印キーの動作も担保する、
		// GrokBuild C3 と同じ観点)。
		await sliderD.press('ArrowLeft');
		await expect(diffRow.getByRole('cell').first()).toHaveText('4');

		// 等比数列に切り替え、公比 r=0(退化ケース: 第2項以降が0になる)にしても例外なく
		// 安全に表示される(タスク厳守事項: 等比 r=0/負/a1=0 で例外なし)。
		await page.getByRole('radio', { name: '等比数列' }).check();
		const numberR = page.getByRole('textbox', { name: '公比 r' });
		await numberR.fill('0');
		await numberR.blur();

		await expect(aRow.getByRole('cell').first()).toHaveText('1');
		await expect(aRow.getByRole('cell').nth(1)).toHaveText('0');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});
