import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// CltScene は Pixi.js(WebGL)に依存し、jsdom には WebGL/Canvas の実装がなく不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える(ProbabilityDistributionExperiment.test.tsx
// が Mafs シーンをスタブ化する既存の方針と同じ)。computeTrialsPerDot は Pixi を import しない
// 別モジュール(dotDensity.ts)に切り出してあるため、この mock は pixi.js を一切読み込まない。
vi.mock('../../scenes/pixi/CltScene.js', () => ({
	CltScene: (props: {
		frequencies: readonly number[];
		k: number;
		exactProbabilities: readonly number[];
		mean: number;
		sigma: number;
		revealAnswer: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-k">{props.k}</span>
			<span data-testid="scene-mean">{props.mean}</span>
			<span data-testid="scene-sigma">{props.sigma}</span>
			<span data-testid="scene-reveal">{String(props.revealAnswer)}</span>
			<span data-testid="scene-freqs">{JSON.stringify(props.frequencies)}</span>
			<span data-testid="scene-exact-probs">{JSON.stringify(props.exactProbabilities)}</span>
		</div>
	),
}));

import { CltExperiment } from '../CltExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'でこぼこで、特に規則性はない' }));
	await user.click(screen.getByRole('radio', { name: '真ん中が高い山形(釣鐘のような形)になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('CltExperiment (MVP2, Tier2/Pixi)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・操作UIを隠す', () => {
		render(<CltExperiment />);
		expect(screen.queryByRole('heading', { name: '観察: 標本平均と正規近似' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('サイコロの個数 k(スライダー)')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<CltExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされる(k=1、一様分布の導入表示)', () => {
		render(<CltExperiment />);
		const scene = screen.getByTestId('scene');
		expect(scene).toBeInTheDocument();
		expect(screen.getByTestId('scene-k')).toHaveTextContent('1');
	});

	it('ゲート前は Scene への revealAnswer が false(正規曲線・厳密分布の輪郭は不可視)', () => {
		render(<CltExperiment />);
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('false');
	});

	it('予想確定後は Scene への revealAnswer が true になる(答えのオーバーレイが解禁される)', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('true');
	});

	it(
		'予想確定後、初期値(k=1, n=100, seed=42)の標本平均・期待値・理論標準偏差・' +
			'正規近似との最大偏差が正しく計算される(golden、再検算済み)',
		async () => {
			const user = userEvent.setup();
			render(<CltExperiment />);
			await enterExperiment(user);

			expect(screen.getByRole('heading', { name: '観察: 標本平均と正規近似' })).toBeInTheDocument();
			// k=1: 期待値3.5・分散35/12(標準偏差≈1.7078)。centralLimit.test.ts の golden と同じ値。
			expect(rowCells(/^期待値 3\.5k/)).toEqual(['3.5']);
			expect(rowCells(/^理論標準偏差/)).toEqual(['1.7078']);
			expect(rowCells(/^正規近似との最大偏差/)).toEqual(['0.1434']);
		},
	);

	it('期待値・分散の2経路一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);
		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('予想確定後、フォーカスが新出現するkのスライダーへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: 'サイコロの個数 k(スライダー)' })).toHaveFocus();
	});

	it('k を1→5に動かすと、正規近似との最大偏差が縮む(CLTの実測、centralLimit.tsのgolden値と整合)', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);

		expect(rowCells(/^正規近似との最大偏差/)).toEqual(['0.1434']); // k=1

		const sliderK = screen.getByRole('slider', { name: 'サイコロの個数 k(スライダー)' });
		fireEvent.change(sliderK, { target: { value: '5' } });

		// k=5 の golden 値(centralLimit.test.ts と同じ): 0.05245482369948007 → 表示は0.0525丸め。
		expect(rowCells(/^正規近似との最大偏差/)).toEqual(['0.0525']);
	});

	it('矢印キーで k のスライダーを操作すると観察表が更新される(キーボード操作)', async () => {
		// jsdom は range input のネイティブな矢印キー操作(ブラウザ実装)を再現しないため、
		// keyDown を発火してキーボード到達可能であることを示しつつ、実際の値変化は change で
		// 駆動する(TaylorApproximationExperiment.test.tsx と同じ既存の方針)。
		render(<CltExperiment />);
		const user = userEvent.setup();
		await enterExperiment(user);

		const sliderK = screen.getByRole('slider', { name: 'サイコロの個数 k(スライダー)' });
		sliderK.focus();
		fireEvent.keyDown(sliderK, { key: 'ArrowRight' });
		fireEvent.change(sliderK, { target: { value: '2' } });

		expect(screen.getByRole('textbox', { name: 'サイコロの個数 k' })).toHaveValue('2');
		expect(rowCells(/^期待値 3\.5k/)).toEqual(['7']);
	});

	it('n を数値入力で1000に変えると標本平均が golden 値通りに再計算される(大数の法則、決定的シード、回帰検出)', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '試行回数 n' });
		fireEvent.change(numberN, { target: { value: '1000' } });
		fireEvent.blur(numberN);

		// golden値(k=1, n=1000, seed=42、node/vitestで実測して固定): 標本平均=3.57。
		expect(rowCells(/^標本平均/)).toEqual(['3.57']);
	});

	it('data-hydrated 属性がマウント後に true になる(E2Eのハイドレーション確定待ち用)', () => {
		const { container } = render(<CltExperiment />);
		const section = container.querySelector('section');
		expect(section).toHaveAttribute('data-hydrated', 'true');
	});

	it('リセットで初期値(k=1, n=100, seed=42)に戻る', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);

		const sliderK = screen.getByRole('slider', { name: 'サイコロの個数 k(スライダー)' });
		fireEvent.change(sliderK, { target: { value: '9' } });
		expect(rowCells(/^期待値 3\.5k/)).not.toEqual(['3.5']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^期待値 3\.5k/)).toEqual(['3.5']);
	});

	it('可動域の外の数値入力はクランプされ例外なし(k=99→12, n=999999→50000)', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: 'サイコロの個数 k' });
		fireEvent.change(numberK, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberK)).not.toThrow();
		expect(screen.getByRole('textbox', { name: 'サイコロの個数 k' })).toHaveValue('12');

		const numberN = screen.getByRole('textbox', { name: '試行回数 n' });
		fireEvent.change(numberN, { target: { value: '999999' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '試行回数 n' })).toHaveValue('50000');
	});

	it('「振り直す」ボタンでシードが変わり、同じ n でも標本平均が変わりうる', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '試行回数 n(スライダー、対数目盛り)' });
		fireEvent.change(sliderN, { target: { value: '1000' } });

		const before = rowCells(/^標本平均/);
		await user.click(screen.getByRole('button', { name: '振り直す' }));
		const after = rowCells(/^標本平均/);
		expect(before).not.toEqual(after);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<CltExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<CltExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});

	it('よくある誤解の検証: k=2の時点で三角形へ変わることを説明文が明示する', async () => {
		const user = userEvent.setup();
		render(<CltExperiment />);
		await enterExperiment(user);
		expect(screen.getByText(/足すという操作そのものが、分布の形を/)).toBeInTheDocument();
	});
});
