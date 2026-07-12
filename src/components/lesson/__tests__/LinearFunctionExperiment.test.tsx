import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (InteractiveExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/LinearFunctionScene.js', () => ({
	LinearFunctionScene: (props: {
		a: number;
		b: number;
		interactive: boolean;
		onAChange: (v: number) => void;
		onBChange: (v: number) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-a">{props.a}</span>
			<span data-testid="scene-b">{props.b}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			<button type="button" data-testid="drag-a-10" onClick={() => props.onAChange(10)}>
				drag a to 10
			</button>
			<button type="button" data-testid="drag-a-0" onClick={() => props.onAChange(0)}>
				drag a to 0
			</button>
			<button type="button" data-testid="drag-b-0" onClick={() => props.onBChange(0)}>
				drag b to 0
			</button>
		</div>
	),
}));

import { LinearFunctionExperiment } from '../LinearFunctionExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '右上がりの直線から右下がりの直線に変わる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('LinearFunctionExperiment (M4)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<LinearFunctionExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('傾き a')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<LinearFunctionExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる (初期値 a=2, b=1)', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		// y=2x+1: y切片=(0,1)、2点(x=-2,3)から求めた傾き=(7-(-3))/(3-(-2))=2、x切片=-1/2=-0.5
		expect(rowValue(/^傾き a/)).toBe('2');
		expect(rowValue(/^切片 b/)).toBe('1');
		expect(rowValue(/^y 切片の座標/)).toBe('(0, 1)');
		expect(rowValue(/から求めた傾き/)).toBe('2');
		expect(rowValue(/^x 切片/)).toBe('-0.5');
	});

	it('予想確定後、フォーカスが新出現する a スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '傾き a(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '傾き a' });
		fireEvent.change(numberA, { target: { value: '-1' } });
		fireEvent.blur(numberA);

		expect(screen.getByTestId('scene-a')).toHaveTextContent('-1');
		// a が負になっても2点法の傾き確認は保たれる
		expect(rowValue(/から求めた傾き/)).toBe('-1');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '傾き a' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '1.' } });
		expect(numberA.value).toBe('1.');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2'); // 確定前は初期値のまま

		fireEvent.change(numberA, { target: { value: '' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
		expect(numberA.value).toBe('2');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明、a=3 に clamp)', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		// スタブのドラッグは 10 を渡す → clamp で最大 3 に正規化される
		await user.click(screen.getByTestId('drag-a-10'));

		const numberA = screen.getByRole('textbox', { name: '傾き a' }) as HTMLInputElement;
		expect(numberA.value).toBe('3');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('3');
	});

	it('b の数値入力は範囲外を確定時に clamp する', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '切片 b' });
		fireEvent.change(numberB, { target: { value: '999' } });
		fireEvent.blur(numberB);

		// MAX_B=5 に clamp される
		expect(screen.getByTestId('scene-b')).toHaveTextContent('5');
	});

	it('リセットで初期値 (a=2, b=1) に戻る', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '切片 b' });
		fireEvent.change(numberB, { target: { value: '-3' } });
		fireEvent.blur(numberB);
		expect(screen.getByTestId('scene-b')).toHaveTextContent('-3');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
		expect(screen.getByTestId('scene-b')).toHaveTextContent('1');
	});

	it('a=0 (水平線) では x 切片が退化ケースの文言を表示する (b≠0 なら「存在しない」)', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-a-0'));
		expect(rowValue(/^x 切片/)).toContain('存在しない');
	});

	it('a=0, b=0 では x 切片が「すべての x」の文言を表示する', async () => {
		const user = userEvent.setup();
		render(<LinearFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-a-0'));
		await user.click(screen.getByTestId('drag-b-0'));
		expect(rowValue(/^x 切片/)).toContain('すべての x');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<LinearFunctionExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<LinearFunctionExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
