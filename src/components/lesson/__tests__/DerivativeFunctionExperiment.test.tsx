import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DerivativeExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/DerivativeFunctionScene.js', () => ({
	DerivativeFunctionScene: (props: {
		coeffs: readonly number[];
		a: number;
		tangentSlope: number;
		interactive: boolean;
		onAChange: (v: number) => void;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-coeffs-length">{props.coeffs.length}</span>
			<span data-testid="scene-a">{props.a}</span>
			<span data-testid="scene-tangent-slope">{props.tangentSlope}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
			<button type="button" data-testid="drag-a-10" onClick={() => props.onAChange(10)}>
				drag a to 10
			</button>
		</div>
	),
}));

import { DerivativeFunctionExperiment } from '../DerivativeFunctionExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '直線になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DerivativeFunctionExperiment (M6)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・関数切替・ドラッグを無効化する', () => {
		render(<DerivativeFunctionExperiment />);
		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('false');
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('接点 a の位置')).not.toBeInTheDocument();
		expect(screen.queryByRole('radio', { name: 'f(x) = x²' })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DerivativeFunctionExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定するとシーンが操作可能になり観察が現れる (初期値: f(x)=x^2, a=1)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		expect(screen.getByTestId('scene-interactive')).toHaveTextContent('true');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		// f(x)=x^2, a=1: f(a)=1, f'(a)=2*1=2
		expect(rowValue(/^f\(a\)/)).toBe('1');
		expect(rowValue(/^微分係数/)).toBe('2');
	});

	it('予想確定後、フォーカスが新出現する a スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '接点 a の位置(スライダー)' })).toHaveFocus();
	});

	it('f\'(a) と差分商の一致が実行時検証され、「一致」が表示される (断言せず検証してから表示)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/差分商.*近似値.*と一致しています/)).toBeInTheDocument();
		expect(rowValue(/^差\(/)).toBe('≈ 0');
	});

	it('a を動かしても f(a)・f\'(a) が数学モデル通りに更新される (a=2: f(a)=4, f\'(a)=4)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		const aSlider = screen.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		fireEvent.change(aSlider, { target: { value: '2' } });

		expect(rowValue(/^f\(a\)/)).toBe('4');
		expect(rowValue(/^微分係数/)).toBe('4');
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' });
		fireEvent.change(numberA, { target: { value: '2' } });
		fireEvent.blur(numberA);

		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '1.' } });
		expect(numberA.value).toBe('1.');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1'); // 確定前は初期値のまま

		fireEvent.change(numberA, { target: { value: '' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1');
		expect(numberA.value).toBe('1');
	});

	it('ドラッグ (scene→state) が数値入力へ反映される (単一状態の証明、a=2 に clamp)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		// スタブのドラッグは 10 を渡す → x^2 の可動域 [-2, 2] で clamp され 2 になる
		await user.click(screen.getByTestId('drag-a-10'));

		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' }) as HTMLInputElement;
		expect(numberA.value).toBe('2');
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
	});

	it('可動域の両端 (a=aMin, a=aMax) でも例外がレンダーに漏れない (境界入力の網羅)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		const aSlider = screen.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		expect(() => fireEvent.change(aSlider, { target: { value: '-2' } })).not.toThrow();
		expect(screen.getByTestId('scene-a')).toHaveTextContent('-2');
		expect(() => fireEvent.change(aSlider, { target: { value: '2' } })).not.toThrow();
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');
	});

	it('関数を x^3 に切り替えると、シーンへ渡す係数と観察テーブルが切り替わる (f(x)=x^3, a=1: f(a)=1, f\'(a)=3)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: 'f(x) = x³' }));

		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('4'); // [0,0,0,1]
		expect(rowValue(/^f\(a\)/)).toBe('1');
		expect(rowValue(/^微分係数/)).toBe('3');
	});

	it('関数切替直後、切替前に範囲外だった a は新しい可動域へ再クランプされ例外が起きない (境界+切替の複合)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		// x^2 の可動域最大 (a=2) は x^3 の可動域 [-1.5, 1.5] の外。
		const aSlider = screen.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		fireEvent.change(aSlider, { target: { value: '2' } });
		expect(screen.getByTestId('scene-a')).toHaveTextContent('2');

		expect(() => {
			fireEvent.click(screen.getByRole('radio', { name: 'f(x) = x³' }));
		}).not.toThrow();

		// 1.5 に再クランプされ、観察テーブルもクラッシュせず新しい値を表示する。
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1.5');
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('x³ の可動域上端 (a=1.5) でも実行時検証が偽陰性にならず「一致」が表示される (GrokBuild C1 回帰: 誤差上界が差分商の評価点 a+h を覆う)', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: 'f(x) = x³' }));
		const aSlider = screen.getByRole('slider', { name: '接点 a の位置(スライダー)' });
		fireEvent.change(aSlider, { target: { value: '1.5' } });
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1.5');

		// 修正前は上界が [aMin, aMax] で取られており、a=aMax では剰余の評価点 ξ∈(a, a+h) が
		// 域外に出て |secant−f'(a)| が上界を僅かに超え、正しいモデルに警告が出ていた。
		expect(screen.getByText(/差分商.*近似値.*と一致しています/)).toBeInTheDocument();
	});

	it('リセットで初期値 (f(x)=x^2, a=1) に戻る', async () => {
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: 'f(x) = x³' }));
		const numberA = screen.getByRole('textbox', { name: '接点 a の位置' });
		fireEvent.change(numberA, { target: { value: '-1' } });
		fireEvent.blur(numberA);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('-1');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('3'); // x^2 に戻る
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DerivativeFunctionExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});

// ADR-006 M9d: URL パラメータでの初期状態固定(一斉提示モード、パイロット3単元の1つ)。
describe('DerivativeFunctionExperiment: URL プリセット (ADR-006 M9d)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		window.history.pushState({}, '', '/');
	});

	it('?fn=cube&a=1 で予想確定後の初期状態が f(x)=x³, a=1 になる', async () => {
		window.history.pushState({}, '', '/?fn=cube&a=1');
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('4'); // [0,0,0,1] = x³
		expect(rowValue(/^f\(a\)/)).toBe('1');
		expect(rowValue(/^微分係数/)).toBe('3'); // f'(x)=3x², a=1
	});

	it('?fn=cube の可動域に合わせて ?a= がクランプされる(x³の上限1.5を超える2は1.5へ)', async () => {
		window.history.pushState({}, '', '/?fn=cube&a=2');
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByTestId('scene-a')).toHaveTextContent('1.5');
	});

	it('不正な ?fn=quartic は既定値(square)へ黙ってフォールバックする(console.error なし)', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		window.history.pushState({}, '', '/?fn=quartic');
		const user = userEvent.setup();
		render(<DerivativeFunctionExperiment />);
		await enterExperiment(user);
		expect(screen.getByTestId('scene-coeffs-length')).toHaveTextContent('3'); // [0,0,1] = x²
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('プリセットが指定されていても予想ゲートは表示されたままで、確定前は観察パネルが出ない(迂回不可)', () => {
		window.history.pushState({}, '', '/?fn=cube&a=1');
		render(<DerivativeFunctionExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});
});
