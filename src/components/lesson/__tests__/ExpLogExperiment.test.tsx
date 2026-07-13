import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (QuadraticEquationExperiment.test.tsx
// と同じ方針)。
vi.mock('../../scenes/mafs/ExpLogScene.js', () => ({
	ExpLogScene: (props: { a: number; t: number; interactive: boolean }) => (
		<div data-testid="scene">
			<span data-testid="scene-at">{JSON.stringify([props.a, props.t])}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
		</div>
	),
}));

import { ExpLogExperiment } from '../ExpLogExperiment.js';

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
			name: 'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
		}),
	);
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('ExpLogExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・スライダーを隠す', () => {
		render(<ExpLogExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('底 a')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<ExpLogExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 a=2,t=1 → a^t=2, log_a(a^t)=1)', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^パラメータ t/)).toEqual(['1']);
		expect(rowCells(/^a\^t/)).toEqual(['2']);
		expect(rowCells(/^log_a\(a\^t\)/)).toEqual(['1']);
	});

	it('予想確定後、フォーカスが新出現する a のスライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '底 a(スライダー)' })).toHaveFocus();
	});

	it('往復 log_a(a^t) が実行時検証され、元の t に戻ったことの確認メッセージが表示される', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/確かに元の t/)).toBeInTheDocument();
	});

	it('a を4にすると a^t=4, log_a(a^t)=1 が例外なく表示される(境界で安全)', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '底 a' });
		expect(() => fireEvent.change(numberA, { target: { value: '4' } })).not.toThrow();
		expect(() => fireEvent.blur(numberA)).not.toThrow();

		expect(rowCells(/^a\^t/)).toEqual(['4']);
		expect(rowCells(/^log_a\(a\^t\)/)).toEqual(['1']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('t を負の値(-2)にしても例外なく安全に表示される(境界で例外なし)', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		const numberT = screen.getByRole('textbox', { name: '対応点のパラメータ t' });
		fireEvent.change(numberT, { target: { value: '-2' } });
		expect(() => fireEvent.blur(numberT)).not.toThrow();

		expect(rowCells(/^パラメータ t/)).toEqual(['-2']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		const numberT = screen.getByRole('textbox', { name: '対応点のパラメータ t' }) as HTMLInputElement;
		fireEvent.change(numberT, { target: { value: '' } });
		expect(numberT.value).toBe('');
		expect(rowCells(/^パラメータ t/)).toEqual(['1']); // 確定前は初期値のまま

		fireEvent.blur(numberT);
		expect(rowCells(/^パラメータ t/)).toEqual(['1']); // 空入力の確定は現在値(t=1)を維持
		expect(numberT.value).toBe('1');
	});

	it('可動域の外を入力しても例外なくクランプされる (a:[1.2,4], t:[-2,2])', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '底 a' });
		fireEvent.change(numberA, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '底 a' })).toHaveValue('4');

		fireEvent.change(numberA, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '底 a' })).toHaveValue('1.2');

		const numberT = screen.getByRole('textbox', { name: '対応点のパラメータ t' });
		fireEvent.change(numberT, { target: { value: '999' } });
		fireEvent.blur(numberT);
		expect(screen.getByRole('textbox', { name: '対応点のパラメータ t' })).toHaveValue('2');
	});

	it('リセットで初期値 (a=2,t=1) に戻る', async () => {
		const user = userEvent.setup();
		render(<ExpLogExperiment />);
		await enterExperiment(user);

		const numberT = screen.getByRole('textbox', { name: '対応点のパラメータ t' });
		fireEvent.change(numberT, { target: { value: '-2' } });
		fireEvent.blur(numberT);
		expect(rowCells(/^パラメータ t/)).toEqual(['-2']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^パラメータ t/)).toEqual(['1']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<ExpLogExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<ExpLogExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
