import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DotProductExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/LinearTransformationScene.js', () => ({
	LinearTransformationScene: (props: {
		matrix: readonly [readonly [number, number], readonly [number, number]];
		interactive: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-matrix">{JSON.stringify(props.matrix)}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
		</div>
	),
}));

import { LinearTransformationExperiment } from '../LinearTransformationExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '行列式(の絶対値)で決まる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('LinearTransformationExperiment (M7)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・スライダーを隠す', () => {
		render(<LinearTransformationExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('成分 a')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<LinearTransformationExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 a=2,b=1,c=0,d=1 → det=2, 実測面積=2)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^行列式/)).toEqual(['2']);
		expect(rowCells(/^実測面積/)).toEqual(['2']);
		expect(rowCells(/^面積比/)).toEqual(['2']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('予想確定後、フォーカスが新出現する a のスライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '成分 a(スライダー)' })).toHaveFocus();
	});

	it('行列式と実測面積の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/結果が一致しています/)).toBeInTheDocument();
	});

	it('鏡映プリセットに切り替えると det=-1・向き=反転になり、例外なく安全に表示される', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鏡映行列/ }));

		expect(rowCells(/^行列式/)).toEqual(['-1']);
		expect(rowCells(/^面積比/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['反転']);
		expect(screen.getByText(/向きが反転しています/)).toBeInTheDocument();
	});

	it('対角行列プリセットに切り替えると det=6 になる (既知例)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /対角行列/ }));

		expect(rowCells(/^行列式/)).toEqual(['6']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('単位行列プリセットに切り替えると det=1・面積比=1・向き=保持になる (既知例)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /単位行列/ }));

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(rowCells(/^面積比/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('回転行列プリセットに切り替えると det=1(面積・向きを保つ)になる (既知例)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /回転行列/ }));

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (成分 a)', async () => {
		render(<LinearTransformationExperiment />);
		const user = userEvent.setup();
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a' });
		fireEvent.change(numberA, { target: { value: '-2' } });
		fireEvent.blur(numberA);

		expect(rowCells(/^行列式/)).toEqual([String(-2 * 1 - 1 * 0)]);
		expect(screen.getByTestId('scene-matrix')).toHaveTextContent('[[-2,1],[0,1]]');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '' } });
		expect(numberA.value).toBe('');
		expect(rowCells(/^行列式/)).toEqual(['2']); // 確定前は初期値のまま

		fireEvent.blur(numberA);
		expect(rowCells(/^行列式/)).toEqual(['2']); // 空入力の確定は現在値(a=2)を維持 → det は変わらない
		expect(numberA.value).toBe('2');
	});

	it('可動域の外(999・-999)を入力しても例外なくクランプされる([-3,3])', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a' });

		fireEvent.change(numberA, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '成分 a' })).toHaveValue('3');

		fireEvent.change(numberA, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '成分 a' })).toHaveValue('-3');
	});

	it('行列式が0(退化)でも例外なく安全表示される(向きは「定義されません」)', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		// a=1,b=1,c=1,d=1 → det = 1*1-1*1 = 0 (階数1、退化)
		const numberA = screen.getByRole('textbox', { name: '成分 a' });
		fireEvent.change(numberA, { target: { value: '1' } });
		fireEvent.blur(numberA);
		const numberC = screen.getByRole('textbox', { name: '成分 c' });
		fireEvent.change(numberC, { target: { value: '1' } });
		fireEvent.blur(numberC);

		expect(() => fireEvent.blur(numberC)).not.toThrow();
		expect(rowCells(/^行列式/)).toEqual(['0']);
		expect(rowCells(/^向き/)).toEqual(['定義されません(退化)']);
		expect(screen.getByText(/図形が線分や点に潰れています/)).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('リセットで初期値 (a=2,b=1,c=0,d=1) に戻る', async () => {
		const user = userEvent.setup();
		render(<LinearTransformationExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鏡映行列/ }));
		expect(rowCells(/^行列式/)).toEqual(['-1']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^行列式/)).toEqual(['2']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<LinearTransformationExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<LinearTransformationExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
