import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DefiniteIntegralExperiment.test.tsx
// と同じ方針)。
vi.mock('../../scenes/mafs/SequenceScene.js', () => ({
	SequenceScene: (props: { type: string; a1: number; d: number; r: number; termsCount: number }) => (
		<div data-testid="scene">
			<span data-testid="scene-type">{props.type}</span>
			<span data-testid="scene-a1">{props.a1}</span>
			<span data-testid="scene-d">{props.d}</span>
			<span data-testid="scene-r">{props.r}</span>
			<span data-testid="scene-terms-count">{props.termsCount}</span>
		</div>
	),
}));

import { SequenceExperiment } from '../SequenceExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'まっすぐ一直線に並ぶ' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('SequenceExperiment (M6)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・数列タイプ切替を隠す', () => {
		render(<SequenceExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('初項 a₁')).not.toBeInTheDocument();
		expect(screen.queryByRole('radio', { name: '等差数列' })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<SequenceExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値: 等差, a1=1, d=2 → 1,3,5,7,9)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^aₙ/)).toEqual(['1', '3', '5', '7', '9']);
		// 階差は公差 d=2 と常に一致する(値列は実値表示、GrokBuild 回帰対策)。
		expect(rowCells(/^階差/)).toEqual(['2', '2', '2', '2', '—']);
	});

	it('予想確定後、フォーカスが新出現する a1 スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '初項 a1(スライダー)' })).toHaveFocus();
	});

	it('和の公式(S₁₀)とループ加算の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		// a1=1, d=2, n=10: 公式 = 10*(2*1+9*2)/2 = 100。ループ加算(1+3+...+19) も 100。
		expect(rowCells(/^S₁₀\(和の公式\)/)).toEqual(['100']);
		expect(rowCells(/^S₁₀\(ループ加算\)/)).toEqual(['100']);
		expect(screen.getByText(/結果が一致しています/)).toBeInTheDocument();
	});

	it('公差 d のスライダーを動かすと、階差・観察テーブル・シーンへ同期する', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		const dSlider = screen.getByRole('slider', { name: '公差 d(スライダー)' });
		fireEvent.change(dSlider, { target: { value: '3' } });

		expect(screen.getByTestId('scene-d')).toHaveTextContent('3');
		// a1=1, d=3 → 1,4,7,10,13
		expect(rowCells(/^aₙ/)).toEqual(['1', '4', '7', '10', '13']);
		expect(rowCells(/^階差/)).toEqual(['3', '3', '3', '3', '—']);
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (初項 a1)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		const numberA1 = screen.getByRole('textbox', { name: '初項 a₁' });
		fireEvent.change(numberA1, { target: { value: '5' } });
		fireEvent.blur(numberA1);

		expect(screen.getByTestId('scene-a1')).toHaveTextContent('5');
		expect(rowCells(/^aₙ/)).toEqual(['5', '7', '9', '11', '13']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		const numberA1 = screen.getByRole('textbox', { name: '初項 a₁' }) as HTMLInputElement;
		fireEvent.change(numberA1, { target: { value: '' } });
		expect(numberA1.value).toBe('');
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('1'); // 確定前は初期値のまま

		fireEvent.blur(numberA1);
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('1');
		expect(numberA1.value).toBe('1');
	});

	it('数値入力に範囲外の値を入れても確定時にクランプされ例外なし (a1)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		const numberA1 = screen.getByRole('textbox', { name: '初項 a₁' }) as HTMLInputElement;

		fireEvent.change(numberA1, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA1)).not.toThrow();
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('10');

		fireEvent.change(numberA1, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberA1)).not.toThrow();
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('-10');
	});

	it('数列タイプを等比に切り替えると、比の列・公比 r の UI に切り替わる(例外なし)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		expect(() => fireEvent.click(screen.getByRole('radio', { name: '等比数列' }))).not.toThrow();

		expect(screen.getByTestId('scene-type')).toHaveTextContent('geometric');
		expect(screen.getByRole('slider', { name: '公比 r(スライダー)' })).toBeInTheDocument();
		expect(screen.queryByRole('slider', { name: '公差 d(スライダー)' })).not.toBeInTheDocument();
		// a1=1, r=2 (初期値) → 1,2,4,8,16、比はすべて2
		expect(rowCells(/^aₙ/)).toEqual(['1', '2', '4', '8', '16']);
		expect(rowCells(/^比/)).toEqual(['2', '2', '2', '2', '—']);
		// 等比モードでは S₁₀ の検証行は表示しない (この単元の数学モデルに等比の和の公式はない)
		expect(screen.queryByRole('row', { name: /^S₁₀/ })).not.toBeInTheDocument();
	});

	it('等比で公比 r=0 にしても例外なく、第2項以降が0になる(退化ケース)', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);
		await user.click(screen.getByRole('radio', { name: '等比数列' }));

		const rSlider = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		expect(() => fireEvent.change(rSlider, { target: { value: '0' } })).not.toThrow();

		expect(screen.getByTestId('scene-r')).toHaveTextContent('0');
		expect(rowCells(/^aₙ/)).toEqual(['1', '0', '0', '0', '0']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('等比で公比 r が負のときも例外なく、符号が交互に反転する', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);
		await user.click(screen.getByRole('radio', { name: '等比数列' }));

		const rSlider = screen.getByRole('slider', { name: '公比 r(スライダー)' });
		expect(() => fireEvent.change(rSlider, { target: { value: '-2' } })).not.toThrow();

		expect(rowCells(/^aₙ/)).toEqual(['1', '-2', '4', '-8', '16']);
		expect(rowCells(/^比/)).toEqual(['-2', '-2', '-2', '-2', '—']);
	});

	it('等比で初項 a1=0 にしても例外なく、全項が0になり比は「定義されません」と表示される', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);
		await user.click(screen.getByRole('radio', { name: '等比数列' }));

		const numberA1 = screen.getByRole('textbox', { name: '初項 a₁' });
		fireEvent.change(numberA1, { target: { value: '0' } });
		expect(() => fireEvent.blur(numberA1)).not.toThrow();

		expect(rowCells(/^aₙ/)).toEqual(['0', '0', '0', '0', '0']);
		expect(rowCells(/^比/)).toEqual(['定義されません', '定義されません', '定義されません', '定義されません', '—']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('リセットで初期値 (等差, a1=1, d=2) に戻る', async () => {
		const user = userEvent.setup();
		render(<SequenceExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: '等比数列' }));
		const numberA1 = screen.getByRole('textbox', { name: '初項 a₁' });
		fireEvent.change(numberA1, { target: { value: '7' } });
		fireEvent.blur(numberA1);
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('7');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-type')).toHaveTextContent('arithmetic');
		expect(screen.getByTestId('scene-a1')).toHaveTextContent('1');
		expect(rowCells(/^aₙ/)).toEqual(['1', '3', '5', '7', '9']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<SequenceExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<SequenceExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
