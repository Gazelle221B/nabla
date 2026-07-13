import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DerivativeFunctionExperiment.test.tsx
// と同じ方針)。
vi.mock('../../scenes/mafs/RiemannSumScene.js', () => ({
	RiemannSumScene: (props: { coeffs: readonly number[]; lower: number; upper: number; n: number }) => (
		<div data-testid="scene">
			<span data-testid="scene-coeffs-length">{props.coeffs.length}</span>
			<span data-testid="scene-lower">{props.lower}</span>
			<span data-testid="scene-upper">{props.upper}</span>
			<span data-testid="scene-n">{props.n}</span>
		</div>
	),
}));

import { DefiniteIntegralExperiment } from '../DefiniteIntegralExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'ある一定の値に近づく' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DefiniteIntegralExperiment (M6)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・関数切替を隠す', () => {
		render(<DefiniteIntegralExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('長方形の本数 n')).not.toBeInTheDocument();
		expect(screen.queryByRole('radio', { name: 'f(x) = x²' })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DefiniteIntegralExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値: f(x)=x^2, n=4)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowValue(/^n/)).toBe('4');
		// f(x)=x^2, [0,1], n=4: 左端点 0, 0.25, 0.5, 0.75 の高さ・幅0.25の合計 = 0.21875 → round2
		expect(rowValue(/^長方形の合計面積/)).toBe('0.22');
		expect(rowValue(/^厳密な面積/)).toBe('0.33');
	});

	it('予想確定後、フォーカスが新出現する n スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '長方形の本数 n(スライダー)' })).toHaveFocus();
	});

	it('左端点リーマン和と厳密値の一致が実行時検証され、誤差上界内なら「収まっています」が表示される', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/理論上の上界の範囲に収まっています/)).toBeInTheDocument();
	});

	it('n を増やすと合計面積が厳密な面積に近づく (収束の観察)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const nSlider = screen.getByRole('slider', { name: '長方形の本数 n(スライダー)' });
		fireEvent.change(nSlider, { target: { value: '4' } });
		const diffAtN4 = Math.abs(0.21875 - 1 / 3);
		// 差の列は検証フラグに関わらず常に生の値を表示する(GrokBuild 回帰: 「≈ 0」固定に
		// なると差が縮む観察が成立しない)。n=4 の実差 -0.1146 が表示されること。
		expect(rowValue(/^差/)).toBe('-0.1146');

		fireEvent.change(nSlider, { target: { value: '64' } });
		expect(rowValue(/^n/)).toBe('64');
		// n=64 の合計面積は n=4 のときより厳密値に近い (差が縮む)。
		const approxText = rowValue(/^長方形の合計面積/);
		const diffAtN64 = Math.abs(Number(approxText) - 1 / 3);
		expect(diffAtN64).toBeLessThan(diffAtN4);
	});

	it('n の可動域の両端 (n=1, n=64) でも例外がレンダーに漏れない (境界入力の網羅)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const nSlider = screen.getByRole('slider', { name: '長方形の本数 n(スライダー)' });
		expect(() => fireEvent.change(nSlider, { target: { value: '1' } })).not.toThrow();
		expect(screen.getByTestId('scene-n')).toHaveTextContent('1');
		expect(() => fireEvent.change(nSlider, { target: { value: '64' } })).not.toThrow();
		expect(screen.getByTestId('scene-n')).toHaveTextContent('64');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '長方形の本数 n' });
		fireEvent.change(numberN, { target: { value: '10' } });
		fireEvent.blur(numberN);

		expect(screen.getByTestId('scene-n')).toHaveTextContent('10');
		expect(rowValue(/^n/)).toBe('10');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '長方形の本数 n' }) as HTMLInputElement;
		fireEvent.change(numberN, { target: { value: '' } });
		expect(numberN.value).toBe('');
		expect(screen.getByTestId('scene-n')).toHaveTextContent('4'); // 確定前は初期値のまま

		fireEvent.blur(numberN);
		expect(screen.getByTestId('scene-n')).toHaveTextContent('4');
		expect(numberN.value).toBe('4');
	});

	it('数値入力に範囲外の値 (65, 0) を入れても確定時にクランプされ例外なし', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '長方形の本数 n' }) as HTMLInputElement;

		fireEvent.change(numberN, { target: { value: '65' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByTestId('scene-n')).toHaveTextContent('64');

		fireEvent.change(numberN, { target: { value: '0' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByTestId('scene-n')).toHaveTextContent('1');
	});

	it('関数を x+1 に切り替えると、シーンへ渡す係数と観察テーブルが切り替わる (例外なし)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		expect(() => fireEvent.click(screen.getByRole('radio', { name: 'f(x) = x + 1' }))).not.toThrow();

		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('2'); // [1,1]
		// f(x)=x+1, [0,1]: ∫ = 1.5 (厳密値)
		expect(rowValue(/^厳密な面積/)).toBe('1.5');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('関数切替直後も n の値・可動域は保たれ、例外なく観察が続く (境界+切替の複合)', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		const nSlider = screen.getByRole('slider', { name: '長方形の本数 n(スライダー)' });
		fireEvent.change(nSlider, { target: { value: '64' } });
		expect(screen.getByTestId('scene-n')).toHaveTextContent('64');

		expect(() => {
			fireEvent.click(screen.getByRole('radio', { name: 'f(x) = x + 1' }));
		}).not.toThrow();

		expect(screen.getByTestId('scene-n')).toHaveTextContent('64');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('リセットで初期値 (f(x)=x^2, n=4) に戻る', async () => {
		const user = userEvent.setup();
		render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: 'f(x) = x + 1' }));
		const numberN = screen.getByRole('textbox', { name: '長方形の本数 n' });
		fireEvent.change(numberN, { target: { value: '20' } });
		fireEvent.blur(numberN);
		expect(screen.getByTestId('scene-n')).toHaveTextContent('20');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('3'); // x^2 に戻る
		expect(screen.getByTestId('scene-n')).toHaveTextContent('4');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DefiniteIntegralExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DefiniteIntegralExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
