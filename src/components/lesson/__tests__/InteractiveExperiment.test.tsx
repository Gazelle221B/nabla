import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える。スタブは props で受け取った
// legA/legB と interactive を表示し、ドラッグ相当のコールバックをボタンで露出する。
// これにより「ドラッグ (scene→state) ↔ 数値入力 (input→state) ↔ 残差表示」の
// 単一状態同期を Mafs に依存せず検証できる。
vi.mock('../../scenes/mafs/PythagorasScene.js', () => ({
	PythagorasScene: (props: {
		legA: number;
		legB: number;
		interactive: boolean;
		onLegAChange: (v: number) => void;
		onLegBChange: (v: number) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-legA">{props.legA}</span>
			<span data-testid="scene-legB">{props.legB}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			<button type="button" data-testid="drag-a-6" onClick={() => props.onLegAChange(6)}>
				drag a to 6
			</button>
			<button type="button" data-testid="drag-b-2" onClick={() => props.onLegBChange(2)}>
				drag b to 2
			</button>
		</div>
	),
}));

import { InteractiveExperiment } from '../InteractiveExperiment.js';

function residualRowValue(): string {
	const row = screen.getByRole('row', { name: /残差/ });
	return within(row).getAllByRole('cell')[0].textContent ?? '';
}

describe('InteractiveExperiment (T3-1)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<InteractiveExperiment />);
		// 予想確定前: 操作は不可、観察 (残差) は非表示
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('辺 a の長さ')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<InteractiveExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await user.click(screen.getByRole('radio', { name: /常に成り立つ/ }));
		await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		// 初期 3-4-5: a²=9, b²=16, c²=25, 残差 ≈ 0
		expect(screen.getByRole('rowheader', { name: 'a² + b²' })).toBeInTheDocument();
		expect(residualRowValue()).toContain('≈ 0');
	});

	async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
		await user.click(screen.getByRole('radio', { name: /常に成り立つ/ }));
		await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
	}

	it('予想確定後、フォーカスが新出現する a スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '辺 a の長さ(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (input が単一状態を更新)', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);

		// 数値 state は確定 (blur/Enter) 時にのみ更新される
		const numberA = screen.getByRole('textbox', { name: '辺 a の長さ' });
		fireEvent.change(numberA, { target: { value: '5' } });
		fireEvent.blur(numberA);

		expect(screen.getByTestId('scene-legA')).toHaveTextContent('5');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '辺 a の長さ' }) as HTMLInputElement;
		// "1." のような入力途中の状態が保持される (即 clamp で潰されない)
		fireEvent.change(numberA, { target: { value: '1.' } });
		expect(numberA.value).toBe('1.');
		expect(screen.getByTestId('scene-legA')).toHaveTextContent('3'); // 確定前は 3 のまま

		// 空にして blur すると 1 へ暴走せず直前の確定値へ戻る
		fireEvent.change(numberA, { target: { value: '' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-legA')).toHaveTextContent('3');
		expect(numberA.value).toBe('3');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明)', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);

		// スタブのドラッグは 6 を渡す → clamp で最大 5 に正規化される
		await user.click(screen.getByTestId('drag-a-6'));

		const numberA = screen.getByRole('textbox', { name: '辺 a の長さ' }) as HTMLInputElement;
		expect(numberA.value).toBe('5');
		expect(screen.getByTestId('scene-legA')).toHaveTextContent('5');
	});

	it('残差は直角三角形では常に ≈ 0、辺を変えても保たれる', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-a-6')); // a=5 に clamp
		await user.click(screen.getByTestId('drag-b-2')); // b=2
		expect(residualRowValue()).toContain('≈ 0');
	});

	it('リセットで初期値 (a=3, b=4) に戻る', async () => {
		const user = userEvent.setup();
		render(<InteractiveExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '辺 b の長さ' });
		fireEvent.change(numberB, { target: { value: '2' } });
		fireEvent.blur(numberB);
		expect(screen.getByTestId('scene-legB')).toHaveTextContent('2');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-legA')).toHaveTextContent('3');
		expect(screen.getByTestId('scene-legB')).toHaveTextContent('4');
	});

	it('観察パネルは aria-live を持ち、残差の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<InteractiveExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		// jsdom は noscript の子ノードを公開しないため、ここでは要素の存在のみ検証する。
		// フォールバック文言そのものはビルド後の静的 HTML で検証する (PR 手順参照)。
		const { container } = render(<InteractiveExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
