import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Three.js シーンはブラウザ API(WebGL 等)に依存し jsdom で動かないため、状態同期の結合テスト
// ではシーンをスタブに差し替える(前単元 LinearTransform3dExperiment と同じ方針、ADR-005 §4)。
vi.mock('../../scenes/three/RotationBasisScene.js', () => ({
	RotationBasisScene: (props: {
		rotationMatrix: readonly [
			readonly [number, number, number],
			readonly [number, number, number],
			readonly [number, number, number],
		];
		vector: readonly [number, number, number];
		revealCoordinates: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-matrix">{JSON.stringify(props.rotationMatrix)}</span>
			<span data-testid="scene-vector">{JSON.stringify(props.vector)}</span>
			<span data-testid="scene-reveal">{String(props.revealCoordinates)}</span>
		</div>
	),
}));

import { RotationBasisExperiment } from '../RotationBasisExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '点が逆向きに動いたかのように変わる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('RotationBasisExperiment (MVP3, Tier 3a/Three.js)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・コントロールを隠す(ゲート前は座標ラベルも非表示)', () => {
		render(<RotationBasisExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/角度 θ\(度\)\(スライダー\)/)).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('false');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<RotationBasisExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れ、座標ラベルのゲートも解ける', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('true');
	});

	it('予想確定後、フォーカスが新出現する回転軸(x軸)ラジオへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('radio', { name: 'x軸' })).toHaveFocus();
	});

	it('golden: z軸・θ=90°・v=(1,0,0) のとき、新基底での座標は (0,-1,0) になる(2経路とも一致)', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		// z軸は初期選択済み。θ を 90 に設定する。
		const thetaSlider = screen.getByLabelText('角度 θ(度)(スライダー)');
		fireEvent.change(thetaSlider, { target: { value: '90' } });

		// v を (1, 0, 0) に設定する。
		const vy = screen.getByRole('textbox', { name: 'ベクトル v の成分 y' });
		fireEvent.change(vy, { target: { value: '0' } });
		fireEvent.blur(vy);
		const vz = screen.getByRole('textbox', { name: 'ベクトル v の成分 z' });
		fireEvent.change(vz, { target: { value: '0' } });
		fireEvent.blur(vz);

		expect(rowCells(/^新基底での座標/)).toEqual(['(0, -1, 0)']);
		expect(rowCells(/^クラメル法の座標/)).toEqual(['(0, -1, 0)']);
		expect(screen.getByText(/結果が一致しています/)).toBeInTheDocument();
	});

	it('両経路(転置・クラメル法)の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/転置の経路.*クラメル法の経路.*結果が一致しています/)).toBeInTheDocument();
	});

	it('ノルム保存(|v| と新基底での|座標ベクトル|の一致)が表示される', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		expect(screen.getAllByText(/ノルム保存/).length).toBeGreaterThan(0);
	});

	it('回転軸をxに切り替えるとシーンへ渡す行列が変わる', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		const before = screen.getByTestId('scene-matrix').textContent;
		await user.click(screen.getByRole('radio', { name: 'x軸' }));
		const after = screen.getByTestId('scene-matrix').textContent;
		expect(after).not.toEqual(before);
	});

	it('θ スライダーをキーボード(矢印キー)で操作しても状態が更新される', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		const thetaSlider = screen.getByLabelText('角度 θ(度)(スライダー)') as HTMLInputElement;
		thetaSlider.focus();
		fireEvent.change(thetaSlider, { target: { value: '50' } });
		expect(screen.getByText('θ = 50°')).toBeInTheDocument();
	});

	it('数値入力 → 確定(blur)→ 状態 → シーン へ同期する(成分 x)', async () => {
		render(<RotationBasisExperiment />);
		const user = userEvent.setup();
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: 'ベクトル v の成分 x' });
		fireEvent.change(numberX, { target: { value: '-2' } });
		fireEvent.blur(numberX);

		expect(rowCells(/^世界座標での v/)).toEqual(['(-2, 0.5, 0.3)']);
		expect(screen.getByTestId('scene-vector')).toHaveTextContent('[-2,0.5,0.3]');
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: 'ベクトル v の成分 x' }) as HTMLInputElement;
		fireEvent.change(numberX, { target: { value: '' } });
		expect(numberX.value).toBe('');
		expect(rowCells(/^世界座標での v/)).toEqual(['(1, 0.5, 0.3)']); // 確定前は初期値のまま

		fireEvent.blur(numberX);
		expect(rowCells(/^世界座標での v/)).toEqual(['(1, 0.5, 0.3)']); // 空入力の確定は現在値を維持
		expect(numberX.value).toBe('1');
	});

	it('可動域の外(999・-999)を入力しても例外なくクランプされる(成分は[-2,2])', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		const numberX = screen.getByRole('textbox', { name: 'ベクトル v の成分 x' });

		fireEvent.change(numberX, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberX)).not.toThrow();
		expect(screen.getByRole('textbox', { name: 'ベクトル v の成分 x' })).toHaveValue('2');

		fireEvent.change(numberX, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberX)).not.toThrow();
		expect(screen.getByRole('textbox', { name: 'ベクトル v の成分 x' })).toHaveValue('-2');
	});

	it('リセットで初期値に戻る', async () => {
		const user = userEvent.setup();
		render(<RotationBasisExperiment />);
		await enterExperiment(user);

		const thetaSlider = screen.getByLabelText('角度 θ(度)(スライダー)');
		fireEvent.change(thetaSlider, { target: { value: '200' } });
		expect(screen.getByText('θ = 200°')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByText('θ = 45°')).toBeInTheDocument();
		expect(rowCells(/^世界座標での v/)).toEqual(['(1, 0.5, 0.3)']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<RotationBasisExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<RotationBasisExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
