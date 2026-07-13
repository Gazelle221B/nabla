import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Three.js シーンはブラウザ API(WebGL 等)に依存し jsdom で動かないため、状態同期の結合テスト
// ではシーンをスタブに差し替える(SurfacePartialScene の前例、ADR-005 §4)。
vi.mock('../../scenes/three/DomainColoringScene.js', () => ({
	DomainColoringScene: (props: {
		fnId: string;
		centerRe: number;
		centerIm: number;
		halfWidth: number;
		revealLegend: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-fnid">{props.fnId}</span>
			<span data-testid="scene-centerre">{props.centerRe}</span>
			<span data-testid="scene-centerim">{props.centerIm}</span>
			<span data-testid="scene-halfwidth">{props.halfWidth}</span>
			<span data-testid="scene-reveal">{String(props.revealLegend)}</span>
		</div>
	),
}));

import { DomainColoringExperiment } from '../DomainColoringExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '一部の情報なら2次元に描ける' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('DomainColoringExperiment (MVP3 最終, Tier 3a/Three.js ShaderMaterial)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・コントロールを隠す(ゲート前は凡例も非表示)', () => {
		render(<DomainColoringExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/プローブ z の実部/)).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('false');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<DomainColoringExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れ、凡例のゲートも解ける(golden: square のプローブ初期値(0.3,0.4)は巻き数0)', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('true');
		expect(rowCells(/^期待巻き数/)).toEqual(['0']);
		expect(rowCells(/^両経路の一致/)).toEqual(['一致']);
	});

	it('予想確定後、フォーカスが新出現する関数プリセットボタンへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('button', { name: /^2乗/ })).toHaveFocus();
	});

	it('golden: z=i での f(z)=z² は (-1, 0)、絶対値1・偏角180度', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		const inputRe = screen.getByLabelText(/プローブ z の実部/);
		const inputIm = screen.getByLabelText(/プローブ z の虚部/);
		fireEvent.change(inputRe, { target: { value: '0' } });
		fireEvent.blur(inputRe);
		fireEvent.change(inputIm, { target: { value: '1' } });
		fireEvent.blur(inputIm);

		expect(rowCells(/^f\(z\)/)).toEqual(['(-1, 0)']);
		expect(rowCells(/^\|f\(z\)\|/)).toEqual(['1']);
		expect(rowCells(/^arg\(f\(z\)\)/)).toEqual(['180']);
	});

	it('golden: square の原点プローブ(0,0)は巻き数2(零点の重複度2、既知の零点・極と数値巻き数が一致)', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		const inputRe = screen.getByLabelText(/プローブ z の実部/);
		const inputIm = screen.getByLabelText(/プローブ z の虚部/);
		fireEvent.change(inputRe, { target: { value: '0' } });
		fireEvent.blur(inputRe);
		fireEvent.change(inputIm, { target: { value: '0' } });
		fireEvent.blur(inputIm);

		expect(rowCells(/^期待巻き数/)).toEqual(['2']);
		const numericCell = rowCells(/^プローブを囲む小円/)[0];
		expect(Number(numericCell)).toBeCloseTo(2, 1);
		expect(rowCells(/^両経路の一致/)).toEqual(['一致']);
	});

	it('reciprocal プリセットに切り替え、原点プローブは未定義(極)・巻き数-1', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /逆数/ }));
		const inputRe = screen.getByLabelText(/プローブ z の実部/);
		const inputIm = screen.getByLabelText(/プローブ z の虚部/);
		fireEvent.change(inputRe, { target: { value: '0' } });
		fireEvent.blur(inputRe);
		fireEvent.change(inputIm, { target: { value: '0' } });
		fireEvent.blur(inputIm);

		expect(rowCells(/^f\(z\)/)).toEqual(['未定義(この点は極)']);
		expect(rowCells(/^期待巻き数/)).toEqual(['-1']);
		expect(screen.getByTestId('scene-fnid')).toHaveTextContent('reciprocal');
	});

	it('mobius プリセット: 零点(1,0)は巻き数+1、極(-1,0)は巻き数-1', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /メビウス変換/ }));
		const inputRe = screen.getByLabelText(/プローブ z の実部/);
		const inputIm = screen.getByLabelText(/プローブ z の虚部/);

		fireEvent.change(inputRe, { target: { value: '1' } });
		fireEvent.blur(inputRe);
		fireEvent.change(inputIm, { target: { value: '0' } });
		fireEvent.blur(inputIm);
		expect(rowCells(/^期待巻き数/)).toEqual(['1']);

		fireEvent.change(inputRe, { target: { value: '-1' } });
		fireEvent.blur(inputRe);
		expect(rowCells(/^期待巻き数/)).toEqual(['-1']);
	});

	it('ズームイン/アウト・パンボタンで表示領域(halfWidth・center)が変化する', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		const initialHalfWidth = screen.getByTestId('scene-halfwidth').textContent;
		await user.click(screen.getByRole('button', { name: 'ズームイン(拡大 ×2)' }));
		expect(screen.getByTestId('scene-halfwidth').textContent).not.toBe(initialHalfWidth);
		expect(Number(screen.getByTestId('scene-halfwidth').textContent)).toBeLessThan(
			Number(initialHalfWidth),
		);

		await user.click(screen.getByRole('button', { name: '右へパン' }));
		expect(Number(screen.getByTestId('scene-centerre').textContent)).toBeGreaterThan(0);
	});

	it('リセットで初期状態(square, プローブ(0.3,0.4))に戻る', async () => {
		const user = userEvent.setup();
		render(<DomainColoringExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /逆数/ }));
		await user.click(screen.getByRole('button', { name: 'ズームイン(拡大 ×2)' }));
		expect(screen.getByTestId('scene-fnid')).toHaveTextContent('reciprocal');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByTestId('scene-fnid')).toHaveTextContent('square');
		expect(rowCells(/^プローブ z/)).toEqual(['(0.3, 0.4)']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<DomainColoringExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<DomainColoringExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
