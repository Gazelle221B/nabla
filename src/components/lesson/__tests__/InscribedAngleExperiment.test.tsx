import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (SimilarityExperiment.test.tsx と
// 同じ方針)。InscribedAngleScene にはドラッグ可能な点も interactive フラグもないため
// (設計判断: 操作対象は点 P の角度 θ のみ、InscribedAngleScene.tsx 参照)、スタブは受け取った
// props をそのまま表示するだけでよい。
vi.mock('../../scenes/mafs/InscribedAngleScene.js', () => ({
	InscribedAngleScene: (props: {
		center: readonly [number, number];
		radius: number;
		a: readonly [number, number];
		b: readonly [number, number];
		p: readonly [number, number];
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-p-x">{props.p[0]}</span>
			<span data-testid="scene-p-y">{props.p[1]}</span>
		</div>
	),
}));

import { InscribedAngleExperiment } from '../InscribedAngleExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '変わらない' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('InscribedAngleExperiment (M5)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルを表示しない', () => {
		render(<InscribedAngleExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('点 P の角度 θ(度)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<InscribedAngleExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 θ=330°: 円周角=60°, 中心角=120°, 比=0.5)', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowValue(/^点 P の角度 θ/)).toBe('330');
		expect(rowValue(/^円周角 ∠APB/)).toBe('60');
		expect(rowValue(/^中心角 ∠AOB/)).toBe('120');
		expect(rowValue(/^円周角 ÷ 中心角/)).toBe('0.5');
	});

	it('予想確定後、フォーカスが新出現する θ スライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '点 P の角度 θ(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する。P を大きく動かしても円周角は変わらない(同じ弧に対する円周角は等しい)', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '点 P の角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '250' } });
		fireEvent.blur(numberTheta);

		expect(rowValue(/^点 P の角度 θ/)).toBe('250');
		// P の位置(角度)は変わったが、優弧上にある限り円周角は変わらない。
		expect(rowValue(/^円周角 ∠APB/)).toBe('60');
		expect(rowValue(/^中心角 ∠AOB/)).toBe('120');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '点 P の角度 θ(度)' }) as HTMLInputElement;
		fireEvent.change(numberTheta, { target: { value: '25.' } });
		expect(numberTheta.value).toBe('25.');
		expect(rowValue(/^点 P の角度 θ/)).toBe('330'); // 確定前は初期値のまま

		fireEvent.change(numberTheta, { target: { value: '' } });
		fireEvent.blur(numberTheta);
		expect(rowValue(/^点 P の角度 θ/)).toBe('330');
		expect(numberTheta.value).toBe('330');
	});

	it('θ の数値入力は範囲外(下限未満)を確定時に下限(215)へ clamp する', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '点 P の角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '10' } });
		fireEvent.blur(numberTheta);

		expect(rowValue(/^点 P の角度 θ/)).toBe('215');
	});

	it('θ の数値入力は範囲外(上限超過)を確定時に上限(445)へ clamp する', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '点 P の角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '999' } });
		fireEvent.blur(numberTheta);

		expect(rowValue(/^点 P の角度 θ/)).toBe('445');
		// 上限でも優弧の内側にとどまるため円周角は変わらない。
		expect(rowValue(/^円周角 ∠APB/)).toBe('60');
	});

	it('リセットで初期値 (θ=330) に戻る', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		const numberTheta = screen.getByRole('textbox', { name: '点 P の角度 θ(度)' });
		fireEvent.change(numberTheta, { target: { value: '260' } });
		fireEvent.blur(numberTheta);
		expect(rowValue(/^点 P の角度 θ/)).toBe('260');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowValue(/^点 P の角度 θ/)).toBe('330');
	});

	it('観察パネルは「円周角は中心角の半分」の成立を実行時検証して表示する(断言しない)', async () => {
		const user = userEvent.setup();
		render(<InscribedAngleExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/ちょうど半分です/)).toBeInTheDocument();
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<InscribedAngleExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<InscribedAngleExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
