import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (LinearFunctionExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/QuadraticFunctionScene.js', () => ({
	QuadraticFunctionScene: (props: {
		a: number;
		p: number;
		q: number;
		interactive: boolean;
		onAChange: (v: number) => void;
		onPChange: (v: number) => void;
		onQChange: (v: number) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-a">{props.a}</span>
			<span data-testid="scene-p">{props.p}</span>
			<span data-testid="scene-q">{props.q}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			<button type="button" data-testid="drag-a-10" onClick={() => props.onAChange(10)}>
				drag a to 10
			</button>
			<button type="button" data-testid="drag-a-0" onClick={() => props.onAChange(0)}>
				drag a to 0
			</button>
			<button type="button" data-testid="drag-a-neg1" onClick={() => props.onAChange(-1)}>
				drag a to -1
			</button>
			<button type="button" data-testid="drag-p-99" onClick={() => props.onPChange(99)}>
				drag p to 99
			</button>
			<button type="button" data-testid="drag-q-99" onClick={() => props.onQChange(99)}>
				drag q to 99
			</button>
		</div>
	),
}));

import { QuadraticFunctionExperiment } from '../QuadraticFunctionExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole('radio', { name: '開き方が狭くなり、より急な(とがった)グラフになる' }),
	);
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('QuadraticFunctionExperiment (M4)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<QuadraticFunctionExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('開き a')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<QuadraticFunctionExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる (初期値 a=1, p=2, q=-3)', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		// y=(x-2)^2-3: 頂点=(2,-3)、対称軸 x=2、x=p での評価値=-3、対称な2点(x=0,4)での値=1/1
		expect(rowValue(/^開き a/)).toBe('1');
		expect(rowValue(/^頂点の x 座標 p/)).toBe('2');
		expect(rowValue(/^頂点の y 座標 q/)).toBe('-3');
		expect(rowValue(/^頂点の座標/)).toBe('(2, -3)');
		expect(rowValue(/^対称軸/)).toBe('x = 2');
		expect(rowValue(/での評価値/)).toBe('-3');
	});

	it('予想確定後、フォーカスが新出現する a スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '開き a(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '開き a' });
		fireEvent.change(numberA, { target: { value: '-1' } });
		fireEvent.blur(numberA);

		expect(screen.getByTestId('scene-a')).toHaveTextContent('-1');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		const numberP = screen.getByRole('textbox', { name: '頂点の x 座標 p' }) as HTMLInputElement;
		fireEvent.change(numberP, { target: { value: '1.' } });
		expect(numberP.value).toBe('1.');
		expect(screen.getByTestId('scene-p')).toHaveTextContent('2'); // 確定前は初期値のまま

		fireEvent.change(numberP, { target: { value: '' } });
		fireEvent.blur(numberP);
		expect(screen.getByTestId('scene-p')).toHaveTextContent('2');
		expect(numberP.value).toBe('2');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明、a=3 に clamp)', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		// スタブのドラッグは 10 を渡す → clamp で最大 3 に正規化される
		await user.click(screen.getByTestId('drag-a-10'));

		const numberA = screen.getByRole('textbox', { name: '開き a' }) as HTMLInputElement;
		expect(numberA.value).toBe('3');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('3');
	});

	it('p の数値入力は範囲外を確定時に clamp する', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		const numberP = screen.getByRole('textbox', { name: '頂点の x 座標 p' });
		fireEvent.change(numberP, { target: { value: '999' } });
		fireEvent.blur(numberP);

		// MAX_P=4 に clamp される
		expect(screen.getByTestId('scene-p')).toHaveTextContent('4');
	});

	it('ドラッグで p, q の範囲外の値も clamp される', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-p-99'));
		expect(screen.getByTestId('scene-p')).toHaveTextContent('4'); // MAX_P=4

		await user.click(screen.getByTestId('drag-q-99'));
		expect(screen.getByTestId('scene-q')).toHaveTextContent('5'); // MAX_Q=5
	});

	it('リセットで初期値 (a=1, p=2, q=-3) に戻る', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		const numberQ = screen.getByRole('textbox', { name: '頂点の y 座標 q' });
		fireEvent.change(numberQ, { target: { value: '4' } });
		fireEvent.blur(numberQ);
		expect(screen.getByTestId('scene-q')).toHaveTextContent('4');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1');
		expect(screen.getByTestId('scene-p')).toHaveTextContent('2');
		expect(screen.getByTestId('scene-q')).toHaveTextContent('-3');
	});

	it('a=0 (退化ケース) では二次関数ではない旨の文言を表示する', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-a-0'));
		expect(screen.getByText(/二次関数ではなく/)).toBeInTheDocument();
	});

	it('a<0 では上に凸(頂点が最大値)の文言を表示する', async () => {
		const user = userEvent.setup();
		render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-a-neg1'));
		expect(screen.getByText(/上に凸/)).toBeInTheDocument();
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<QuadraticFunctionExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<QuadraticFunctionExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
