import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

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

// ADR-006 M9b: 前提チェック関門(パイロット、前提単元「確率 — 単純な試行と相対度数」)の
// 実ブラウザ検証。PrerequisiteCheck は client:only="react" のため SSR HTML には現れず、
// ハイドレーション完了後に初めて DOM へ挿入される(JS 無効時に「表示されないだけ」の裏返し)。
test.describe('前提チェック(PrerequisiteCheck、前提単元: 確率 — 単純な試行と相対度数)', () => {
	test('表示・a11y・「わからない」選択時の前提単元リンク・スキップ動線が機能する', async ({ page }) => {
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');

		const check = page.locator('section[aria-labelledby="prereq-check-title"]');
		await check.waitFor();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toBeVisible();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// 設問1で「わからない/自信がない」を選ぶと、不正解と同様に前提単元へのリンクが出る。
		const groups = check.getByRole('group');
		await expect(groups).toHaveCount(3);
		await groups.nth(0).getByRole('radio', { name: 'わからない/自信がない' }).check();
		await groups.nth(1).getByRole('radio', { name: '3/5' }).check();
		await groups.nth(2).getByRole('radio', { name: '2/5' }).check();
		await check.getByRole('button', { name: '採点する' }).click();

		const prereqLink = check.getByRole('link', { name: /確率 — 単純な試行と相対度数/ });
		await expect(prereqLink).toBeVisible();
		await expect(prereqLink).toHaveAttribute('href', '../simple-probability/');

		const graded = await new AxeBuilder({ page }).analyze();
		const gradedBad = graded.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gradedBad, JSON.stringify(gradedBad, null, 2)).toEqual([]);

		await check.getByRole('button', { name: 'スキップして本文へ進む' }).click();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toHaveCount(0);
		await page.getByRole('button', { name: 'もう一度確認する' }).click();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toBeVisible();
	});
});

// ADR-006 M9c: 演習(パイロット、単元自身「場合の数」の理解確認)の実ブラウザ検証。
declare global {
	interface Window {
		__gtagCalls?: [string, string, Record<string, unknown>][];
	}
}

test.describe('演習(ExerciseSection、単元: 場合の数)', () => {
	test('表示・a11y・即時採点・誤答パターン別フィードバックが機能する', async ({ page }) => {
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');

		const exercise = page.locator('section[aria-labelledby="exercise-section-title"]');
		await exercise.waitFor();
		await expect(page.getByRole('heading', { name: '演習' })).toBeVisible();

		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		const groups = exercise.getByRole('group');
		await expect(groups).toHaveCount(5);

		// Q1(8P3)を正答「336」で選ぶ → 即時に「正解です。」。
		await groups.nth(0).getByRole('radio', { name: '336', exact: true }).check();
		await expect(exercise.getByText('正解です。').first()).toBeVisible();

		// Q2(8C3)をあえて誤答「336」(順列の値)で選ぶ → その誤答固有の説明が出る。
		await groups.nth(1).getByRole('radio', { name: '336', exact: true }).check();
		await expect(exercise.getByText(/組合せなのに順列の式/)).toBeVisible();

		await groups.nth(1).getByRole('radio', { name: '56', exact: true }).check();
		await groups.nth(2).getByRole('radio', { name: '20', exact: true }).check();
		await groups.nth(3).getByRole('radio', { name: '6P1=6C1=6(一致する)', exact: true }).check();
		await groups.nth(4).getByRole('radio', { name: '360', exact: true }).check();

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
		await page.goto(PERMUTATION_COMBINATION_PATH);
		await page.waitForLoadState('networkidle');

		const exercise = page.locator('section[aria-labelledby="exercise-section-title"]');
		await exercise.waitFor();

		const groups = exercise.getByRole('group');
		await groups.nth(0).getByRole('radio', { name: '336', exact: true }).check();
		await groups.nth(1).getByRole('radio', { name: '56', exact: true }).check();

		const firedNames = await page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);
		expect(firedNames).toEqual([]);
	});
});
