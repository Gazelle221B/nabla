import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (SequenceExperiment.test.tsx /
// DefiniteIntegralExperiment.test.tsx と同じ方針)。counts をそのまま公開し、
// 親から渡された度数配列を結合テストから検証できるようにする。
vi.mock('../../scenes/mafs/ProbabilityScene.js', () => ({
	ProbabilityScene: (props: { counts: readonly number[] }) => (
		<div data-testid="scene">
			<span data-testid="scene-counts">{JSON.stringify(props.counts)}</span>
		</div>
	),
}));

import { ProbabilityExperiment } from '../ProbabilityExperiment.js';

const SLIDER_MAX = 1000;

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'どの目もほぼ同じ割合に落ち着く' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('ProbabilityExperiment (M7)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・n のスライダーを隠す', () => {
		render(<ProbabilityExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('試行回数 n')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<ProbabilityExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値: seed=42, n=10 → 度数 [0,2,2,3,1,2])', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^度数/)).toEqual(['0', '2', '2', '3', '1', '2']);
		expect(rowCells(/^相対度数/)).toEqual(['0', '0.2', '0.2', '0.3', '0.1', '0.2']);
		expect(rowCells(/^理論確率との差/)).toEqual(['-0.1667', '0.0333', '0.0333', '0.1333', '-0.0667', '0.0333']);
	});

	it('予想確定後、フォーカスが新出現する n スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' })).toHaveFocus();
	});

	it('度数の総和 = n の実行時検証が「一致しています」と表示される(初期値 n=10)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/度数の総和\(10\)は試行回数 n\(10\)と一致しています/)).toBeInTheDocument();
	});

	it('n のスライダーを最大 (対数目盛りの右端) まで動かすと n=6000 になり、例外なく観察が更新される', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		const slider = screen.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		expect(() => fireEvent.change(slider, { target: { value: String(SLIDER_MAX) } })).not.toThrow();

		expect(screen.getByRole('textbox', { name: '試行回数 n' })).toHaveValue('6000');
		const counts: number[] = JSON.parse(screen.getByTestId('scene-counts').textContent ?? '[]');
		expect(counts.reduce((a, b) => a + b, 0)).toBe(6000);
		expect(screen.getByText(/度数の総和\(6000\)は試行回数 n\(6000\)と一致しています/)).toBeInTheDocument();
	});

	it('n のスライダーを最小 (対数目盛りの左端) まで動かすと n=10 になり、例外なく動作する', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		const slider = screen.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		fireEvent.change(slider, { target: { value: '500' } }); // 中間値へ動かしてから
		expect(() => fireEvent.change(slider, { target: { value: '0' } })).not.toThrow();

		expect(screen.getByRole('textbox', { name: '試行回数 n' })).toHaveValue('10');
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (n=100, seed=42 の既知例)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '試行回数 n' });
		fireEvent.change(numberN, { target: { value: '100' } });
		fireEvent.blur(numberN);

		expect(rowCells(/^度数/)).toEqual(['16', '21', '13', '18', '15', '17']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '試行回数 n' }) as HTMLInputElement;
		fireEvent.change(numberN, { target: { value: '' } });
		expect(numberN.value).toBe('');
		expect(rowCells(/^度数/)).toEqual(['0', '2', '2', '3', '1', '2']); // 確定前は初期値のまま

		fireEvent.blur(numberN);
		expect(numberN.value).toBe('10');
	});

	it('数値入力に範囲外の値を入れても確定時にクランプされ例外なし (n)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '試行回数 n' }) as HTMLInputElement;

		fireEvent.change(numberN, { target: { value: '999999' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('6000');

		fireEvent.change(numberN, { target: { value: '-5' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('10');
	});

	it('「振り直す」を押すとシードが変わり、同じ n でも度数が変わる(例外なし)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		expect(rowCells(/^度数/)).toEqual(['0', '2', '2', '3', '1', '2']); // seed=42, n=10

		await user.click(screen.getByRole('button', { name: '振り直す' }));

		// seed=43, n=10 の既知例(元の結果とは異なる=振り直しで実際に値が変わることを確認)。
		expect(rowCells(/^度数/)).toEqual(['4', '2', '0', '1', '1', '2']);
	});

	it('リセットで初期値 (seed=42, n=10) に戻る', async () => {
		const user = userEvent.setup();
		render(<ProbabilityExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: '振り直す' }));
		const numberN = screen.getByRole('textbox', { name: '試行回数 n' });
		fireEvent.change(numberN, { target: { value: '500' } });
		fireEvent.blur(numberN);
		expect(rowCells(/^度数/)).not.toEqual(['0', '2', '2', '3', '1', '2']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^度数/)).toEqual(['0', '2', '2', '3', '1', '2']);
		expect(screen.getByRole('textbox', { name: '試行回数 n' })).toHaveValue('10');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<ProbabilityExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<ProbabilityExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
