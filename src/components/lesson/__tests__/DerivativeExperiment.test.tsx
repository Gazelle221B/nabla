import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (InteractiveExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/DerivativeScene.js', () => ({
	DerivativeScene: (props: {
		a: number;
		h: number;
		interactive: boolean;
		onAChange: (v: number) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-a">{props.a}</span>
			<span data-testid="scene-h">{props.h}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			<button type="button" data-testid="drag-a-10" onClick={() => props.onAChange(10)}>
				drag a to 10
			</button>
		</div>
	),
}));

import { DerivativeExperiment } from '../DerivativeExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: /微分係数.*接線の傾き.*に近づく/ }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DerivativeExperiment (M2)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<DerivativeExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('接点 a の位置')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DerivativeExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる (初期値 a=1, h=1)', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		// f(x)=x^2, a=1, h=1: f(a)=1, secant=((2)^2-1)/1=3, tangent=2*1=2
		expect(rowValue(/^f\(a\)/)).toBe('1');
		expect(rowValue(/^割線の傾き/)).toBe('3');
		expect(rowValue(/^微分係数/)).toBe('2');
	});

	it('予想確定後、フォーカスが新出現する a スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '接点 a の位置(スライダー)' })).toHaveFocus();
	});

	it('h を小さくすると割線の傾きが微分係数に近づく (収束の体感)', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		const hSlider = screen.getByRole('slider', { name: 'h(a からの距離)(スライダー)' });
		fireEvent.change(hSlider, { target: { value: '0.05' } });

		// a=1, h=0.05: secant = ((1.05)^2 - 1)/0.05 = (1.1025-1)/0.05 = 2.05
		expect(rowValue(/^割線の傾き/)).toBe('2.05');
		expect(rowValue(/^微分係数/)).toBe('2');
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' });
		fireEvent.change(numberA, { target: { value: '2' } });
		fireEvent.blur(numberA);

		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '1.' } });
		expect(numberA.value).toBe('1.');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1'); // 確定前は初期値のまま

		fireEvent.change(numberA, { target: { value: '' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1');
		expect(numberA.value).toBe('1');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明、a=2 に clamp)', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		// スタブのドラッグは 10 を渡す → clamp で最大 2 に正規化される
		await user.click(screen.getByTestId('drag-a-10'));

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' }) as HTMLInputElement;
		expect(numberA.value).toBe('2');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
	});

	it('h の数値入力は範囲外 (0 を含む) を確定時に clamp する', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		const numberH = screen.getByRole('textbox', { name: 'h(a からの距離)' });
		fireEvent.change(numberH, { target: { value: '0' } });
		fireEvent.blur(numberH);

		// H_MIN=0.05 に clamp される (h=0 は差分商が未定義のため許可しない)
		expect(screen.getByTestId('scene-h')).toHaveTextContent('0.05');
	});

	it('リセットで初期値 (a=1, h=1) に戻る', async () => {
		const user = userEvent.setup();
		render(<DerivativeExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' });
		fireEvent.change(numberA, { target: { value: '-1.5' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('-1.5');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1');
		expect(screen.getByTestId('scene-h')).toHaveTextContent('1');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DerivativeExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DerivativeExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
