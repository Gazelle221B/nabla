import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (SequenceExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/DotProductScene.js', () => ({
	DotProductScene: (props: {
		a: [number, number];
		b: [number, number];
		angle: number;
		isPerpendicular: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-a">{JSON.stringify(props.a)}</span>
			<span data-testid="scene-b">{JSON.stringify(props.b)}</span>
			<span data-testid="scene-angle">{props.angle}</span>
			<span data-testid="scene-perpendicular">{String(props.isPerpendicular)}</span>
		</div>
	),
}));

import { DotProductExperiment } from '../DotProductExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '内積はちょうど0になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DotProductExperiment (M7)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・角度スライダーを隠す', () => {
		render(<DotProductExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('a の向き(度)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DotProductExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値: a=0°, b=50°, |a|=3, |b|=4)', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^a\b/)).toEqual(['(3, 0)']);
		// なす角θは |50-0| = 50°
		expect(rowCells(/^なす角θ/)).toEqual(['50']);
	});

	it('予想確定後、フォーカスが新出現する a の角度スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: 'a の向き(スライダー)' })).toHaveFocus();
	});

	it('成分計算と|a||b|cosθの一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/結果が一致しています/)).toBeInTheDocument();
	});

	it('b の向きを90°(aから見て直角)にすると、内積がちょうど0になり直角の状態文が表示される', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const sliderB = screen.getByRole('slider', { name: 'b の向き(スライダー)' });
		fireEvent.change(sliderB, { target: { value: '90' } });

		expect(screen.getByTestId('scene-perpendicular')).toHaveTextContent('true');
		expect(rowCells(/^成分計算/)).toEqual(['0']);
		expect(rowCells(/^\|a\|\|b\|cosθ/)).toEqual(['0']);
		expect(screen.getByText(/ちょうど直角です/)).toBeInTheDocument();
	});

	it('直角でないときは「ちょうど直角です」ではなく現在のなす角を案内する状態文が表示される', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-perpendicular')).toHaveTextContent('false');
		expect(screen.getByText(/90° に近づけると内積が0に近づく/)).toBeInTheDocument();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (a の向き)', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: 'a の向き(度)' });
		fireEvent.change(numberA, { target: { value: '90' } });
		fireEvent.blur(numberA);

		// a=(0,3)(向き90°、大きさ3)に更新される
		expect(rowCells(/^a\b/)).toEqual(['(0, 3)']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: 'a の向き(度)' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '' } });
		expect(numberA.value).toBe('');
		expect(rowCells(/^a\b/)).toEqual(['(3, 0)']); // 確定前は初期値のまま

		fireEvent.blur(numberA);
		expect(rowCells(/^a\b/)).toEqual(['(3, 0)']);
		expect(numberA.value).toBe('0');
	});

	it('角度が可動域の外(999度・負の値)でも正規化(360で折り返し)されて例外なし', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: 'a の向き(度)' });

		fireEvent.change(numberA, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		// 999 % 360 = 279度
		expect(screen.getByRole('textbox', { name: 'a の向き(度)' })).toHaveValue('279');

		fireEvent.change(numberA, { target: { value: '-30' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		// -30 は 330度に正規化される
		expect(screen.getByRole('textbox', { name: 'a の向き(度)' })).toHaveValue('330');
	});

	it('a と b が平行(同じ向き)でも例外なく、内積は |a||b| に一致する', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const sliderB = screen.getByRole('slider', { name: 'b の向き(スライダー)' });
		expect(() => fireEvent.change(sliderB, { target: { value: '0' } })).not.toThrow();

		// a=(3,0), b=(4,0) (どちらも向き0°) → 成分計算 = 3*4 = 12 = |a||b|
		expect(rowCells(/^成分計算/)).toEqual(['12']);
		expect(screen.getByTestId('scene-perpendicular')).toHaveTextContent('false');
	});

	it('a と b が反平行(正反対の向き)でも例外なく、内積は -|a||b| に一致する', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const sliderB = screen.getByRole('slider', { name: 'b の向き(スライダー)' });
		expect(() => fireEvent.change(sliderB, { target: { value: '180' } })).not.toThrow();

		// a=(3,0), b=(-4,0) → 成分計算 = 3*(-4) = -12 = -|a||b|
		expect(rowCells(/^成分計算/)).toEqual(['-12']);
	});

	it('リセットで初期値 (a=0°, b=50°) に戻る', async () => {
		const user = userEvent.setup();
		render(<DotProductExperiment />);
		await enterExperiment(user);

		const sliderB = screen.getByRole('slider', { name: 'b の向き(スライダー)' });
		fireEvent.change(sliderB, { target: { value: '200' } });
		expect(rowCells(/^なす角θ/)).not.toEqual(['50']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^なす角θ/)).toEqual(['50']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DotProductExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DotProductExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
