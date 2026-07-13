import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Canvas2D シーンはブラウザ API(HTMLCanvasElement#getContext, requestAnimationFrame の実描画)に
// 依存し jsdom で不安定なため、状態同期の結合テストではシーンをスタブに差し替える
// (FourierSeriesExperiment.test.tsx / M8 と同じ方針)。
vi.mock('../../scenes/canvas/MandelbrotScene.js', () => ({
	MandelbrotScene: (props: {
		view: { centerX: number; centerY: number; halfWidth: number };
		maxIter: number;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-center-x">{String(props.view.centerX)}</span>
			<span data-testid="scene-center-y">{String(props.view.centerY)}</span>
			<span data-testid="scene-half-width">{String(props.view.halfWidth)}</span>
			<span data-testid="scene-max-iter">{String(props.maxIter)}</span>
		</div>
	),
}));

import { MandelbrotExperiment } from '../MandelbrotExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '同じような複雑な形が現れ続ける' }));
	await user.click(screen.getByRole('radio', { name: 'ぼやけて何も見えなくなる' }));
	await user.click(screen.getByRole('radio', { name: '同じような複雑な形が現れ続ける' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('MandelbrotExperiment (MVP 2)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・ズームボタンを隠す', () => {
		render(<MandelbrotExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /ズームイン/ })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<MandelbrotExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Scene は予想ゲートの前から常時マウントされ、初期値(中心 -0.5,0・halfWidth 1.5・maxIter 100)が渡る', () => {
		render(<MandelbrotExperiment />);
		expect(screen.getByTestId('scene')).toBeInTheDocument();
		expect(screen.getByTestId('scene-center-x')).toHaveTextContent('-0.5');
		expect(screen.getByTestId('scene-center-y')).toHaveTextContent('0');
		expect(screen.getByTestId('scene-half-width')).toHaveTextContent('1.5');
		expect(screen.getByTestId('scene-max-iter')).toHaveTextContent('100');
	});

	it('予想を確定すると観察が現れ、初期プローブ c=0 は escapeTime=maxIter(留まる)で交差検証が一致状態になる', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^プローブの escapeTime/)).toEqual(['100(最大反復回数まで留まる)']);
		expect(rowCells(/^プローブは主カージオイド内部か/)).toEqual(['はい']);
		expect(screen.getByText(/閉形式.*と反復計算.*は一致しています/)).toBeInTheDocument();
	});

	it('プローブを c=1 に変更すると escapeTime=3 で脱出し、どちらの閉形式領域にも該当しないため中立ステータスになる(node 再検算済み: 0→1→2→5 で3回目に脱出)', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		const probeCx = screen.getByRole('textbox', { name: 'プローブの x 座標(cx)' });
		fireEvent.change(probeCx, { target: { value: '1' } });
		fireEvent.blur(probeCx);

		expect(rowCells(/^プローブ座標/)).toEqual(['(1.000, 0.000)']) // GrokBuild 指摘反映: プローブ表示はズーム連動桁(初期ズームでは3桁);
		expect(rowCells(/^プローブの escapeTime/)).toEqual(['3(この回数で脱出)']);
		expect(rowCells(/^プローブは主カージオイド内部か/)).toEqual(['いいえ']);
		expect(rowCells(/^プローブは周期2バルブ内部か/)).toEqual(['いいえ']);
		expect(
			screen.getByText(/どちらの閉形式判定にも該当しません/),
		).toBeInTheDocument();
	});

	it('ズームインすると拡大率が1倍→2倍(10^0.3)に更新され、Sceneへ渡るhalfWidthも半分になる', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		expect(rowCells(/^拡大率/)).toEqual(['1倍(10^0.0)']);
		await user.click(screen.getByRole('button', { name: /ズームイン/ }));
		expect(rowCells(/^拡大率/)).toEqual(['2倍(10^0.3)']);
		expect(screen.getByTestId('scene-half-width')).toHaveTextContent('0.75');
	});

	it('パン操作で表示中心が移動する(右へパンで centerX が増える)', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		const before = screen.getByTestId('scene-center-x').textContent;
		await user.click(screen.getByRole('button', { name: '右へパン' }));
		const after = screen.getByTestId('scene-center-x').textContent;
		expect(Number(after)).toBeGreaterThan(Number(before));
	});

	it('リセットでズーム・パン・maxIter・プローブがすべて初期値に戻る', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /ズームイン/ }));
		await user.click(screen.getByRole('button', { name: '右へパン' }));
		const probeCx = screen.getByRole('textbox', { name: 'プローブの x 座標(cx)' });
		fireEvent.change(probeCx, { target: { value: '0.3' } });
		fireEvent.blur(probeCx);
		expect(rowCells(/^拡大率/)).not.toEqual(['1倍(10^0.0)']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^拡大率/)).toEqual(['1倍(10^0.0)']);
		expect(rowCells(/^プローブ座標/)).toEqual(['(0.000, 0.000)']);
	});

	it('最大反復回数の数値入力 → 確定(blur) → 観察表とSceneへ同期する', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		const numberMaxIter = screen.getByRole('textbox', { name: '最大反復回数' });
		fireEvent.change(numberMaxIter, { target: { value: '200' } });
		fireEvent.blur(numberMaxIter);

		expect(rowCells(/^最大反復回数/)).toEqual(['200']);
		expect(screen.getByTestId('scene-max-iter')).toHaveTextContent('200');
	});

	it('可動域の外・刻みからずれた最大反復回数はクランプ・丸めされ例外なし(600→500、10→50)', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);

		const numberMaxIter = screen.getByRole('textbox', { name: '最大反復回数' });
		fireEvent.change(numberMaxIter, { target: { value: '600' } });
		expect(() => fireEvent.blur(numberMaxIter)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '最大反復回数' })).toHaveValue('500');

		fireEvent.change(numberMaxIter, { target: { value: '10' } });
		expect(() => fireEvent.blur(numberMaxIter)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '最大反復回数' })).toHaveValue('50');
	});

	it('予想確定後、フォーカスが新出現する最大反復回数のスライダーへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '最大反復回数(スライダー)' })).toHaveFocus();
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<MandelbrotExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<MandelbrotExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});

	it('予想と結果: 正しい予想(複雑さが現れ続ける)を選ぶと的中メッセージが出る', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await enterExperiment(user);
		expect(screen.getByText('その通りです。')).toBeInTheDocument();
	});

	it('予想と結果: 誤った予想(滑らかになる)を選ぶと訂正メッセージが出る', async () => {
		const user = userEvent.setup();
		render(<MandelbrotExperiment />);
		await user.click(screen.getByRole('radio', { name: 'だんだん滑らかな線に見えてくる' }));
		await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
		expect(screen.getByText(/同じような複雑な形.*現れ続けます/)).toBeInTheDocument();
	});
});
