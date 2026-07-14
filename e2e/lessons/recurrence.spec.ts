import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

// M8d: RecurrenceExperiment(漸化式と計算量 — 素朴な再帰の爆発とメモ化)の実ブラウザ検証。
// この島は Mafs を使わず DOM/CSS の棒グラフ(CallCountScene)なので ResizeObserver 等の
// スタブは不要だが、実際のハイドレーション・棒グラフの描画・キーボード操作・予想ゲートに
// よるメモ化の棒の表示/非表示切替をここで担保する。
const RECURRENCE_PATH = './lessons/recurrence/';

test.describe('漸化式と計算量ページ (RecurrenceExperiment)', () => {
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
		await page.goto(RECURRENCE_PATH);
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: '実験: 素朴な再帰とメモ化で計算回数を比べる' }),
		).toBeVisible();
		await page.locator('section[data-hydrated="true"]').waitFor();

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('axe: Critical/Seriousの違反が0件(予想ゲート時 + 操作UI表示後の両方)', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(RECURRENCE_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// (1) 予想ゲート表示時点の a11y(Scene 自体は常時表示だが、メモ化の棒・数値は
		// まだ隠れている)。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// (2) n のスライダー・数値入力・観察テーブルは予想確定後にのみマウントされるため、
		// 確定前 axe だけでは操作 UI の a11y が担保されない(標準化した二段構成)。
		await selectPredictionRobustly(page, '900回(30²)くらい', '100万回を超える');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();

		const operating = await new AxeBuilder({ page }).analyze();
		const operatingBad = operating.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(operatingBad, JSON.stringify(operatingBad, null, 2)).toEqual([]);
	});

	test('予想確定 → nを0〜30と動かして呼び出し回数の桁違いの差を観察し、矢印キー操作でも更新される、という基本フローが例外なく機能する', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(RECURRENCE_PATH);
		await page.waitForLoadState('networkidle');

		// 操作前は観察パネルが出ていない(予想ゲート)。Scene自体はゲート前から表示される
		// (本文が「実際に n を動かして...観察してみましょう」と図を参照するため、常時
		// マウントの方針)。ただしメモ化の棒・実数値は答えを構成するため隠れている。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		await expect(page.getByText('177 回')).toBeVisible(); // 素朴再帰(n=10既定)は常時表示
		await expect(page.getByText('予想確定後に表示されます')).toBeVisible();

		// ハイドレーション完了を示す data-hydrated を確定的に待ってから操作する
		// (完了前に操作すると DOM だけ変わり React 状態へ届かないため)。
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, '900回(30²)くらい', '100万回を超える');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		// 観察パネルが現れ、予想確定後はメモ化の棒・実数値も見える
		await expect(page.getByRole('heading', { name: '観察' })).toBeVisible();
		await expect(page.getByText('予想確定後に表示されます')).toHaveCount(0);
		await expect(page.getByText('11 回')).toBeVisible(); // memoizedComputationCount(10)

		// 初期値 n=10 で fib(10)=55、素朴再帰=177回、メモ化=11回(手計算、再検算済み)
		const fibRow = page.getByRole('row', { name: /^fib\(n\)/ });
		await expect(fibRow.getByRole('cell')).toHaveText('55');
		const naiveRow = page.getByRole('row', { name: /^素朴な再帰の呼び出し回数/ });
		await expect(naiveRow.getByRole('cell')).toHaveText('177');
		const memoRow = page.getByRole('row', { name: /^メモ化の計算回数/ });
		await expect(memoRow.getByRole('cell')).toHaveText('11');

		// n のスライダーをキーボード (End=最大30) で操作 → fib(30)=832040、素朴再帰=2692537、
		// メモ化=31(手計算、再検算済み)——桁違いの差が実際に観察できる。
		const sliderN = page.getByRole('slider', { name: /^n\(fib\(n\) を求める項番号\)/ });
		await sliderN.focus();
		await sliderN.press('End');

		await expect(fibRow.getByRole('cell')).toHaveText('832040');
		await expect(naiveRow.getByRole('cell')).toHaveText('2692537');
		await expect(memoRow.getByRole('cell')).toHaveText('31');

		// 矢印キー(ArrowLeft)単独でも1ステップ操作でき、n=30→29 に更新される
		// (End だけでなく矢印キーの動作も担保する)。
		await sliderN.press('ArrowLeft');
		const nRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^n$/ } ) });
		await expect(nRow.getByRole('cell')).toHaveText('29');
	});
});
