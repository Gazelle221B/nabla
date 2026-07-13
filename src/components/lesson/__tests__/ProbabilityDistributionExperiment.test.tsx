import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (DataAnalysisExperiment.test.tsx と同じ方針)。
vi.mock('../../scenes/mafs/ProbabilityDistributionScene.js', () => ({
	ProbabilityDistributionScene: (props: {
		values: readonly number[];
		probs: readonly number[];
		expectedValue: number;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-values">{JSON.stringify(props.values)}</span>
			<span data-testid="scene-probs">{JSON.stringify(props.probs)}</span>
			<span data-testid="scene-expected">{String(props.expectedValue)}</span>
		</div>
	),
}));

import { ProbabilityDistributionExperiment } from '../ProbabilityDistributionExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '回数を増やしても、そのつど大きくばらつき続け、特定の値には近づかない' }));
	await user.click(screen.getByRole('radio', { name: '回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('ProbabilityDistributionExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作UIを隠す', () => {
		render(<ProbabilityDistributionExperiment />);
		expect(screen.queryByRole('heading', { name: '観察: 確率分布表' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('1等の賞金額(円)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<ProbabilityDistributionExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされる', () => {
		render(<ProbabilityDistributionExperiment />);
		expect(screen.getByTestId('scene')).toBeInTheDocument();
	});

	it(
		'予想を確定すると観察が現れ、初期値(1等300円×1本・2等100円×2本・はずれ0円×3本)の' +
			'確率分布・期待値・標本平均(seed=42, n=10)が正しく計算される',
		async () => {
			const user = userEvent.setup();
			render(<ProbabilityDistributionExperiment />);
			await enterExperiment(user);

			expect(screen.getByRole('heading', { name: '観察: 確率分布表' })).toBeInTheDocument();
			// 手計算(再検算済み): probs = [1/6, 2/6, 3/6] ≈ [0.17, 0.33, 0.5]
			expect(rowCells(/^1等/)).toEqual(['300', '1', '0.17']);
			expect(rowCells(/^2等/)).toEqual(['100', '2', '0.33']);
			expect(rowCells(/^はずれ/)).toEqual(['0', '3', '0.5']);
			expect(rowCells(/^合計/)).toEqual(['—', '6', '1']);

			// 黄金値(手計算・再検算済み): E[X] = (300×1+100×2+0×3)/6 = 500/6 ≈ 83.33
			expect(rowCells(/^期待値 E\[X\]/)).toEqual(['83.33']);
			// 標本平均(seed=42, n=10 の実測、再検算済み): 40
			expect(rowCells(/^標本平均/)).toEqual(['40']);
			expect(rowCells(/^差/)).toEqual(['-43.33']);
		},
	);

	it('予想確定後、フォーカスが新出現する1等の賞金額スライダーへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '1等の賞金額(スライダー)' })).toHaveFocus();
	});

	it('期待値の2経路一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('よくある誤解の検証: 初期状態では最頻値(0円、はずれ)と期待値(83.33円)が一致しないことが示される', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/現在、最も本数が多いのは0円ですが、期待値は83.33円です/)).toBeInTheDocument();
	});

	it('1等の賞金額を変えると期待値が動く(動的性質: 300→600で E[X] が83.33→133.33へ変化)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const sliderPrize1 = screen.getByRole('slider', { name: '1等の賞金額(スライダー)' });
		fireEvent.change(sliderPrize1, { target: { value: '600' } });

		// 手計算(再検算済み): E[X] = (600×1+100×2+0×3)/6 = 800/6 ≈ 133.33
		expect(rowCells(/^期待値 E\[X\]/)).toEqual(['133.33']);
		expect(rowCells(/^1等/)).toEqual(['600', '1', '0.17']);
	});

	it('はずれの本数を変えると期待値が動く(動的性質: 3→6本で E[X] が83.33→55.56へ変化)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const sliderCount3 = screen.getByRole('slider', { name: 'はずれの本数(スライダー)' });
		fireEvent.change(sliderCount3, { target: { value: '6' } });

		// 手計算(再検算済み): 総本数=1+2+6=9, E[X] = (300×1+100×2+0×6)/9 = 500/9 ≈ 55.56
		expect(rowCells(/^期待値 E\[X\]/)).toEqual(['55.56']);
		expect(rowCells(/^合計/)).toEqual(['—', '9', '1']);
	});

	it('1等の本数を0にする境界(1等の確率が0になる)でも例外なく再計算される', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const sliderCount1 = screen.getByRole('slider', { name: '1等の本数(スライダー)' });
		expect(() => fireEvent.change(sliderCount1, { target: { value: '0' } })).not.toThrow();

		// 手計算(再検算済み): 総本数=0+2+3=5, E[X] = (300×0+100×2+0×3)/5 = 200/5 = 40
		expect(rowCells(/^1等/)).toEqual(['300', '0', '0']);
		expect(rowCells(/^期待値 E\[X\]/)).toEqual(['40']);
	});

	it('リセットで初期値(1等300円×1本・2等100円×2本・はずれ0円×3本、期待値83.33円)に戻る', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const sliderPrize1 = screen.getByRole('slider', { name: '1等の賞金額(スライダー)' });
		fireEvent.change(sliderPrize1, { target: { value: '999' } });
		expect(rowCells(/^期待値 E\[X\]/)).not.toEqual(['83.33']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^1等/)).toEqual(['300', '1', '0.17']);
		expect(rowCells(/^期待値 E\[X\]/)).toEqual(['83.33']);
	});

	it('数値入力 → 確定(blur) → 状態 → 観察表 へ同期する(1等の賞金額)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const numberPrize1 = screen.getByRole('textbox', { name: '1等の賞金額(円)' });
		fireEvent.change(numberPrize1, { target: { value: '500' } });
		fireEvent.blur(numberPrize1);

		expect(rowCells(/^1等/)).toEqual(['500', '1', '0.17']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const numberPrize1 = screen.getByRole('textbox', { name: '1等の賞金額(円)' }) as HTMLInputElement;
		fireEvent.change(numberPrize1, { target: { value: '' } });
		expect(numberPrize1.value).toBe('');
		expect(rowCells(/^1等/)).toEqual(['300', '1', '0.17']); // 確定前は初期値のまま

		fireEvent.blur(numberPrize1);
		expect(rowCells(/^1等/)).toEqual(['300', '1', '0.17']);
		expect(numberPrize1.value).toBe('300');
	});

	it('可動域の外の数値入力はクランプされ例外なし(賞金額9999→999、はずれ本数0→1、n=999999→6000)', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const numberPrize1 = screen.getByRole('textbox', { name: '1等の賞金額(円)' });
		fireEvent.change(numberPrize1, { target: { value: '9999' } });
		expect(() => fireEvent.blur(numberPrize1)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '1等の賞金額(円)' })).toHaveValue('999');

		const numberCount3 = screen.getByRole('textbox', { name: 'はずれ(0円)の本数' });
		fireEvent.change(numberCount3, { target: { value: '0' } });
		expect(() => fireEvent.blur(numberCount3)).not.toThrow();
		expect(screen.getByRole('textbox', { name: 'はずれ(0円)の本数' })).toHaveValue('1');

		const numberN = screen.getByRole('textbox', { name: '試行回数 n(何回引くか)' });
		fireEvent.change(numberN, { target: { value: '999999' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '試行回数 n(何回引くか)' })).toHaveValue('6000');
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<ProbabilityDistributionExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});

	it('「引き直す」ボタンでシードが変わり、同じ n でも標本平均が変わりうる', async () => {
		const user = userEvent.setup();
		render(<ProbabilityDistributionExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		sliderN.focus();
		fireEvent.change(sliderN, { target: { value: '1000' } }); // n を大きくして振り直しの差を見やすくする

		const before = rowCells(/^標本平均/);
		await user.click(screen.getByRole('button', { name: '引き直す' }));
		const after = rowCells(/^標本平均/);
		expect(before).not.toEqual(after);
	});
});
