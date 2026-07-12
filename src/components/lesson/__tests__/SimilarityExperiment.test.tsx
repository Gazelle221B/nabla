import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (TrigonometryExperiment.test.tsx と
// 同じ方針)。SimilarityScene にはドラッグ可能な点も interactive フラグもないため
// (設計判断: 操作対象は k のみ)、スタブは受け取った props をそのまま表示するだけでよい。
vi.mock('../../scenes/mafs/SimilarityScene.js', () => ({
	SimilarityScene: (props: {
		center: readonly [number, number];
		original: readonly [
			readonly [number, number],
			readonly [number, number],
			readonly [number, number],
		];
		k: number;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-k">{props.k}</span>
			<span data-testid="scene-center">
				({props.center[0]}, {props.center[1]})
			</span>
		</div>
	),
}));

import { SimilarityExperiment } from '../SimilarityExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '面積比は4倍になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('SimilarityExperiment (M5)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルを表示しない', () => {
		render(<SimilarityExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('相似比 k')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<SimilarityExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 k=2: 辺の比=2, 面積比=4)', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-k')).toHaveTextContent('2');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowValue(/^相似比 k/)).toBe('2');
		expect(rowValue(/^辺の比/)).toBe('2');
		expect(rowValue(/^元の三角形の面積/)).toBe('3');
		expect(rowValue(/^拡大後の三角形の面積/)).toBe('12');
		expect(rowValue(/^面積比/)).toBe('4');
	});

	it('予想確定後、フォーカスが新出現する k スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '相似比 k(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' });
		fireEvent.change(numberK, { target: { value: '1' } });
		fireEvent.blur(numberK);

		expect(screen.getByTestId('scene-k')).toHaveTextContent('1');
		expect(rowValue(/^面積比/)).toBe('1');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' }) as HTMLInputElement;
		fireEvent.change(numberK, { target: { value: '1.' } });
		expect(numberK.value).toBe('1.');
		expect(screen.getByTestId('scene-k')).toHaveTextContent('2'); // 確定前は初期値のまま

		fireEvent.change(numberK, { target: { value: '' } });
		fireEvent.blur(numberK);
		expect(screen.getByTestId('scene-k')).toHaveTextContent('2');
		expect(numberK.value).toBe('2');
	});

	it('k の数値入力は範囲外(3を超える)を確定時に clamp する (MAX_K=3)', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' });
		fireEvent.change(numberK, { target: { value: '10' } });
		fireEvent.blur(numberK);

		expect(screen.getByTestId('scene-k')).toHaveTextContent('3');
		expect(rowValue(/^相似比 k/)).toBe('3');
	});

	it('リセットで初期値 (k=2) に戻る', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' });
		fireEvent.change(numberK, { target: { value: '0.5' } });
		fireEvent.blur(numberK);
		expect(rowValue(/^相似比 k/)).toBe('0.5');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowValue(/^相似比 k/)).toBe('2');
		expect(screen.getByTestId('scene-k')).toHaveTextContent('2');
	});

	it('k=1 (恒等変換) では辺の比・面積比がともに1になる', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' });
		fireEvent.change(numberK, { target: { value: '1' } });
		fireEvent.blur(numberK);

		expect(rowValue(/^辺の比/)).toBe('1');
		expect(rowValue(/^面積比/)).toBe('1');
	});

	it('k=0 (退化ケース) では辺の長さ・面積がともに0になり、破綻せず専用の文言を表示する', async () => {
		const user = userEvent.setup();
		render(<SimilarityExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '相似比 k' });
		fireEvent.change(numberK, { target: { value: '0' } });
		fireEvent.blur(numberK);

		expect(rowValue(/^辺 A′B′ の長さ/)).toBe('0');
		expect(rowValue(/^拡大後の三角形の面積/)).toBe('0');
		expect(screen.getByText(/中心 O の1点に退化しています/)).toBeInTheDocument();
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<SimilarityExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<SimilarityExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
