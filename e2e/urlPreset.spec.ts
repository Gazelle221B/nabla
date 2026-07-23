import { test, expect } from '@playwright/test';
import { selectPredictionRobustly } from './helpers';

// ADR-006 M9d: URL パラメータでの初期状態固定(一斉提示モード、パイロット3単元限定スコープ)
// の実ブラウザ検証。教師が「全員同じ初期状態」で提示できることと、予想ゲートを迂回できない
// ことの両方を、実際の URL クエリ + ハイドレーション込みで確認する。

test.describe('URL プリセット: 三角比と単位円 (?theta=)', () => {
	test('?theta=45 で予想確定後の初期値が45になり、予想ゲートは迂回されない', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto('./lessons/trigonometric-ratios/?theta=45');
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		// 予想ゲートは迂回されない: 観察パネルはまだ出ていない。
		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		await selectPredictionRobustly(
			page,
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		const thetaRow = page.getByRole('row', { name: /^角度 θ\(度\)/ });
		await expect(thetaRow.getByRole('cell')).toHaveText('45');
	});

	test('不正な ?theta=abc は既定値へ黙ってフォールバックし、コンソールエラーを出さない', async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto('./lessons/trigonometric-ratios/?theta=abc');
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await selectPredictionRobustly(
			page,
			'cos θ は 1 から 0 へ向かって減っていく',
			'cos θ は 0 から 1 へ向かって増えていく',
		);
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		const thetaRow = page.getByRole('row', { name: /^角度 θ\(度\)/ });
		await expect(thetaRow.getByRole('cell')).toHaveText('0');
		expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	});
});

test.describe('URL プリセット: 導関数 (?fn=&a=)', () => {
	test('?fn=cube&a=1 で予想確定後の初期状態が f(x)=x³, a=1 になる', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto('./lessons/derivative-function/?fn=cube&a=1');
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		await selectPredictionRobustly(page, '直線になる', '放物線になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		await expect(page.getByRole('radio', { name: 'f(x) = x³' })).toBeChecked();
		const fRow = page.getByRole('row', { name: /^f\(a\)/ });
		await expect(fRow.getByRole('cell')).toHaveText('1');
	});
});

test.describe('URL プリセット: 場合の数 (?n=&r=)', () => {
	test('?n=5&r=3 で予想確定後の初期値が n=5, r=3 になる', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto('./lessons/permutation-combination/?n=5&r=3');
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);

		await selectPredictionRobustly(page, '「並べる」(順列)の方が多くなる', '同じ数になる');
		await page.getByRole('button', { name: '予想を確定して実験する' }).click();

		const nRow = page.getByRole('row', { name: /^全体の数 n/ });
		await expect(nRow.getByRole('cell')).toHaveText('5');
		const rRow = page.getByRole('row', { name: /^選ぶ数 r/ });
		await expect(rRow.getByRole('cell')).toHaveText('3');
	});

	test('未知パラメータ(prediction/submitted)を含めても予想ゲートは迂回されない(迂回不可の総合確認)', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 2400 });
		await page.goto('./lessons/permutation-combination/?n=5&r=3&prediction=same&submitted=true');
		await page.waitForLoadState('networkidle');
		await page.locator('section[data-hydrated="true"]').waitFor();

		await expect(page.getByRole('heading', { name: '観察' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});
});
