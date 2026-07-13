import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DotProductExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/ScatterScene.js', () => ({
	ScatterScene: (props: {
		fixedPoints: readonly [number, number][];
		movablePoint: [number, number];
		meanPoint: [number, number];
		interactive: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-fixed">{JSON.stringify(props.fixedPoints)}</span>
			<span data-testid="scene-movable">{JSON.stringify(props.movablePoint)}</span>
			<span data-testid="scene-mean">{JSON.stringify(props.meanPoint)}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
		</div>
	),
}));

import { DataAnalysisExperiment } from '../DataAnalysisExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '平均も相関係数も大きく変わる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DataAnalysisExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作 UI を隠す', () => {
		render(<DataAnalysisExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('可動点の x 座標')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DataAnalysisExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れ、初期値(可動点=(8,10))の平均・分散・標準偏差・共分散・相関係数が正しく計算される', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^可動点/)).toEqual(['(8, 10)']);
		// 手計算(再検算済み): points=(3,2),(3,3),(3,4),(3,5),(3,6),(8,10)
		// x̄=23/6≈3.83, ȳ=30/6=5, var(x)=125/36≈3.47, var(y)=40/6≈6.67,
		// sd(x)≈1.86, sd(y)≈2.58, cov=25/6≈4.17, r=cov/(sd(x)sd(y))≈0.87
		expect(rowCells(/^平均 x̄/)).toEqual(['3.83']);
		expect(rowCells(/^平均 ȳ/)).toEqual(['5']);
		expect(rowCells(/^分散\(x\)/)).toEqual(['3.47']);
		expect(rowCells(/^分散\(y\)/)).toEqual(['6.67']);
		expect(rowCells(/^標準偏差\(x\)/)).toEqual(['1.86']);
		expect(rowCells(/^標準偏差\(y\)/)).toEqual(['2.58']);
		expect(rowCells(/^共分散/)).toEqual(['4.17']);
		expect(rowCells(/^相関係数 r/)).toEqual(['0.87']);
	});

	it('予想確定後、フォーカスが新出現する可動点の x スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '可動点の x 座標(スライダー)' })).toHaveFocus();
	});

	it('分散の2定義の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('可動点を外れ値の位置(y=-5)へ動かすと、相関係数の符号が変わり負の値になる(外れ値1点が相関係数を大きく動かす)', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const sliderY = screen.getByRole('slider', { name: '可動点の y 座標(スライダー)' });
		fireEvent.change(sliderY, { target: { value: '-5' } });

		// 手計算(再検算済み): points=(3,2..6),(8,-5) → ȳ=15/6=2.5, cov=-37.5/6=-6.25,
		// var(y)=77.5/6≈12.92, r=cov/sqrt(var(x)var(y))≈-0.93
		expect(rowCells(/^相関係数 r/)).toEqual(['-0.93']);
		expect(screen.getByText(/負の相関/)).toBeInTheDocument();
	});

	it('可動点を固定5点と同じ x=3 へ動かすと、全点のx座標が同一になり相関係数は「定義されません」と safe 表示される', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const sliderX = screen.getByRole('slider', { name: '可動点の x 座標(スライダー)' });
		expect(() => fireEvent.change(sliderX, { target: { value: '3' } })).not.toThrow();

		expect(rowCells(/^相関係数 r/)).toEqual(['定義されません']);
		expect(screen.getByText(/縦一直線または横一直線に並んだ状態/)).toBeInTheDocument();
	});

	it('リセットで初期値(可動点=(8,10))に戻る', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const sliderX = screen.getByRole('slider', { name: '可動点の x 座標(スライダー)' });
		fireEvent.change(sliderX, { target: { value: '3' } });
		expect(rowCells(/^可動点/)).not.toEqual(['(8, 10)']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^可動点/)).toEqual(['(8, 10)']);
		expect(rowCells(/^相関係数 r/)).toEqual(['0.87']);
	});

	it('数値入力 → 確定 (blur) → 状態 → 観察表 へ同期する (可動点の x 座標)', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '可動点の x 座標' });
		fireEvent.change(numberX, { target: { value: '5' } });
		fireEvent.blur(numberX);

		expect(rowCells(/^可動点/)).toEqual(['(5, 10)']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '可動点の x 座標' }) as HTMLInputElement;
		fireEvent.change(numberX, { target: { value: '' } });
		expect(numberX.value).toBe('');
		expect(rowCells(/^可動点/)).toEqual(['(8, 10)']); // 確定前は初期値のまま

		fireEvent.blur(numberX);
		expect(rowCells(/^可動点/)).toEqual(['(8, 10)']);
		expect(numberX.value).toBe('8');
	});

	it('可動域の外(x=999, y=-999)を数値入力しても、クランプされて例外なし', async () => {
		const user = userEvent.setup();
		render(<DataAnalysisExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: '可動点の x 座標' });
		fireEvent.change(numberX, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberX)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '可動点の x 座標' })).toHaveValue('10');

		const numberY = screen.getByRole('textbox', { name: '可動点の y 座標' });
		fireEvent.change(numberY, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberY)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '可動点の y 座標' })).toHaveValue('-6');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DataAnalysisExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DataAnalysisExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
