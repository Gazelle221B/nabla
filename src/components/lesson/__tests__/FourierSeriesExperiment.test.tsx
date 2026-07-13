import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API(ResizeObserver 等)に依存し jsdom で不安定なため、状態同期の
// 結合テストではシーンをスタブに差し替える(LimitsSequencesExperiment.test.tsx / M8 と同じ方針)。
vi.mock('../../scenes/mafs/FourierScene.js', () => ({
	FourierScene: (props: { n: number; t: number; showJumpReference?: boolean }) => (
		<div data-testid="scene">
			<span data-testid="scene-n">{String(props.n)}</span>
			<span data-testid="scene-t">{String(props.t)}</span>
			<span data-testid="scene-show-jump-reference">{String(!!props.showJumpReference)}</span>
		</div>
	),
}));

import { FourierSeriesExperiment } from '../FourierSeriesExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'できる(いくらでも近づき、角もそのまま再現できる)' }));
	await user.click(screen.getByRole('radio', { name: 'ほぼできるが、角のそばだけどうしても帳尻が合わない' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('FourierSeriesExperiment (MVP 2)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作UIを隠す', () => {
		render(<FourierSeriesExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('項数 N(スライダー)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<FourierSeriesExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされ、初期値 N=5・t=π/2 が渡る', () => {
		render(<FourierSeriesExperiment />);
		const scene = screen.getByTestId('scene');
		expect(scene).toBeInTheDocument();
		expect(screen.getByTestId('scene-n')).toHaveTextContent('5');
		expect(screen.getByTestId('scene-t')).toHaveTextContent(String(Math.PI / 2));
	});

	it('予想ゲート前は y=1 参照線(ギブス現象の答え)が Scene へ渡らない', () => {
		render(<FourierSeriesExperiment />);
		expect(screen.getByTestId('scene-show-jump-reference')).toHaveTextContent('false');
	});

	it('予想確定後は y=1 参照線が Scene へ渡る', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);
		expect(screen.getByTestId('scene-show-jump-reference')).toHaveTextContent('true');
	});

	it(
		'予想を確定すると観察が現れ、初期値 N=5・t=π/2(node で再検算済みgolden値)が正しく計算される',
		async () => {
			const user = userEvent.setup();
			render(<FourierSeriesExperiment />);
			await enterExperiment(user);

			expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
			expect(rowCells(/^項数 N/)).toEqual(['5']);
			// node 再検算済み: S5(π/2) ≈ 1.0630539690963423 → 1.06
			expect(rowCells(/^S5\(t\) の実値/)).toEqual(['1.06']);
			// node 再検算済み: |S5(π/2)-square(π/2)| = |1.063...-1| ≈ 0.0630... → 0.06
			expect(rowCells(/^\|S5\(t\)/)).toEqual(['0.06']);
			// node 再検算済み: max S5 over [0,2π], 2000点走査 ≈ 1.1823282088576053 → 1.18
			expect(rowCells(/^S5 の最大値/)).toEqual(['1.18']);
		},
	);

	it('予想確定後、フォーカスが新出現する項数Nのスライダーへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '項数 N(スライダー)' })).toHaveFocus();
	});

	it('実行時交差検証: b₁の求積と閉形式が一致しているステータスが表示される', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);
		expect(screen.getByText(/求積\(数値積分\)と閉形式\(4\/π\)は一致しています/)).toBeInTheDocument();
	});

	it('動的性質(N=10、golden値): 最大値が約1.18のまま残る', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '項数 N(スライダー)' });
		fireEvent.change(sliderN, { target: { value: '10' } });

		expect(rowCells(/^項数 N/)).toEqual(['10']);
		// node 再検算済み: max S10 ≈ 1.179814019618836 → 1.18
		expect(rowCells(/^S10 の最大値/)).toEqual(['1.18']);
	});

	it('動的性質(N=50、golden値): 最大値は依然として約1.18で1へは戻らない(ギブス現象)', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '項数 N(スライダー)' });
		fireEvent.change(sliderN, { target: { value: '50' } });

		expect(rowCells(/^項数 N/)).toEqual(['50']);
		// node 再検算済み: max S50 ≈ 1.1790130793104288 → 1.18(1に戻らない)
		expect(rowCells(/^S50 の最大値/)).toEqual(['1.18']);
	});

	it('N=1(境界): 例外なく計算され、1項でも行き過ぎる(S1(π/2)=4/π≈1.27)', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '項数 N(スライダー)' });
		const numberT = screen.getByRole('textbox', { name: '時刻 t(ラジアン)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '1' } })).not.toThrow();
		fireEvent.change(numberT, { target: { value: String(Math.PI / 2) } });
		fireEvent.blur(numberT);

		expect(rowCells(/^S1\(t\) の実値/)).toEqual(['1.27']);
	});

	it('N=50(上限境界): 例外なく計算される', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '項数 N(スライダー)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '50' } })).not.toThrow();
		expect(rowCells(/^項数 N/)).toEqual(['50']);
	});

	// 矢印キー操作の実挙動(jsdomのrange input操作はuser-eventで不安定なため)は
	// e2e/smoke.spec.ts(実ブラウザ)側で検証する(LimitsSequencesExperiment と同じ方針)。

	it('リセットで初期値(N=5、t=π/2)に戻る', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '項数 N(スライダー)' });
		fireEvent.change(sliderN, { target: { value: '30' } });
		expect(rowCells(/^項数 N/)).not.toEqual(['5']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^項数 N/)).toEqual(['5']);
	});

	it('数値入力 → 確定(blur) → 状態 → 観察表 へ同期する(項数N)', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '項数 N' });
		fireEvent.change(numberN, { target: { value: '20' } });
		fireEvent.blur(numberN);

		expect(rowCells(/^項数 N/)).toEqual(['20']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '項数 N' }) as HTMLInputElement;
		fireEvent.change(numberN, { target: { value: '' } });
		expect(numberN.value).toBe('');
		expect(rowCells(/^項数 N/)).toEqual(['5']); // 確定前は初期値のまま

		fireEvent.blur(numberN);
		expect(rowCells(/^項数 N/)).toEqual(['5']);
		expect(numberN.value).toBe('5');
	});

	it('可動域の外の数値入力はクランプされ例外なし(N=99→50、N=-5→1)', async () => {
		const user = userEvent.setup();
		render(<FourierSeriesExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '項数 N' });
		fireEvent.change(numberN, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '項数 N' })).toHaveValue('50');

		fireEvent.change(numberN, { target: { value: '-5' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '項数 N' })).toHaveValue('1');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<FourierSeriesExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<FourierSeriesExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
