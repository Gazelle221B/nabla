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

// M7: DotProductExperiment(ベクトルの内積)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画(2ベクトル+なす角の弧+直角
// マーカー)・キーボード操作・直角判定(内積≈0)をここで担保する。
const DOT_PRODUCT_PATH = './lessons/dot-product/';

test.describe('ベクトルの内積ページ (DotProductExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(sequences 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 2つのベクトルの向きを動かして内積を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 角度スライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(sequences 以降で標準化した
		// 二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '内積はちょうど0になる', '内積は最大になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → bの向きを90°に設定して直角(内積0)を確認 → 矢印キーで動かすと0からずれる、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DOT_PRODUCT_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '内積はちょうど0になる', '内積は最大になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=0°,|a|=3, b=50°,|b|=4)で a の行は (3, 0)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const aRow = page.getByRole('row', { name: /^a\b/ });
		await expect(aRow.getByRole('cell')).toHaveText('(3, 0)');

		// b の向きを数値入力で 90° に設定 → a(0°) と直角になり、成分計算の内積が 0 になる
		const numberB = page.getByRole('textbox', { name: 'b の向き(度)' });
		await numberB.fill('90');
		await numberB.blur();

		const componentRow = page.getByRole('row', { name: /^成分計算/ });
		await expect(componentRow.getByRole('cell')).toHaveText('0');
		await expect(page.getByText(/ちょうど直角です/)).toBeVisible();

		// 矢印キー(ArrowRight)単独でも b のスライダーを1ステップ操作でき、直角から外れて
		// 内積が0でなくなることを確認する(GrokBuild C3 と同じ観点、End だけでなく
		// 矢印キーの動作も担保する単独テスト)。
		const sliderB = page.getByRole('slider', { name: 'b の向き(スライダー)' });
		await sliderB.focus();
		await sliderB.press('ArrowRight');
		await expect(componentRow.getByRole('cell')).not.toHaveText('0');
		await expect(page.getByText(/ちょうど直角です/)).toHaveCount(0);
	});
});

// M7: LinearTransformationExperiment(一次変換と行列式)の実ブラウザ検証。ユニットテストは
// Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(単位正方形+変換後の
// 平行四辺形+基底ベクトルの像)・キーボード操作・鏡映プリセットでの向き反転(det<0)を
// ここで担保する。
const LINEAR_TRANSFORMATION_PATH = './lessons/linear-transformation-2d/';

test.describe('一次変換と行列式ページ (LinearTransformationExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(dot-product 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 行列の成分を変えて単位正方形の変換を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 成分スライダー/数値入力/プリセット/観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(dot-product 以降で標準化した
		// 二段構成)。確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '行列式(の絶対値)で決まる', 'トレース(対角成分の和)で決まる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 鏡映プリセットに切り替えて向き反転(det<0)を確認 → 矢印キーで操作しても例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(LINEAR_TRANSFORMATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '行列式(の絶対値)で決まる', 'トレース(対角成分の和)で決まる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=2,b=1,c=0,d=1)で行列式=2、実測面積=2、向き=保持
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const detRow = page.getByRole('row', { name: /^行列式/ });
		await expect(detRow.getByRole('cell')).toHaveText('2');
		const orientationRow = page.getByRole('row', { name: /^向き/ });
		await expect(orientationRow.getByRole('cell')).toHaveText('保持');

		// 鏡映行列プリセットに切り替える → 行列式=-1、面積比は1のまま、向きだけが反転する
		// (この単元の核心の誤解を反証する具体例)。
		await page.getByRole('button', { name: /鏡映行列/ }).click();
		await expect(detRow.getByRole('cell')).toHaveText('-1');
		const ratioRow = page.getByRole('row', { name: /^面積比/ });
		await expect(ratioRow.getByRole('cell')).toHaveText('1');
		await expect(orientationRow.getByRole('cell')).toHaveText('反転');
		await expect(page.getByText(/向きが反転しています/)).toBeVisible();

		// 成分 a のスライダーを矢印キー(ArrowRight)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、GrokBuild C3 と同じ観点)。
		const sliderA = page.getByRole('slider', { name: '成分 a(スライダー)' });
		await sliderA.focus();
		await sliderA.press('ArrowRight');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

const SIMPLE_PROBABILITY_PATH = './lessons/simple-probability/';

test.describe('確率ページ (ProbabilityExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(linear-transformation-2d 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: サイコロを振る回数を増やして相対度数の変化を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) n のスライダー/数値入力/振り直す/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(dot-product 以降で標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, 'どの目もほぼ同じ割合に落ち着く', 'どれか1つの目に偏っていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → n を増やすと理論確率との差が縮む観察(固定初期シードなので決定的)→ 矢印キー操作も例外なく機能する基本フロー', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(SIMPLE_PROBABILITY_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'どの目もほぼ同じ割合に落ち着く', 'どれか1つの目に偏っていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		// 初期値(seed=42, n=10)での「理論確率との差」の最大絶対値を読む。
		const diffRow = page.getByRole('row', { name: /^理論確率との差/ });
		const initialDiffs = (await diffRow.getByRole('cell').allTextContents()).map(Number);
		const initialMaxAbsDiff = Math.max(...initialDiffs.map(Math.abs));

		// 数値入力で n=6000 に設定する(固定初期シードなので決定的な結果になる、統計的フレークにならない)。
		const numberN = page.getByRole('textbox', { name: '試行回数 n' });
		await numberN.fill('6000');
		await numberN.blur();

		await expect(page.getByText(/度数の総和\(6000\)は試行回数 n\(6000\)と一致しています/)).toBeVisible();

		const largeDiffs = (await diffRow.getByRole('cell').allTextContents()).map(Number);
		const largeMaxAbsDiff = Math.max(...largeDiffs.map(Math.abs));
		expect(largeMaxAbsDiff).toBeLessThan(initialMaxAbsDiff);

		// n のスライダーを矢印キー(ArrowLeft)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、linear-transformation-2d C3 と同じ観点)。
		const sliderN = page.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		await sliderN.focus();
		await sliderN.press('ArrowLeft');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

// M8: QuadraticEquationExperiment(二次方程式と判別式)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const QUADRATIC_EQUATION_PATH = './lessons/quadratic-equation/';

test.describe('二次方程式と判別式ページ (QuadraticEquationExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(linear-transformation-2d 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_EQUATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 放物線を上下に動かして交点の個数を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_EQUATION_PATH);
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
			'放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
			'放物線を上下に動かしても、x軸との交点の個数は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → c を大きくする操作 → 交点が2個→1個→0個と減っていく基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(QUADRATIC_EQUATION_PATH);
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
			'放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
			'放物線を上下に動かしても、x軸との交点の個数は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=1,b=-4,c=3)で D=4、交点2個、解={1,3}
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const dRow = page.getByRole('row', { name: /^判別式 D/ });
		await expect(dRow.getByRole('cell')).toHaveText('4');
		const countRow = page.getByRole('row', { name: /^x軸との交点の個数/ });
		await expect(countRow.getByRole('cell')).toHaveText('2個(異なる2つの実数解)');

		// c を数値入力で4に設定 → D=0(重解)、交点1個
		const numberC = page.getByRole('textbox', { name: '係数 c(y切片)' });
		await numberC.fill('4');
		await numberC.blur();
		await expect(dRow.getByRole('cell')).toHaveText('0');
		await expect(countRow.getByRole('cell')).toHaveText('1個(重解)');

		// さらに c を5に設定 → D=-4(実数解なし)、交点0個。境界を超えても例外なく安全に表示される。
		await numberC.fill('5');
		await numberC.blur();
		await expect(dRow.getByRole('cell')).toHaveText('-4');
		await expect(countRow.getByRole('cell')).toHaveText('0個(実数の範囲に解はない)');
		await expect(page.getByText(/実数の範囲に解はないため/)).toBeVisible();

		// c のスライダーを矢印キー(ArrowLeft)単独で操作しても例外なく状態が更新される
		// (End だけでなく矢印キーの動作も担保する、similar-figures/inscribed-angle C3 と同じ観点)。
		const sliderC = page.getByRole('slider', { name: '係数 c(スライダー)' });
		await sliderC.focus();
		await sliderC.press('ArrowLeft');
		await expect(dRow.getByRole('cell')).toHaveText('0');
		await expect(countRow.getByRole('cell')).toHaveText('1個(重解)');
	});
});

// M8: ExpLogExperiment(指数関数と対数関数)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const EXP_LOG_PATH = './lessons/exp-log/';

test.describe('指数関数と対数関数ページ (ExpLogExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(quadratic-equation 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 指数関数のグラフを折り返して対数関数のグラフを見つける' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
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
			'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
			'折り返しても y=2^x のグラフのままで、形は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → a・t を操作 → 対応点の鏡映(往復 log_a(a^t)=t)が保たれる基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(EXP_LOG_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
			'折り返しても y=2^x のグラフのままで、形は変わらない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(a=2,t=1)で a^t=2, log_a(a^t)=1(往復一致)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const atRow = page.getByRole('row', { name: /^a\^t/ });
		await expect(atRow.getByRole('cell')).toHaveText('2');
		const roundTripRow = page.getByRole('row', { name: /^log_a\(a\^t\)/ });
		await expect(roundTripRow.getByRole('cell')).toHaveText('1');

		// a を数値入力で4に設定 → a^t=4, 往復 log_a(a^t) は依然として t(=1)と一致する
		// (対応点の鏡映観察: 底を変えても「a^tを対数で戻すと元のtに戻る」関係は崩れない)。
		const numberA = page.getByRole('textbox', { name: '底 a' });
		await numberA.fill('4');
		await numberA.blur();
		await expect(atRow.getByRole('cell')).toHaveText('4');
		await expect(roundTripRow.getByRole('cell')).toHaveText('1');
		await expect(page.getByText(/確かに元の t/)).toBeVisible();

		// t を数値入力で-2に設定 → 境界を超えても例外なく安全に表示される。
		const numberT = page.getByRole('textbox', { name: '対応点のパラメータ t' });
		await numberT.fill('-2');
		await numberT.blur();
		const tRow = page.getByRole('row', { name: /^パラメータ t/ });
		await expect(tRow.getByRole('cell')).toHaveText('-2');
		await expect(roundTripRow.getByRole('cell')).toHaveText('-2');

		// t のスライダーを矢印キー(ArrowRight)単独で操作しても例外なく状態が更新される
		// (quadratic-equation C3 と同じ観点)。
		const sliderT = page.getByRole('slider', { name: '対応点のパラメータ t(スライダー)' });
		await sliderT.focus();
		await sliderT.press('ArrowRight');
		await expect(tRow.getByRole('cell')).toHaveText('-1.9');
		await expect(roundTripRow.getByRole('cell')).toHaveText('-1.9');
	});
});

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

// M8: CombinatoricsExperiment(場合の数 — 順列と組合せ)の実ブラウザ検証。ユニットテストは
// DOM ベースの列挙 Scene をそのまま使えるが(Mafs 非依存)、実際のハイドレーション・
// キーボード操作・n↓時の r 再クランプをここで担保する。
const PERMUTATION_COMBINATION_PATH = './lessons/permutation-combination/';

test.describe('場合の数(順列と組合せ)ページ (CombinatoricsExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(linear-transformation-2d 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 並べる(順列)場合の数と選ぶだけ(組合せ)場合の数を数え上げる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) n/r のスライダー・数値入力・列挙リスト・観察テーブルは予想確定後にのみマウント
		// されるため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		// 確定して操作 UI を出してから再検査(列挙リストのスクロール領域も含む)。
		await selectPredictionRobustly(page, '「並べる」(順列)の方が多くなる', '「選ぶだけ」(組合せ)の方が多くなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → n・r の操作 → 列挙数と公式値(nPr・nCr)が一致し続ける基本フローが機能する', async ({
		page,
	}) => {
		// この島は client:visible。記事下方にあり通常ビューポートでは初期表示外で、
		// Playwright のスクロールだけでは IntersectionObserver が確実には発火しない。
		// ビューポートを縦に大きくして初期表示に含め、ロード時にハイドレーションを促す。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		// data-hydrated 待ちで理論上は足りるが、ラジオの change 再発火問題への防御として
		// 別選択肢を経由して目的の予想を選ぶ(selectPredictionRobustly のコメント参照)。
		await selectPredictionRobustly(page, '「並べる」(順列)の方が多くなる', '「選ぶだけ」(組合せ)の方が多くなる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 (n=4, r=2) で nPr=12, nCr=6, 列挙した個数も一致
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const nPrRow = page.getByRole('row', { name: /^順列 nPr/ });
		await expect(nPrRow.getByRole('cell')).toHaveText('12');
		const nCrRow = page.getByRole('row', { name: /^組合せ nCr/ });
		await expect(nCrRow.getByRole('cell')).toHaveText('6');
		await expect(
			page.getByText(/列挙した個数.*は、公式で求めた nPr\(12\)・nCr\(6\)とそれぞれ一致しています/),
		).toBeVisible();

		// n のスライダーをキーボード (End=最大6) で操作 → n=6, r=2 のまま nPr=30, nCr=15 に更新
		const sliderN = page.getByRole('slider', { name: '人数(全体の数) n(スライダー)' });
		await sliderN.focus();
		await sliderN.press('End');

		const nRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^全体の数 n/ } ) });
		await expect(nRow.getByRole('cell')).toHaveText('6');
		await expect(nPrRow.getByRole('cell')).toHaveText('30');
		await expect(nCrRow.getByRole('cell')).toHaveText('15');

		// n を再び最小 (Home=2) まで下げると、r>新しい n なら自動的に再クランプされる。
		// まず r を n=6 の上限まで上げてから (End)、n を2まで下げて再クランプを確認する。
		const sliderR = page.getByRole('slider', { name: '選ぶ人数 r(スライダー)' });
		await sliderR.focus();
		await sliderR.press('End');
		const rRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^選ぶ数 r/ } ) });
		await expect(rRow.getByRole('cell')).toHaveText('6');

		await sliderN.focus();
		await sliderN.press('Home');
		await expect(nRow.getByRole('cell')).toHaveText('2');
		await expect(rRow.getByRole('cell')).toHaveText('2'); // r が n=2 へ再クランプされる
		await expect(nPrRow.getByRole('cell')).toHaveText('2');
		await expect(nCrRow.getByRole('cell')).toHaveText('1');

		// 矢印キー(ArrowRight)単独でも1ステップ操作でき、例外なく観察が更新される
		// (End/Home だけでなく矢印キーの動作も担保する)。
		await sliderN.press('ArrowRight');
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

// M8: DataAnalysisExperiment(データの分析 — 平均・分散・相関)の実ブラウザ検証。ユニットテストは
// Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画(5固定点+1可動点+平均点マーカー)・
// キーボード操作・外れ値移動による相関係数の変化・全点同一xでの safe 表示をここで担保する。
const DATA_ANALYSIS_PATH = './lessons/data-analysis/';

test.describe('データの分析ページ (DataAnalysisExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない (ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(dot-product 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 散布図の点を動かして平均・分散・相関係数の変化を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 可動点のスライダー/数値入力/観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		// 確定して操作 UI を出してから再検査。
		await selectPredictionRobustly(page, '平均も相関係数も大きく変わる', '点は1個だけなので、平均も相関係数もほとんど変わらない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 初期値を確認 → 外れ値(y=-5)で相関係数が大きく変わる → xを1増やすとさらに変わる(外れ値の「距離」が効く)、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DATA_ANALYSIS_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない (予想ゲート)。散布図(Scene)自体は
		// ゲート前から表示される(GrokBuild 指摘の是正: 本文が図を参照するため)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '平均も相関係数も大きく変わる', '点は1個だけなので、平均も相関係数もほとんど変わらない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(可動点=(8,8))で相関係数は0.98(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const rRow = page.getByRole('row', { name: /^相関係数 r/ });
		await expect(rRow.getByRole('cell')).toHaveText('0.98');

		// 可動点の y 座標を数値入力で -5 に設定 → 5固定点の右上がりの傾向から大きく外れ、
		// 相関係数が激変する(手計算、再検算済み: 0.98 → -0.37)。
		const numberY = page.getByRole('textbox', { name: '可動点の y 座標' });
		await numberY.fill('-5');
		await numberY.blur();
		await expect(rRow.getByRole('cell')).toHaveText('-0.37');

		// 矢印キー(ArrowRight)単独で可動点の x を1ステップ動かす(8→9)と、相関係数が
		// さらに変わる(-0.37 → -0.46)。旧配置(固定5点が縦一列)では x をどれだけ動かしても
		// |r| が不変だった(QA_MEMORY FAIL 指摘)——外れ値の「距離」が効くことの回帰検証。
		const sliderX = page.getByRole('slider', { name: '可動点の x 座標(スライダー)' });
		await sliderX.focus();
		await sliderX.press('ArrowRight');
		await expect(rRow.getByRole('cell')).toHaveText('-0.46');
	});
});

// M8: ProbabilityDistributionExperiment(確率分布と期待値)の実ブラウザ検証。ユニットテストは
// Mafs シーンをスタブ化しているため、実際のハイドレーション・Mafs 描画(棒グラフ+期待値マーカー)・
// キーボード操作・賞金額/本数変更による期待値の変化・n を増やしたときの標本平均の収束傾向を
// ここで担保する。
const PROBABILITY_DISTRIBUTION_PATH = './lessons/probability-distribution/';

test.describe('確率分布と期待値ページ (ProbabilityDistributionExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(data-analysis 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: くじの賞金額・本数を変えて期待値と標本平均の関係を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 賞金額/本数/n のスライダー・数値入力・観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		await selectPredictionRobustly(
			page,
			'回数を増やすと、いちばん大きい賞金額に近づいていく',
			'回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → 初期値(期待値83.33円)を確認 → 賞金額変更で期待値が動く → nを増やすと標本平均が期待値へ近づく、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(PROBABILITY_DISTRIBUTION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。棒グラフ(Scene)自体はゲート前から
		// 表示される(GrokBuild 指摘の是正パターンの踏襲: 本文が図を参照するため)。
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'回数を増やすと、いちばん大きい賞金額に近づいていく',
			'回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(1等300円×1本・2等100円×2本・はずれ0円×3本)で
		// 期待値は83.33円(手計算、再検算済み: 500/6)
		await expect(page.getByRole('heading', { name: '観察: 確率分布表' })).toBeVisible();
		const expectedRow = page.getByRole('row', { name: /^期待値 E\[X\]/ });
		await expect(expectedRow.getByRole('cell')).toHaveText('83.33');

		// 1等の賞金額を数値入力で600に設定 → 期待値が動く(手計算、再検算済み: 83.33 → 133.33)
		const numberPrize1 = page.getByRole('textbox', { name: '1等の賞金額(円)' });
		await numberPrize1.fill('600');
		await numberPrize1.blur();
		await expect(expectedRow.getByRole('cell')).toHaveText('133.33');

		// 矢印キー(ArrowRight)単独ではずれの本数を1ステップ動かす(3→4)と、期待値がさらに変わる
		// (賞金や本数を動かすと期待値が動くという中核性質の回帰検証)。
		const sliderCount3 = page.getByRole('slider', { name: 'はずれの本数(スライダー)' });
		await sliderCount3.focus();
		await sliderCount3.press('ArrowRight');
		// 手計算(再検算済み): 総本数=1+2+4=7, E[X] = (600×1+100×2+0×4)/7 = 800/7 ≈ 114.29
		await expect(expectedRow.getByRole('cell')).toHaveText('114.29');

		// 試行回数 n を最大(End)まで増やすと、標本平均が期待値の近くに収まる
		// (固定シードでの決定的な観察。理論的性質を実ブラウザでも確かめる)。
		const sliderN = page.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		await sliderN.focus();
		await sliderN.press('End');
		const sampleMeanRow = page.getByRole('row', { name: /^標本平均/ });
		await expect(sampleMeanRow).toBeVisible();
		const sampleMeanText = await sampleMeanRow.getByRole('cell').textContent();
		const sampleMean = Number(sampleMeanText);
		expect(Number.isFinite(sampleMean)).toBe(true);
		expect(Math.abs(sampleMean - 114.29)).toBeLessThanOrEqual(15);
	});
});

// M8: LimitsSequencesExperiment(数列の極限)の実ブラウザ検証。ユニットテストは Mafs を
// スタブ化しているため、実際のハイドレーション・Mafs 描画・キーボード操作をここで担保する。
const LIMITS_SEQUENCES_PATH = './lessons/limits-sequences/';

test.describe('数列の極限ページ (LimitsSequencesExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(probability-distribution 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 公比 r を動かして等比数列の行き先を確かめる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 公比rのスライダー・数値入力・表示切替・観察テーブルは予想確定後にのみマウントされる
		// ため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		await selectPredictionRobustly(page, '符号を変えながら暴れ続け、特定の値には近づかない', '0 に近づいていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → r を 0.8→1→1.2→−1 と動かして4分類すべてを観察し、矢印キー操作でも境界を跨いで再分類される、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(LIMITS_SEQUENCES_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「公比r=0.8の等比数列を考えます」と図を参照するため、常時マウントの方針)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '符号を変えながら暴れ続け、特定の値には近づかない', '0 に近づいていく');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値 r=0.8 で分類「0へ収束」・a15≈0.04(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const classRow = page.getByRole('row', { name: /^分類/ });
		const a15Row = page.getByRole('row', { name: /^a15/ });
		const s15Row = page.getByRole('row', { name: /^S15/ });
		await expect(classRow.getByRole('cell')).toHaveText('0 へ収束');
		await expect(a15Row.getByRole('cell')).toHaveText('0.04');

		const numberR = page.getByRole('textbox', { name: '公比 r' });

		// r=1(境界ちょうど): 分類「一定」、全項が1のまま、S15=15
		await numberR.fill('1');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('一定(収束、極限は1)');
		await expect(a15Row.getByRole('cell')).toHaveText('1');
		await expect(s15Row.getByRole('cell')).toHaveText('15');

		// r=1.2(発散): 分類「発散」、項が増大し続ける(手計算、再検算済み)
		await numberR.fill('1.2');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('発散');
		await expect(a15Row.getByRole('cell')).toHaveText('12.84');

		// r=-1(境界ちょうど): 分類「振動」、例外なく安全に再計算される
		await numberR.fill('-1');
		await numberR.blur();
		await expect(classRow.getByRole('cell')).toHaveText('振動(収束しない)');
		await expect(a15Row.getByRole('cell')).toHaveText('1');

		// 矢印キー(ArrowRight)単独でも1ステップ操作でき、r=-1→-0.9 と境界を跨いで
		// 「振動」から「0へ収束」へ再分類される(End だけでなく矢印キーの動作も担保する)。
		const sliderR = page.getByRole('slider', { name: '公比 r(スライダー)' });
		await sliderR.focus();
		await sliderR.press('ArrowRight');
		await expect(classRow.getByRole('cell')).toHaveText('0 へ収束');

		// 表示切替(部分和)に切り替えても例外なく表示され続ける
		await page.getByRole('radio', { name: '部分和 (n, Sₙ)' }).check();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
	});
});

// M8: TaylorApproximationExperiment(テイラー展開による近似)の実ブラウザ検証。
// ユニットテストは Mafs をスタブ化しているため、実際のハイドレーション・Mafs 描画・
// キーボード操作をここで担保する。
const TAYLOR_APPROXIMATION_PATH = './lessons/taylor-approximation/';

test.describe('テイラー展開による近似ページ (TaylorApproximationExperiment)', () => {
	test('コンソール未処理例外・console.error が発生しない(ハイドレーション含む)', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 島は client:visible で記事下方にあるため、ビューポートを縦に広げて初期表示に含め、
		// data-hydrated を待つ(probability-distribution 等と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 次数を上げて、曲線にどこまで寄り添えるか' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) 次数スライダー・関数選択・評価点xのスライダー・観察テーブルは予想確定後にのみ
		// マウントされるため、確定前 axe だけでは操作 UI の a11y が担保されない(標準化した
		// 二段構成)。
		await selectPredictionRobustly(
			page,
			'関数や x によっては、次数を上げてもかえって誤差が大きくなることがある',
			'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → log1p に切り替えて x=1.5 で次数を上げ誤差増大を観察し、矢印キー操作でも次数が変わる、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(TAYLOR_APPROXIMATION_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「下の実験には...があります」と図を参照するため、常時マウントの方針)。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'関数や x によっては、次数を上げてもかえって誤差が大きくなることがある',
			'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、初期値(sin, degree=1, x=2)で P1(2)=2(手計算、再検算済み)
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		const errorRow = page.getByRole('row', { name: /^\|誤差\|/ });
		await expect(page.getByRole('row', { name: /^P1\(x\)/ }).getByRole('cell')).toHaveText('2');

		// log1p に切り替え、評価点 x を 1.5(収束半径1の外側)に設定する。
		await page.getByRole('radio', { name: 'f(x) = ln(1+x)' }).click();
		const numberX = page.getByRole('textbox', { name: '評価点 x の位置' });
		await numberX.fill('1.5');
		await numberX.blur();

		const sliderDegree = page.getByRole('slider', { name: '近似の次数 n(スライダー)' });

		// 次数 n=4: |誤差|≈0.68(手計算、再検算済み)
		await sliderDegree.fill('4');
		await expect(errorRow.getByRole('cell')).toHaveText('0.68');

		// 次数 n=8: |誤差|≈1.82(拡大)
		await sliderDegree.fill('8');
		await expect(errorRow.getByRole('cell')).toHaveText('1.82');

		// 次数 n=12: |誤差|≈6.27(さらに拡大——反例の核心部分)
		await sliderDegree.fill('12');
		await expect(errorRow.getByRole('cell')).toHaveText('6.27');

		// 矢印キー(ArrowLeft)単独でも1ステップ操作でき、次数が11へ変わる
		// (End だけでなく矢印キーの動作も担保する)。
		await sliderDegree.focus();
		await sliderDegree.press('ArrowLeft');
		await expect(page.getByRole('row', { name: /^次数 n/ }).getByRole('cell')).toHaveText('11');
	});
});
