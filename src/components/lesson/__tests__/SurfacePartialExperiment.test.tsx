import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Three.js シーンはブラウザ API(WebGL 等)に依存し jsdom で動かないため、状態同期の結合テスト
// ではシーンをスタブに差し替える(LinearTransform3dScene と同じ方針、ADR-005 §4)。
vi.mock('../../scenes/three/SurfacePartialScene.js', () => ({
	SurfacePartialScene: (props: {
		fnId: string;
		x0: number;
		y0: number;
		revealPartialLabels: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-fnid">{props.fnId}</span>
			<span data-testid="scene-x0">{props.x0}</span>
			<span data-testid="scene-y0">{props.y0}</span>
			<span data-testid="scene-reveal">{String(props.revealPartialLabels)}</span>
		</div>
	),
}));

import { SurfacePartialExperiment } from '../SurfacePartialExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '向きによって変わる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('SurfacePartialExperiment (MVP3 第3波, Tier 3a/Three.js)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・コントロールを隠す(ゲート前は偏微分ラベルも非表示)', () => {
		render(<SurfacePartialExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/注目点 x₀/)).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('false');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<SurfacePartialExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れ、偏微分ラベルのゲートも解ける(golden: paraboloid (1,1)で∂x=2,∂y=2)', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^∂f\/∂x\(解析解\)/)).toEqual(['2']);
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['2']);
		expect(rowCells(/^方向微分の最大値/)).toEqual(['2.83']);
		expect(rowCells(/^最大になる向き/)).toEqual(['45°']);
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('true');
	});

	it('予想確定後、フォーカスが新出現する関数プリセットボタンへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('button', { name: /^放物面/ })).toHaveFocus();
	});

	it('解析解と中心差分の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/結果が、x方向・y方向とも一致しています/)).toBeInTheDocument();
		expect(rowCells(/^x方向: 両経路の一致/)).toEqual(['一致']);
		expect(rowCells(/^y方向: 両経路の一致/)).toEqual(['一致']);
	});

	it('鞍点面プリセットに切り替え、(1,0)では∂x=2・∂y=0、(0,1)では∂y=−2になる(既知例、よくある誤解の反証)', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鞍点面/ }));
		const sliderX = screen.getByLabelText('注目点 x₀');
		const sliderY = screen.getByLabelText('注目点 y₀');

		fireEvent.change(sliderX, { target: { value: '1' } });
		fireEvent.change(sliderY, { target: { value: '0' } });
		expect(rowCells(/^∂f\/∂x\(解析解\)/)).toEqual(['2']);
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['0']);

		fireEvent.change(sliderX, { target: { value: '0' } });
		fireEvent.change(sliderY, { target: { value: '1' } });
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['-2']);
	});

	it('尾根面プリセットに切り替えると、yを動かしても∂yは常に0になる(既知例)', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /尾根面/ }));
		const sliderY = screen.getByLabelText('注目点 y₀');
		fireEvent.change(sliderY, { target: { value: '-2' } });
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['0']);
		fireEvent.change(sliderY, { target: { value: '2' } });
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['0']);
	});

	it('平面プリセットでは∂x=1・∂y=2が(x0,y0)によらず一定で、方向微分の最大は√5≈2.24になる', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /^平面/ }));
		expect(rowCells(/^∂f\/∂x\(解析解\)/)).toEqual(['1']);
		expect(rowCells(/^∂f\/∂y\(解析解\)/)).toEqual(['2']);
		expect(rowCells(/^方向微分の最大値/)).toEqual([(Math.sqrt(5)).toFixed(2)]);
	});

	it('方向 θ スライダーを動かすと方向微分 D_θf の表示が変わる(θ=0でpartialXに一致)', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		const thetaSlider = screen.getByLabelText(/踏み出す向き θ/);
		fireEvent.change(thetaSlider, { target: { value: '0' } });
		expect(rowCells(/^方向微分 D_θf/)).toEqual(['2']);
	});

	it('リセットで初期状態(paraboloid, x0=1,y0=1,θ=45)に戻る', async () => {
		const user = userEvent.setup();
		render(<SurfacePartialExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鞍点面/ }));
		expect(screen.getByTestId('scene-fnid')).toHaveTextContent('saddle');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-fnid')).toHaveTextContent('paraboloid');
		expect(rowCells(/^∂f\/∂x\(解析解\)/)).toEqual(['2']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<SurfacePartialExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<SurfacePartialExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
