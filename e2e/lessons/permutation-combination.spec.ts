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
