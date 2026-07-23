import { test, expect } from '@playwright/test';
import { selectPredictionRobustly } from './helpers';

// M9a 計測基盤の実ブラウザ検証 (docs/METRICS_PLAN.md)。
// このリポジトリのビルド (dev/preview/CI いずれも) は PUBLIC_GA4_ID が未設定のため、
// GA4 は常に無効な状態でテストする。これは docs/METRICS_PLAN.md §6 が要求する
// 「非本番では計測無効」を、測定IDが未発行の現時点でも回帰ロックする。
//
// 中核ループのイベント発火自体は、window.gtag をテスト用スタブに差し替えることで
// 実ページ (実際の Experiment Island の DOM) に対して検証する。測定IDが無くても
// coreLoopObserver は常に初期化される (trackEvent が window.gtag 不在時にノーオペ
// レーションになるだけ) ため、この方法で「本番でIDが設定されたときに正しく発火する
// 配線になっているか」を確認できる。

declare global {
	interface Window {
		__gtagCalls?: [string, string, Record<string, unknown>][];
	}
}

const PYTHAGORAS_PATH = './lessons/pythagorean-theorem/';
const GRAPH_THEORY_PATH = './lessons/graph-theory-intro/';

test.describe('計測基盤 (GA4 中核ループイベント, docs/METRICS_PLAN.md)', () => {
	test('測定ID未設定のため GA4 スクリプトは出力されず、コンソールエラーも発生しない', async ({ page }) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto(PYTHAGORAS_PATH);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
		expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
		expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');

		expect(pageErrors).toEqual([]);
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});

	test('単元マップ・トップページでも GA4 スクリプトは出力されない', async ({ page }) => {
		await page.goto('./map/');
		await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);

		await page.goto('./');
		await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
	});

	test('予想入力 → 予想確定 → 操作 → チェックポイント可視 の順で4イベントが単元slug付きで発火する', async ({
		page,
	}) => {
		// BaseLayout の body 末尾スクリプトが initCoreLoopMetrics() を呼ぶより前に
		// window.gtag を差し込む必要があるため addInitScript を使う (ページの全スクリプトより先に実行される)。
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});

		// client:visible の島を初期表示に含めるため縦に大きいビューポートにする
		// (e2e/lessons/pythagorean-theorem.spec.ts と同じ理由)。
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto(PYTHAGORAS_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		const firedNames = () => page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);

		await selectPredictionRobustly(page, '常に成り立つ (関係は保たれる)', '三角形の形によって変わる');
		await expect.poll(firedNames).toContain('prediction_start');

		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect.poll(firedNames).toContain('prediction_submit');

		const sliderA = page.getByRole('slider', { name: '辺 a の長さ(スライダー)' });
		await sliderA.focus();
		await sliderA.press('End');
		await expect.poll(firedNames).toContain('experiment_interact');

		// チェックポイント (「予想と結果」見出し) をビューポート内へ運び、ドウェル時間 (1000ms) 分待つ
		// (docs/METRICS_PLAN.md §4: 単元完了の操作的定義)。
		await page.getByRole('heading', { name: '予想と結果' }).scrollIntoViewIfNeeded();
		await expect.poll(firedNames, { timeout: 5000 }).toContain('lesson_complete');

		const calls = await page.evaluate(() => window.__gtagCalls ?? []);
		// 許可リストの4イベントのみが、この順序でちょうど1回ずつ発火する
		// (docs/METRICS_PLAN.md §3: 多重発火防止)。
		expect(calls.map((c) => c[1])).toEqual([
			'prediction_start',
			'prediction_submit',
			'experiment_interact',
			'lesson_complete',
		]);
		// 送信属性は unit_slug のみ (docs/METRICS_PLAN.md §2: 許可リスト外を送らない)。
		for (const call of calls) {
			expect(call[0]).toBe('event');
			expect(call[2]).toEqual({ unit_slug: 'pythagorean-theorem' });
		}
	});

	// GraphTheoryExperiment(グラフ理論入門)は32単元中唯一 -slider/-number の <input> を
	// 持たず、辺のON/OFFを SVG の role="switch" 要素(クリック/Enter/Space)で操作する。
	// 独立レビュー(Kimi K2.7、2026-07-24)で「旧定義(-slider/-numberのみ)では
	// experiment_interact が永遠に発火しない」と指摘された単元そのものを実ページで検証する
	// (docs/METRICS_PLAN.md §3 の一般化された operational definition の回帰ロック)。
	test('GraphTheoryExperiment: role="switch" の辺トグル(クリック)で experiment_interact が発火する', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});

		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(GRAPH_THEORY_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		const firedNames = () => page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []);

		await selectPredictionRobustly(page, 'できる', 'できない');
		await expect.poll(firedNames).toContain('prediction_start');

		await page.getByRole('button', { name: '予想を確定して実験する' }).click();
		await expect.poll(firedNames).toContain('prediction_submit');

		// -slider/-number は存在しないため、このクリック(role="switch")だけが
		// experiment_interact の発火点になる。
		const bridgeAD = page.getByRole('switch', { name: /^辺 A-D/ });
		await bridgeAD.click();
		await expect.poll(firedNames).toContain('experiment_interact');

		const calls = await page.evaluate(() => window.__gtagCalls ?? []);
		expect(calls.map((c) => c[1])).toEqual(['prediction_start', 'prediction_submit', 'experiment_interact']);
		for (const call of calls) {
			expect(call[2]).toEqual({ unit_slug: 'graph-theory-intro' });
		}
	});

	test('GraphTheoryExperiment: role="switch" の辺トグルをキーボード(Space)で操作しても experiment_interact が発火する', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			window.__gtagCalls = [];
			window.gtag = (...args: unknown[]) => {
				window.__gtagCalls!.push(args as [string, string, Record<string, unknown>]);
			};
		});

		await page.setViewportSize({ width: 1280, height: 2600 });
		await page.goto(GRAPH_THEORY_PATH);
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(page, 'できる', 'できない');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		const bridgeAD = page.getByRole('switch', { name: /^辺 A-D/ });
		await bridgeAD.focus();
		await bridgeAD.press('Space');

		await expect
			.poll(() => page.evaluate(() => window.__gtagCalls?.map((c) => c[1]) ?? []))
			.toContain('experiment_interact');
	});
});
