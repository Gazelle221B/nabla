import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (QuadraticFunctionExperiment.test.tsx と
// 同じ方針)。
vi.mock('../../scenes/mafs/UnitCircleScene.js', () => ({
	UnitCircleScene: (props: {
		theta: number;
		point: readonly [number, number];
		interactive: boolean;
		onPointChange: (p: [number, number]) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-theta">{props.theta}</span>
			<span data-testid="scene-point-x">{props.point[0]}</span>
			<span data-testid="scene-point-y">{props.point[1]}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			{/* (0,1) は角度90度(atan2(1,0)=π/2)に相当するドラッグ */}
			<button type="button" data-testid="drag-to-90" onClick={() => props.onPointChange([0, 1])}>
				drag to (0,1)
			</button>
			{/* (√2/2,√2/2) は角度45度に相当するドラッグ */}
			<button
				type="button"
				data-testid="drag-to-45"
				onClick={() => props.onPointChange([Math.SQRT1_2, Math.SQRT1_2])}
			>
				drag to 45deg
			</button>
		</div>
	),
}));

import { TrigonometryExperiment } from '../TrigonometryExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'cos θ は 1 から 0 へ向かって減っていく' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('TrigonometryExperiment (M4)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルとドラッグを無効化する', () => {
		render(<TrigonometryExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('角度 θ(度)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<TrigonometryExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる (初期値 θ=0: cos=1, sin=0, tan=0)', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowValue(/^角度 θ\(度\)/)).toBe('0');
		expect(rowValue(/^単位円上の点/)).toBe('(1, 0)');
		expect(rowValue(/^sin θ/)).toBe('0');
		expect(rowValue(/^cos θ/)).toBe('1');
		expect(rowValue(/^tan θ/)).toBe('0');
		expect(rowValue(/^sin²θ \+ cos²θ/)).toBe('1');
	});

	it('予想確定後、フォーカスが新出現する θ スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '角度 θ(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '45' } });
		fireEvent.blur(numberTheta);

		expect(rowValue(/^角度 θ\(度\)/)).toBe('45');
		expect(rowValue(/^tan θ/)).toBe('1');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '角度 θ(度)' }) as HTMLInputElement;
		fireEvent.change(numberTheta, { target: { value: '4.' } });
		expect(numberTheta.value).toBe('4.');
		expect(rowValue(/^角度 θ\(度\)/)).toBe('0'); // 確定前は初期値のまま

		fireEvent.change(numberTheta, { target: { value: '' } });
		fireEvent.blur(numberTheta);
		expect(rowValue(/^角度 θ\(度\)/)).toBe('0');
		expect(numberTheta.value).toBe('0');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明、90度に相当する点)', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-to-90'));

		const numberTheta = screen.getByRole('textbox', { name: '角度 θ(度)' }) as HTMLInputElement;
		expect(numberTheta.value).toBe('90');
		expect(rowValue(/^角度 θ\(度\)/)).toBe('90');
	});

	it('θ の数値入力は範囲外(360以上)を確定時に360度で正規化する', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '400' } });
		fireEvent.blur(numberTheta);

		// 400 度は 360 度で正規化すると 40 度
		expect(rowValue(/^角度 θ\(度\)/)).toBe('40');
	});

	it('リセットで初期値 (θ=0) に戻る', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '200' } });
		fireEvent.blur(numberTheta);
		expect(rowValue(/^角度 θ\(度\)/)).toBe('200');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowValue(/^角度 θ\(度\)/)).toBe('0');
	});

	it('θ=90° 付近 (cos≈0) では tan 表示が破綻せず「定義されません」と安全に表示する(退化ケース)', async () => {
		const user = userEvent.setup();
		render(<TrigonometryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByTestId('drag-to-90'));

		expect(rowValue(/^tan θ/)).toBe('定義されません (cos θ ≈ 0)');
		expect(screen.getByText(/tan θ は定義されません/)).toBeInTheDocument();
		// ピタゴラス恒等式自体は θ=90° でも破綻しない
		expect(rowValue(/^sin²θ \+ cos²θ/)).toBe('1');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<TrigonometryExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<TrigonometryExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
