import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (SimilarityExperiment.test.tsx /
// InscribedAngleExperiment.test.tsx と同じ方針)。LawOfSinesCosinesScene にはドラッグ可能な
// 点はないため、スタブは受け取った props をそのまま表示するだけでよい。
vi.mock('../../scenes/mafs/LawOfSinesCosinesScene.js', () => ({
	LawOfSinesCosinesScene: (props: {
		vertexA: readonly [number, number];
		vertexB: readonly [number, number];
		vertexC: readonly [number, number];
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-b-x">{props.vertexB[0]}</span>
			<span data-testid="scene-c-y">{props.vertexC[1]}</span>
		</div>
	),
}));

import { LawOfSinesCosinesExperiment } from '../LawOfSinesCosinesExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowValue(name: RegExp | string): string {
	return within(row(name)).getAllByRole('cell')[0].textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '3つとも等しい値になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('LawOfSinesCosinesExperiment (M5)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネルを表示しない', () => {
		render(<LawOfSinesCosinesExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('角 A(度)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<LawOfSinesCosinesExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 角A=90°, b=3, c=4: 辺a=5, 角B≈36.87, 角C≈53.13, 比=5/5/5, 余弦定理=5/5)', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowValue(/^辺 a/)).toBe('5');
		expect(rowValue(/^辺 b/)).toBe('3');
		expect(rowValue(/^辺 c/)).toBe('4');
		expect(rowValue(/^角 A/)).toBe('90');
		expect(rowValue(/^角 B/)).toBe('36.87');
		expect(rowValue(/^角 C/)).toBe('53.13');
		expect(rowValue(/^a÷sinA/)).toBe('5 / 5 / 5');
		expect(rowValue(/^余弦定理/)).toBe('5 / 5');
	});

	it('予想確定後、フォーカスが新出現する角Aスライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '角 A(度)(スライダー)' })).toHaveFocus();
	});

	it('数値入力 → 確定 (blur) → 状態 → シーン へ同期する', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '辺 b = CA の長さ' });
		fireEvent.change(numberB, { target: { value: '5' } });
		fireEvent.blur(numberB);

		expect(rowValue(/^辺 b/)).toBe('5');
		expect(screen.getByTestId('scene-c-y').textContent).not.toBe('');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '辺 b = CA の長さ' }) as HTMLInputElement;
		fireEvent.change(numberB, { target: { value: '5.' } });
		expect(numberB.value).toBe('5.');
		expect(rowValue(/^辺 b/)).toBe('3'); // 確定前は初期値のまま

		fireEvent.change(numberB, { target: { value: '' } });
		fireEvent.blur(numberB);
		expect(rowValue(/^辺 b/)).toBe('3');
		expect(numberB.value).toBe('3');
	});

	it('角 A の数値入力は範囲外(下限未満)を確定時に下限(0)へ clamp する', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberAngleA = screen.getByRole('textbox', { name: '角 A(度)' });
		fireEvent.change(numberAngleA, { target: { value: '-30' } });
		fireEvent.blur(numberAngleA);

		expect(rowValue(/^角 A/)).toBe('0');
	});

	it('角 A の数値入力は範囲外(上限超過)を確定時に上限(180)へ clamp する', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberAngleA = screen.getByRole('textbox', { name: '角 A(度)' });
		fireEvent.change(numberAngleA, { target: { value: '999' } });
		fireEvent.blur(numberAngleA);

		expect(rowValue(/^角 A/)).toBe('180');
	});

	it('辺 b の数値入力は範囲外(下限未満・上限超過)を確定時に clamp する', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberB = screen.getByRole('textbox', { name: '辺 b = CA の長さ' });
		fireEvent.change(numberB, { target: { value: '0.1' } });
		fireEvent.blur(numberB);
		expect(rowValue(/^辺 b/)).toBe('1');

		fireEvent.change(numberB, { target: { value: '999' } });
		fireEvent.blur(numberB);
		expect(rowValue(/^辺 b/)).toBe('8');
	});

	it('リセットで初期値 (角A=90, b=3, c=4) に戻る', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberAngleA = screen.getByRole('textbox', { name: '角 A(度)' });
		fireEvent.change(numberAngleA, { target: { value: '45' } });
		fireEvent.blur(numberAngleA);
		expect(rowValue(/^角 A/)).toBe('45');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowValue(/^角 A/)).toBe('90');
		expect(rowValue(/^辺 b/)).toBe('3');
		expect(rowValue(/^辺 c/)).toBe('4');
	});

	it('観察パネルは「正弦定理の比が一致」の成立を実行時検証して表示する(断言しない)', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/はすべて 5 で一致しています/)).toBeInTheDocument();
	});

	it('観察パネルは余弦定理の成立も実行時検証して表示する(断言しない)', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/実際の頂点間の距離.*と一致しています/)).toBeInTheDocument();
	});

	it('角 A を 0 度(退化・共線)にすると、比は安全に「定義されません」と表示されクラッシュしない', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberAngleA = screen.getByRole('textbox', { name: '角 A(度)' });
		fireEvent.change(numberAngleA, { target: { value: '0' } });
		fireEvent.blur(numberAngleA);

		expect(rowValue(/^a÷sinA/)).toBe('定義されません');
		expect(screen.getByText(/三角形が一直線に潰れているため/)).toBeInTheDocument();
		// 余弦定理は除算を伴わないため、退化時も安全に有効な値のまま(b=3,c=4,角A=0° → a=|3-4|=1)。
		expect(rowValue(/^辺 a/)).toBe('1');
		expect(rowValue(/^余弦定理/)).toBe('1 / 1');
	});

	it('角 A を 180 度(退化・共線)にしても比が安全に「定義されません」と表示されクラッシュしない', async () => {
		const user = userEvent.setup();
		render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);

		const numberAngleA = screen.getByRole('textbox', { name: '角 A(度)' });
		fireEvent.change(numberAngleA, { target: { value: '180' } });
		fireEvent.blur(numberAngleA);

		expect(rowValue(/^a÷sinA/)).toBe('定義されません');
		// b=3,c=4,角A=180° → a=3+4=7 (余弦定理は除算がなく退化時も有効)。
		expect(rowValue(/^辺 a/)).toBe('7');
		expect(rowValue(/^余弦定理/)).toBe('7 / 7');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<LawOfSinesCosinesExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<LawOfSinesCosinesExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
