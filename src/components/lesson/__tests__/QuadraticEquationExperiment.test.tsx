import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (LinearTransformationExperiment.test.tsx
// と同じ方針)。
vi.mock('../../scenes/mafs/QuadraticEquationScene.js', () => ({
	QuadraticEquationScene: (props: { a: number; b: number; c: number; interactive: boolean }) => (
		<div data-testid="scene">
			<span data-testid="scene-abc">{JSON.stringify([props.a, props.b, props.c])}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
		</div>
	),
}));

import { QuadraticEquationExperiment } from '../QuadraticEquationExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole('radio', {
			name: '放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
		}),
	);
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('QuadraticEquationExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・スライダーを隠す', () => {
		render(<QuadraticEquationExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('係数 a')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<QuadraticEquationExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 a=1,b=-4,c=3 → D=4, 交点2個, 解={1,3})', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^判別式 D/)).toEqual(['4']);
		expect(rowCells(/^x軸との交点の個数/)).toEqual(['2個(異なる2つの実数解)']);
		expect(rowCells(/^解の値/)).toEqual(['1, 3']);
	});

	it('予想確定後、フォーカスが新出現する a のスライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '係数 a(スライダー)' })).toHaveFocus();
	});

	it('解を evaluateStandard に代入すると0に戻ることが実行時検証され、確認メッセージが表示される', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/確かに0に戻ることを確認しました/)).toBeInTheDocument();
	});

	it('c を4にすると D=0(重解)になり、交点1個・解1つが安全に表示される(境界で例外なし)', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		const numberC = screen.getByRole('textbox', { name: '係数 c(y切片)' });
		expect(() => fireEvent.change(numberC, { target: { value: '4' } })).not.toThrow();
		expect(() => fireEvent.blur(numberC)).not.toThrow();

		expect(rowCells(/^判別式 D/)).toEqual(['0']);
		expect(rowCells(/^x軸との交点の個数/)).toEqual(['1個(重解)']);
		expect(rowCells(/^解の値/)).toEqual(['2']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('c を5にすると D<0(実数解なし)になり、交点0個が例外なく安全に表示される', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		const numberC = screen.getByRole('textbox', { name: '係数 c(y切片)' });
		fireEvent.change(numberC, { target: { value: '5' } });
		expect(() => fireEvent.blur(numberC)).not.toThrow();

		expect(rowCells(/^判別式 D/)).toEqual(['-4']);
		expect(rowCells(/^x軸との交点の個数/)).toEqual(['0個(実数の範囲に解はない)']);
		expect(rowCells(/^解の値/)).toEqual(['なし']);
		expect(screen.getByText(/実数の範囲に解はないため/)).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		const numberC = screen.getByRole('textbox', { name: '係数 c(y切片)' }) as HTMLInputElement;
		fireEvent.change(numberC, { target: { value: '' } });
		expect(numberC.value).toBe('');
		expect(rowCells(/^判別式 D/)).toEqual(['4']); // 確定前は初期値のまま

		fireEvent.blur(numberC);
		expect(rowCells(/^判別式 D/)).toEqual(['4']); // 空入力の確定は現在値(c=3)を維持
		expect(numberC.value).toBe('3');
	});

	it('可動域の外を入力しても例外なくクランプされる (a:[1,3], b/c:[-6,6])', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '係数 a' });
		fireEvent.change(numberA, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '係数 a' })).toHaveValue('3');

		fireEvent.change(numberA, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '係数 a' })).toHaveValue('1');

		const numberB = screen.getByRole('textbox', { name: '係数 b' });
		fireEvent.change(numberB, { target: { value: '999' } });
		fireEvent.blur(numberB);
		expect(screen.getByRole('textbox', { name: '係数 b' })).toHaveValue('6');
	});

	it('リセットで初期値 (a=1,b=-4,c=3) に戻る', async () => {
		const user = userEvent.setup();
		render(<QuadraticEquationExperiment />);
		await enterExperiment(user);

		const numberC = screen.getByRole('textbox', { name: '係数 c(y切片)' });
		fireEvent.change(numberC, { target: { value: '5' } });
		fireEvent.blur(numberC);
		expect(rowCells(/^判別式 D/)).toEqual(['-4']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^判別式 D/)).toEqual(['4']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<QuadraticEquationExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<QuadraticEquationExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
