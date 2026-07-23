import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

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

// ADR-006 M9b: 前提チェック関門(パイロット、前提単元「微分係数と接線」)の実ブラウザ検証。
// PrerequisiteCheck は client:only="react" のため SSR HTML には現れず、ハイドレーション完了後に
// 初めて DOM へ挿入される(JS 無効時に「表示されないだけ」であることの裏返し)。
test.describe('前提チェック(PrerequisiteCheck、前提単元: 微分係数と接線)', () => {
	test('表示・a11y・キーボード操作・全問正解時の肯定メッセージ・スキップ動線が機能する', async ({
		page,
	}) => {
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		const check = page.locator('section[aria-labelledby="prereq-check-title"]');
		await check.waitFor();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toBeVisible();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		const firstChoice = check.getByRole('radio').first();
		await firstChoice.focus();
		await firstChoice.press('Space');
		await expect(firstChoice).toBeChecked();

		// 3問とも正解(f'(3)=6, a=-1での割線の傾きの極限=-2, x=0の接線=y=0)を選び、
		// 前提単元へのリンクが出ないこと・肯定メッセージが出ることを確認する。
		const groups = check.getByRole('group');
		await expect(groups).toHaveCount(3);
		await groups.nth(0).getByRole('radio', { name: '6' }).check();
		await groups.nth(1).getByRole('radio', { name: '-2' }).check();
		await groups.nth(2).getByRole('radio', { name: 'y = 0' }).check();
		await check.getByRole('button', { name: '採点する' }).click();

		await expect(check.getByText(/3問とも正解でした/)).toBeVisible();
		await expect(check.getByRole('link', { name: /微分係数と接線/ })).toHaveCount(0);

		const graded = await new AxeBuilder({ page }).analyze();
		const gradedBad = graded.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gradedBad, JSON.stringify(gradedBad, null, 2)).toEqual([]);

		await check.getByRole('button', { name: 'スキップして本文へ進む' }).click();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toHaveCount(0);
	});
});

// ADR-006 M9c: 演習(パイロット、単元自身「導関数」の理解確認)の実ブラウザ検証。
declare global {
	interface Window {
		__gtagCalls?: [string, string, Record<string, unknown>][];
	}
}

test.describe('演習(ExerciseSection、単元: 導関数)', () => {
	test('表示・a11y・即時採点・誤答パターン別フィードバックが機能する', async ({ page }) => {
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		const exercise = page.locator('section[aria-labelledby="exercise-section-title"]');
		await exercise.waitFor();
		await expect(page.getByRole('heading', { name: '演習' })).toBeVisible();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		const groups = exercise.getByRole('group');
		await expect(groups).toHaveCount(5);

		// Q1(f'(2), f(x)=x²)を正答「4」で選ぶ → 即時に「正解です。」。
		await groups.nth(0).getByRole('radio', { name: '4', exact: true }).check();
		await expect(exercise.getByText('正解です。').first()).toBeVisible();

		// Q2(f'(2), f(x)=x³)をあえて誤答「6」で選ぶ → その誤答固有の説明が出る。
		await groups.nth(1).getByRole('radio', { name: '6', exact: true }).check();
		await expect(exercise.getByText(/指数の下げ方を誤り/)).toBeVisible();

		await groups.nth(1).getByRole('radio', { name: '12', exact: true }).check();
		await groups.nth(2).getByRole('radio', { name: '3', exact: true }).check();
		await groups.nth(3).getByRole('radio', { name: 'y = 2x - 1', exact: true }).check();
		await groups.nth(4).getByRole('radio', { name: 'x³の方が大きい', exact: true }).check();

		await expect(exercise.getByText(/5問中\d問正解です。/)).toBeVisible();

		const graded = await new AxeBuilder({ page }).analyze();
		const gradedBad = graded.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gradedBad, JSON.stringify(gradedBad, null, 2)).toEqual([]);
	});

	test('演習の操作はGA4中核ループイベント(experiment_interact等)を発火しない', async ({ page }) => {
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(DERIVATIVE_FUNCTION_PATH);
		await page.waitForLoadState('networkidle');

		const exercise = page.locator('section[aria-labelledby="exercise-section-title"]');
		await exercise.waitFor();

		const groups = exercise.getByRole('group');
		await groups.nth(0).getByRole('radio', { name: '4', exact: true }).check();
		await groups.nth(1).getByRole('radio', { name: '12', exact: true }).check();

		const firedNames = await page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);
		expect(firedNames).toEqual([]);
	});
});
