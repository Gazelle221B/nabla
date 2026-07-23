import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectPredictionRobustly } from '../helpers';

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

// ADR-006 M9b: 前提チェック関門(パイロット、前提単元「三平方の定理」)の実ブラウザ検証。
// PrerequisiteCheck は client:only="react" のため SSR HTML には一切現れず、ハイドレーション
// 完了後に初めて DOM へ挿入される(JS 無効時に「表示されないだけ」であることの裏返し)。
declare global {
	interface Window {
		__gtagCalls?: [string, string, Record<string, unknown>][];
	}
}

test.describe('前提チェック(PrerequisiteCheck、前提単元: 三平方の定理)', () => {
	test('表示・a11y・キーボード操作・誤答時の前提単元リンク・スキップ動線が機能する', async ({ page }) => {
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');

		const check = page.locator('section[aria-labelledby="prereq-check-title"]');
		await check.waitFor();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toBeVisible();

		// axe: チェック表示直後(未回答)の a11y。
		const gate = await new AxeBuilder({ page }).analyze();
		const gateBad = gate.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(gateBad, JSON.stringify(gateBad, null, 2)).toEqual([]);

		// キーボード操作: 最初の設問の最初の選択肢にフォーカスし、Space で選択できる。
		const firstChoice = check.getByRole('radio').first();
		await firstChoice.focus();
		await firstChoice.press('Space');
		await expect(firstChoice).toBeChecked();

		// 3問中1問をあえて不正解にして採点し、前提単元へのリンクが提示されることを確認する。
		const groups = check.getByRole('group');
		await expect(groups).toHaveCount(3);
		// 設問1(脚3・4の斜辺)は正解が「5」。あえて誤答「6」を選ぶ。
		await groups.nth(0).getByRole('radio', { name: '6' }).check();
		await groups.nth(1).getByRole('radio', { name: '(5, 12, 13)' }).check();
		await groups.nth(2).getByRole('radio', { name: '12' }).check();
		await check.getByRole('button', { name: '採点する' }).click();

		const prereqLink = check.getByRole('link', { name: /三平方の定理/ });
		await expect(prereqLink).toBeVisible();
		await expect(prereqLink).toHaveAttribute('href', '../pythagorean-theorem/');

		// axe: 採点結果表示後(前提単元リンクを含む)の a11y も引き続き0件。
		const graded = await new AxeBuilder({ page }).analyze();
		const gradedBad = graded.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious',
		);
		expect(gradedBad, JSON.stringify(gradedBad, null, 2)).toEqual([]);

		// 強制ブロックしない: スキップすると本文へ進めるようパネルが畳まれ、再表示もできる。
		await check.getByRole('button', { name: 'スキップして本文へ進む' }).click();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toHaveCount(0);
		await page.getByRole('button', { name: 'もう一度確認する' }).click();
		await expect(page.getByRole('heading', { name: '前提チェック' })).toBeVisible();
	});

	test('前提チェックの操作は GA4 中核ループイベント(experiment_interact 等)を発火しない', async ({
		page,
	}) => {
		// docs/METRICS_PLAN.md の計測スコープ回帰(M9b タスク仕様): 実験セクション外である
		// 前提チェックの操作が誤って experiment_interact 等にカウントされないことを、実際の
		// ブラウザ・実ページ(単元本文の実験セクションを含む)上で確認する。
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(TRIGONOMETRIC_RATIOS_PATH);
		await page.waitForLoadState('networkidle');

		const check = page.locator('section[aria-labelledby="prereq-check-title"]');
		await check.waitFor();

		const groups = check.getByRole('group');
		await groups.nth(0).getByRole('radio', { name: '6' }).check();
		await groups.nth(1).getByRole('radio', { name: '(5, 12, 13)' }).check();
		await groups.nth(2).getByRole('radio', { name: '12' }).check();
		await check.getByRole('button', { name: '採点する' }).click();
		await check.getByRole('button', { name: 'スキップして本文へ進む' }).click();

		const firedNames = await page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);
		expect(firedNames).toEqual([]);
	});
});
