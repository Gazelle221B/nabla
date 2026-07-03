import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// T3-1 (InteractiveExperiment.test.tsx) と同じ方針でスタブに差し替える。
// スタブは props で受け取った matrix/v/av/interactive を表示し、ドラッグ相当の
// コールバックをボタンで露出する。これにより「ドラッグ (scene→state) ↔ 数値入力
// (input→state) ↔ 観察表示」の単一状態同期を Mafs に依存せず検証できる。
vi.mock('../../scenes/mafs/EigenvectorScene.js', () => ({
	EigenvectorScene: (props: {
		v: readonly [number, number];
		interactive: boolean;
		onVChange: (point: [number, number]) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-v">{`${props.v[0]},${props.v[1]}`}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			{/* (0,1) 相当の向き (90度) へドラッグしたことを模す */}
			<button type="button" data-testid="drag-to-90" onClick={() => props.onVChange([0, 1])}>
				drag v to 90deg
			</button>
		</div>
	),
}));

import { EigenvectorExperiment } from '../EigenvectorExperiment.js';

describe('EigenvectorExperiment (M3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<EigenvectorExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('v の向き(度)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<EigenvectorExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
		await user.click(screen.getByRole('radio', { name: /特定の向きの v でだけ/ }));
		await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
	}

	it('予想を確定するとシーンが操作可能になり観察が現れる', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(screen.getByRole('rowheader', { name: 'v' })).toBeInTheDocument();
		expect(screen.getByRole('rowheader', { name: 'Av' })).toBeInTheDocument();
	});

	it('予想確定後、フォーカスが新出現する角度スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: 'v の向き(度)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する (input が単一状態を更新)', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		const numberAngle = screen.getByRole('textbox', { name: 'v の向き(度)' });
		fireEvent.change(numberAngle, { target: { value: '90' } });
		fireEvent.blur(numberAngle);

		// 90度: v = (cos90, sin90) ≈ (0, 1)
		const sceneV = screen.getByTestId('scene-v').textContent ?? '';
		const [x, y] = sceneV.split(',').map(Number);
		expect(x).toBeCloseTo(0, 5);
		expect(y).toBeCloseTo(1, 5);
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		const numberAngle = screen.getByRole('textbox', { name: 'v の向き(度)' }) as HTMLInputElement;
		fireEvent.change(numberAngle, { target: { value: '9' } });
		expect(numberAngle.value).toBe('9');

		fireEvent.change(numberAngle, { target: { value: '' } });
		fireEvent.blur(numberAngle);
		// 空にして blur すると直前の確定値 (初期値 20) へ戻る
		expect(numberAngle.value).toBe('20');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明)', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-to-90'));

		const numberAngle = screen.getByRole('textbox', { name: 'v の向き(度)' }) as HTMLInputElement;
		expect(Number(numberAngle.value)).toBeCloseTo(90, 5);
	});

	it('行列プリセットを切り替えられる(誤解例: 回転行列)', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: /回転行列/ }));
		expect(screen.getByText(/一度も揃うことがありません/)).toBeInTheDocument();
		expect(screen.getByText(/特異行列ではありません/)).toBeInTheDocument();
	});

	it('リセットで初期角度 (20度) に戻る', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);

		const numberAngle = screen.getByRole('textbox', { name: 'v の向き(度)' });
		fireEvent.change(numberAngle, { target: { value: '200' } });
		fireEvent.blur(numberAngle);
		expect((numberAngle as HTMLInputElement).value).toBe('200');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect((numberAngle as HTMLInputElement).value).toBe('20');
	});

	it('観察パネルは aria-live を持ち、状態の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<EigenvectorExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<EigenvectorExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});

	it('伸縮行列の既定プリセットでは固有値の理論値 (1と3) が Checkpoint に表示される', async () => {
		const user = userEvent.setup();
		render(<EigenvectorExperiment />);
		await enterExperiment(user);
		const checkpoint = screen.getByText(/この行列の固有値は/);
		expect(checkpoint.textContent).toContain('1');
		expect(checkpoint.textContent).toContain('3');
	});
});
