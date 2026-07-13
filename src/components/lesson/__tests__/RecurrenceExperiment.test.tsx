import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RecurrenceExperiment } from '../RecurrenceExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCell(name: RegExp | string): string {
	return within(row(name)).getByRole('cell').textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '100万回を超える' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('RecurrenceExperiment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・n のスライダーを隠す', () => {
		render(<RecurrenceExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('n(fib(n) を求める項番号)(スライダー)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<RecurrenceExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時表示され、素朴な再帰の実数値ラベルは見えるがメモ化は隠れている', () => {
		render(<RecurrenceExperiment />);
		expect(screen.getByText('177 回')).toBeInTheDocument(); // naiveCallCount(10)
		expect(screen.queryByText('11 回')).not.toBeInTheDocument(); // memoizedComputationCount(10) は隠す
		expect(screen.getByText('予想確定後に表示されます')).toBeInTheDocument();
	});

	it('予想を確定すると観察が現れる(初期値 n=10 → fib(10)=55, 素朴再帰=177回, メモ化=11回)', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCell(/^n /)).toBe('10');
		expect(rowCell(/^fib\(n\)/)).toBe('55');
		expect(rowCell(/^素朴な再帰の呼び出し回数/)).toBe('177');
		expect(rowCell(/^メモ化の計算回数/)).toBe('11');
	});

	it('予想確定後、メモ化の棒と実数値ラベルが Scene 内に現れる', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		expect(screen.getByText('11 回')).toBeInTheDocument();
		expect(screen.queryByText('予想確定後に表示されます')).not.toBeInTheDocument();
	});

	it('予想確定後、フォーカスが新出現する n スライダーへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: 'n(fib(n) を求める項番号)(スライダー)' })).toHaveFocus();
	});

	it('恒等式 naiveCallCount(n)=2・fib(n+1)−1 の実行時検証が「一致しています」と表示される', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/恒等式 2・fib\(n\+1\)−1\(=177\) と一致しています/)).toBeInTheDocument();
	});

	it('n のスライダーを動かすと fib(n)・呼び出し回数が例外なく更新される(n=30 → 素朴再帰=2692537, メモ化=31)', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: 'n(fib(n) を求める項番号)(スライダー)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '30' } })).not.toThrow();

		expect(rowCell(/^n /)).toBe('30');
		expect(rowCell(/^fib\(n\)/)).toBe('832040');
		expect(rowCell(/^素朴な再帰の呼び出し回数/)).toBe('2692537');
		expect(rowCell(/^メモ化の計算回数/)).toBe('31');
	});

	it('n=0(境界)でも例外なく計算される(fib(0)=0, 素朴再帰=1回, メモ化=1回)', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: 'n(fib(n) を求める項番号)(スライダー)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '0' } })).not.toThrow();

		expect(rowCell(/^n /)).toBe('0');
		expect(rowCell(/^fib\(n\)/)).toBe('0');
		expect(rowCell(/^素朴な再帰の呼び出し回数/)).toBe('1');
		expect(rowCell(/^メモ化の計算回数/)).toBe('1');
	});

	it('数値入力 → 確定(blur)→ 状態へ同期する(n=20 の既知例 → 素朴再帰=21891, メモ化=21)', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: 'n(fib(n) を求める項番号)' });
		fireEvent.change(numberN, { target: { value: '20' } });
		fireEvent.blur(numberN);

		expect(rowCell(/^素朴な再帰の呼び出し回数/)).toBe('21891');
		expect(rowCell(/^メモ化の計算回数/)).toBe('21');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: 'n(fib(n) を求める項番号)' }) as HTMLInputElement;
		fireEvent.change(numberN, { target: { value: '' } });
		expect(numberN.value).toBe('');
		expect(rowCell(/^n /)).toBe('10'); // 確定前は初期値のまま

		fireEvent.blur(numberN);
		expect(numberN.value).toBe('10');
	});

	it('n の数値入力に範囲外の値を入れても確定時にクランプされ例外なし', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: 'n(fib(n) を求める項番号)' }) as HTMLInputElement;

		fireEvent.change(numberN, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('30');

		fireEvent.change(numberN, { target: { value: '-5' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('0');
	});

	it('リセットで初期値(n=10)に戻る', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: 'n(fib(n) を求める項番号)' });
		fireEvent.change(numberN, { target: { value: '25' } });
		fireEvent.blur(numberN);
		expect(rowCell(/^n /)).toBe('25');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCell(/^n /)).toBe('10');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<RecurrenceExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('予想と結果の突き合わせは固定の n=30 について表示され、正解(2,692,537回)を示す', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await enterExperiment(user);

		expect(screen.getAllByText(/2,692,537回/).length).toBeGreaterThan(0);
		expect(screen.getByText(/その通りです/)).toBeInTheDocument();
	});

	it('間違った予想を選ぶと「予想と見比べてみましょう」が表示される', async () => {
		const user = userEvent.setup();
		render(<RecurrenceExperiment />);
		await user.click(screen.getByRole('radio', { name: '30回くらい' }));
		await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));

		expect(screen.getByText(/予想と見比べてみましょう/)).toBeInTheDocument();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<RecurrenceExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
