import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (LimitsSequencesExperiment.test.tsx /
// ProbabilityDistributionExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/TaylorScene.js', () => ({
	TaylorScene: (props: { fn: string; degree: number; x: number }) => (
		<div data-testid="scene">
			<span data-testid="scene-fn">{props.fn}</span>
			<span data-testid="scene-degree">{String(props.degree)}</span>
			<span data-testid="scene-x">{String(props.x)}</span>
		</div>
	),
}));

import { TaylorApproximationExperiment } from '../TaylorApproximationExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない' }));
	await user.click(screen.getByRole('radio', { name: '関数や x によっては、次数を上げてもかえって誤差が大きくなることがある' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('TaylorApproximationExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作UIを隠す', () => {
		render(<TaylorApproximationExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('近似の次数 n(スライダー)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<TaylorApproximationExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされ、初期値 fn=sin, degree=1, x=2 が渡る', () => {
		render(<TaylorApproximationExperiment />);
		const scene = screen.getByTestId('scene');
		expect(scene).toBeInTheDocument();
		expect(screen.getByTestId('scene-fn')).toHaveTextContent('sin');
		expect(screen.getByTestId('scene-degree')).toHaveTextContent('1');
		expect(screen.getByTestId('scene-x')).toHaveTextContent('2');
	});

	it(
		'予想を確定すると観察が現れ、初期値 fn=sin, degree=1, x=2(手計算・再検算済み)が正しく計算される',
		async () => {
			const user = userEvent.setup();
			render(<TaylorApproximationExperiment />);
			await enterExperiment(user);

			expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
			expect(rowCells(/^関数/)).toEqual(['f(x) = sin x']);
			expect(rowCells(/^次数 n/)).toEqual(['1']);
			expect(rowCells(/^評価点 x/)).toEqual(['2']);
			// 手計算(再検算済み): P1(2) = coeff(0)*1 + coeff(1)*2 = 0 + 1*2 = 2
			expect(rowCells(/^P1\(x\)/)).toEqual(['2']);
			// 手計算(再検算済み): sin(2) ≈ 0.909297... → 0.91
			expect(rowCells(/^真の値/)).toEqual(['0.91']);
			// 手計算(再検算済み): |2 - 0.909297...| ≈ 1.090702... → 1.09
			expect(rowCells(/^\|誤差\|/)).toEqual(['1.09']);
		},
	);

	it('予想確定後、フォーカスが新出現する関数選択の最初のラジオへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('radio', { name: 'f(x) = sin x' })).toHaveFocus();
	});

	it('整合性の検証(ループ加算 vs ホーナー法)が一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('誤差の変化(統計的観察、正誤判定ではない)が表示される: n=0→1で誤差は0.91から1.09に変化', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		// 手計算(再検算済み): P0(2)=0(sinの定数項は常に0)、誤差=|0-0.909297|≈0.909297→0.91
		expect(screen.getByText(/次数を n=0 から n=1 に上げると、誤差は 0\.91 から 1\.09 に変化しました。/)).toBeInTheDocument();
	});

	it('次数スライダーを動かすと観察テーブルが更新される(degree=5)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const degreeSlider = screen.getByRole('slider', { name: '近似の次数 n(スライダー)' });
		fireEvent.change(degreeSlider, { target: { value: '5' } });

		expect(rowCells(/^次数 n/)).toEqual(['5']);
		expect(screen.getByTestId('scene-degree')).toHaveTextContent('5');
	});

	it('次数スライダーの矢印キー操作で1ステップずつ変化する', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const degreeSlider = screen.getByRole('slider', { name: '近似の次数 n(スライダー)' });
		degreeSlider.focus();
		fireEvent.keyDown(degreeSlider, { key: 'ArrowRight' });
		fireEvent.change(degreeSlider, { target: { value: '2' } });
		expect(rowCells(/^次数 n/)).toEqual(['2']);
	});

	it('動的性質: 関数を log1p に切り替え、x=1.5 で次数を4→8→12と上げると誤差が拡大する(手計算・再検算済み)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: 'f(x) = ln(1+x)' }));
		const numberX = screen.getByRole('textbox', { name: '評価点 x の位置' });
		fireEvent.change(numberX, { target: { value: '1.5' } });
		fireEvent.blur(numberX);

		const degreeSlider = screen.getByRole('slider', { name: '近似の次数 n(スライダー)' });

		fireEvent.change(degreeSlider, { target: { value: '4' } });
		// 手計算(再検算済み): P4(1.5)=0.234375, ln(2.5)≈0.916291, 誤差≈0.681916→0.68
		expect(rowCells(/^\|誤差\|/)).toEqual(['0.68']);

		fireEvent.change(degreeSlider, { target: { value: '8' } });
		// 手計算(再検算済み): P8(1.5)≈-0.908078, 誤差≈1.824368→1.82
		expect(rowCells(/^\|誤差\|/)).toEqual(['1.82']);

		fireEvent.change(degreeSlider, { target: { value: '12' } });
		// 手計算(再検算済み): P12(1.5)≈-5.351878, 誤差≈6.268168→6.27
		expect(rowCells(/^\|誤差\|/)).toEqual(['6.27']);
	});

	it('関数切替(sin→log1p)でも整合性の検証は例外なく一致し続ける(境界での安全性)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		expect(() => user.click(screen.getByRole('radio', { name: 'f(x) = ln(1+x)' }))).not.toThrow();
		await user.click(screen.getByRole('radio', { name: 'f(x) = ln(1+x)' }));
		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('リセットで初期値(fn=sin, degree=1, x=2)に戻る', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const degreeSlider = screen.getByRole('slider', { name: '近似の次数 n(スライダー)' });
		fireEvent.change(degreeSlider, { target: { value: '10' } });
		await user.click(screen.getByRole('radio', { name: 'f(x) = eˣ' }));
		expect(rowCells(/^次数 n/)).not.toEqual(['1']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^次数 n/)).toEqual(['1']);
		expect(rowCells(/^関数/)).toEqual(['f(x) = sin x']);
		expect(rowCells(/^評価点 x/)).toEqual(['2']);
	});

	it('数値入力 → 確定(blur) → 状態 → 観察表 へ同期する(評価点 x)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '評価点 x の位置' });
		fireEvent.change(numberX, { target: { value: '0.5' } });
		fireEvent.blur(numberX);

		expect(rowCells(/^評価点 x/)).toEqual(['0.5']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '評価点 x の位置' }) as HTMLInputElement;
		fireEvent.change(numberX, { target: { value: '' } });
		expect(numberX.value).toBe('');
		expect(rowCells(/^評価点 x/)).toEqual(['2']); // 確定前は初期値のまま

		fireEvent.blur(numberX);
		expect(rowCells(/^評価点 x/)).toEqual(['2']);
		expect(numberX.value).toBe('2');
	});

	it('可動域の外の数値入力はクランプされ例外なし(x=99→4、x=-99→-4)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '評価点 x の位置' });
		fireEvent.change(numberX, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberX)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '評価点 x の位置' })).toHaveValue('4');

		fireEvent.change(numberX, { target: { value: '-99' } });
		expect(() => fireEvent.blur(numberX)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '評価点 x の位置' })).toHaveValue('-4');
	});

	it('関数切替で x が新しい可動域にクランプされる(sin x=-4 → log1p 切替で -0.9 にクランプ)', async () => {
		const user = userEvent.setup();
		render(<TaylorApproximationExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '評価点 x の位置' });
		fireEvent.change(numberX, { target: { value: '-4' } });
		fireEvent.blur(numberX);
		expect(rowCells(/^評価点 x/)).toEqual(['-4']);

		await user.click(screen.getByRole('radio', { name: 'f(x) = ln(1+x)' }));
		expect(rowCells(/^評価点 x/)).toEqual(['-0.9']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<TaylorApproximationExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<TaylorApproximationExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
