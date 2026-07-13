import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (ProbabilityDistributionExperiment.test.tsx
// / SequenceExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/SequenceLimitScene.js', () => ({
	SequenceLimitScene: (props: { r: number; termsCount: number; mode: string }) => (
		<div data-testid="scene">
			<span data-testid="scene-r">{String(props.r)}</span>
			<span data-testid="scene-terms-count">{String(props.termsCount)}</span>
			<span data-testid="scene-mode">{props.mode}</span>
		</div>
	),
}));

import { LimitsSequencesExperiment } from '../LimitsSequencesExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '符号を変えながら暴れ続け、特定の値には近づかない' }));
	await user.click(screen.getByRole('radio', { name: '0 に近づいていく' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('LimitsSequencesExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作UIを隠す', () => {
		render(<LimitsSequencesExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('公比 r(スライダー)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<LimitsSequencesExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされ、初期値 r=0.8 が渡る', () => {
		render(<LimitsSequencesExperiment />);
		const scene = screen.getByTestId('scene');
		expect(scene).toBeInTheDocument();
		expect(screen.getByTestId('scene-r')).toHaveTextContent('0.8');
		expect(screen.getByTestId('scene-mode')).toHaveTextContent('terms');
	});

	it(
		'予想を確定すると観察が現れ、初期値 r=0.8(第15項・部分和S₁₅・1/(1-r)、手計算・再検算済み)が正しく計算される',
		async () => {
			const user = userEvent.setup();
			render(<LimitsSequencesExperiment />);
			await enterExperiment(user);

			expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
			expect(rowCells(/^公比 r/)).toEqual(['0.8']);
			expect(rowCells(/^分類/)).toEqual(['0 へ収束']);
			// 手計算(再検算済み): a₁₅ = 0.8^14 ≈ 0.043980...→ 0.04
			expect(rowCells(/^a15/)).toEqual(['0.04']);
			// 手計算(再検算済み): S₁₅ = (1-0.8^15)/(1-0.8) ≈ 4.824078...→ 4.82
			expect(rowCells(/^S15/)).toEqual(['4.82']);
			// 手計算(再検算済み): 1/(1-0.8) = 5
			expect(rowCells(/^1\/\(1−r\)/)).toEqual(['5']);
			// 手計算(再検算済み): 4.824078...-5 = -0.175921...→ -0.18
			expect(rowCells(/^差/)).toEqual(['-0.18']);
		},
	);

	it('予想確定後、フォーカスが新出現する公比rのスライダーへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '公比 r(スライダー)' })).toHaveFocus();
	});

	it('分類と実測値の整合が実行時検証され、一致していれば「整合しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/整合しています/)).toBeInTheDocument();
	});

	it('部分和が1/(1-r)へ近づく実行時検証: n=1の差よりn=15の差の方が小さいことが表示される', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		// 手計算(再検算済み): n=1 の差は |1-5|=4、n=15 の差は |4.824078-5|≈0.175921
		expect(screen.getByText(/n=1のとき4でしたが、n=15では0\.18に縮んでいます/)).toBeInTheDocument();
	});

	it('動的性質(r=1、境界ちょうど): 分類が「一定」になり、a15=1・S15=15・級数は収束しない', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		fireEvent.change(sliderR, { target: { value: '1' } });

		expect(rowCells(/^公比 r/)).toEqual(['1']);
		expect(rowCells(/^分類/)).toEqual(['一定(収束、極限は1)']);
		expect(rowCells(/^a15/)).toEqual(['1']);
		expect(rowCells(/^S15/)).toEqual(['15']);
		expect(rowCells(/^1\/\(1−r\)/)).toEqual(['級数は収束しません']);
		expect(rowCells(/^差/)).toEqual(['定義されません']);
	});

	it('動的性質(r=-1、境界ちょうど): 分類が「振動」になり、a15=1・S15=1(境界でも例外なし)', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		expect(() => fireEvent.change(sliderR, { target: { value: '-1' } })).not.toThrow();

		expect(rowCells(/^公比 r/)).toEqual(['-1']);
		expect(rowCells(/^分類/)).toEqual(['振動(収束しない)']);
		expect(rowCells(/^a15/)).toEqual(['1']);
		expect(rowCells(/^S15/)).toEqual(['1']);
	});

	it('動的性質(r=1.2、発散): 分類が「発散」になり、大きな n で項が増大し続ける(例外なし)', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		expect(() => fireEvent.change(sliderR, { target: { value: '1.2' } })).not.toThrow();

		expect(rowCells(/^分類/)).toEqual(['発散']);
		// 手計算(再検算済み): a₁₅ = 1.2^14 ≈ 12.839...→ 12.84、S₁₅ ≈ 72.035...→ 72.04
		expect(rowCells(/^a15/)).toEqual(['12.84']);
		expect(rowCells(/^S15/)).toEqual(['72.04']);
	});

	it('動的性質(r=-1.2、|r|>1の振動): 分類が「振動」になり、例外なし', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		expect(() => fireEvent.change(sliderR, { target: { value: '-1.2' } })).not.toThrow();

		expect(rowCells(/^分類/)).toEqual(['振動(収束しない)']);
	});

	it('表示切替(点列/部分和)を選ぶと Scene に渡る mode が変わる', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-mode')).toHaveTextContent('terms');
		await user.click(screen.getByRole('radio', { name: '部分和 (n, Sₙ)' }));
		expect(screen.getByTestId('scene-mode')).toHaveTextContent('partialSums');
	});

	it('リセットで初期値(r=0.8、点列モード)に戻る', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		fireEvent.change(sliderR, { target: { value: '1.5' } });
		await user.click(screen.getByRole('radio', { name: '部分和 (n, Sₙ)' }));
		expect(rowCells(/^公比 r/)).not.toEqual(['0.8']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^公比 r/)).toEqual(['0.8']);
		expect(screen.getByTestId('scene-mode')).toHaveTextContent('terms');
	});

	it('数値入力 → 確定(blur) → 状態 → 観察表 へ同期する(公比r)', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const numberR = screen.getByRole('textbox', { name: '公比 r' });
		fireEvent.change(numberR, { target: { value: '0.5' } });
		fireEvent.blur(numberR);

		expect(rowCells(/^公比 r/)).toEqual(['0.5']);
		expect(rowCells(/^分類/)).toEqual(['0 へ収束']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const numberR = screen.getByRole('textbox', { name: '公比 r' }) as HTMLInputElement;
		fireEvent.change(numberR, { target: { value: '' } });
		expect(numberR.value).toBe('');
		expect(rowCells(/^公比 r/)).toEqual(['0.8']); // 確定前は初期値のまま

		fireEvent.blur(numberR);
		expect(rowCells(/^公比 r/)).toEqual(['0.8']);
		expect(numberR.value).toBe('0.8');
	});

	it('可動域の外の数値入力はクランプされ例外なし(r=99→1.5、r=-99→-1.5)', async () => {
		const user = userEvent.setup();
		render(<LimitsSequencesExperiment />);
		await enterExperiment(user);

		const numberR = screen.getByRole('textbox', { name: '公比 r' });
		fireEvent.change(numberR, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberR)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '公比 r' })).toHaveValue('1.5');

		fireEvent.change(numberR, { target: { value: '-99' } });
		expect(() => fireEvent.blur(numberR)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '公比 r' })).toHaveValue('-1.5');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<LimitsSequencesExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<LimitsSequencesExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
