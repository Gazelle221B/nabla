import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// GraphScene は SVG を直接描画するだけの薄い層(Mafs のようなブラウザ API 依存がないため
// CombinatoricsEnumerationScene と同様にスタブ化せず、実コンポーネントのまま結合テストする。
// これにより、辺のクリック・キーボード操作という中核のインタラクションを実際に検証できる。
import { GraphTheoryExperiment } from '../GraphTheoryExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: 'できる' }));
	await user.click(screen.getByRole('radio', { name: 'できない' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('GraphTheoryExperiment (M8)', () => {
	beforeEach(() => {
		// 各テストで DOM を独立させる (RTL の自動クリーンアップに任せるが念のため明示)。
	});

	it('操作前は予想を要求し、観察パネル・プリセット切替・辺トグルを隠す', () => {
		render(<GraphTheoryExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryAllByRole('switch')).toHaveLength(0);
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<GraphTheoryExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('Sceneは予想ゲートの前から常時マウントされる(ケーニヒスベルクの図)', () => {
		render(<GraphTheoryExperiment />);
		expect(screen.getByRole('img', { name: /グラフの図/ })).toBeInTheDocument();
	});

	it('予想確定すると観察が現れ、初期状態(ケーニヒスベルク・全7辺ON)で奇数次数4・判定「不可能」になる(手計算・再検算済み)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['7']);
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['4']);
		expect(rowCells(/^頂点ごとの次数/)).toEqual(['A:5(奇)、B:3(奇)、C:3(奇)、D:3(奇)']);
		expect(rowCells(/^判定: 一筆書き/)).toEqual(['不可能']);
	});

	it('予想確定後、フォーカスが新出現するプリセット選択の最初のラジオへ移る(bodyに落ちない)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('radio', { name: /ケーニヒスベルクの橋/ })).toHaveFocus();
	});

	it('橋(辺)を1本OFFにすると奇数次数が4→2に変わり、判定が「不可能」→「可能(出発点には戻れない)」に変わる(クリック操作)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		// 辺 A-D (index 4, 多重辺でない唯一の A-D 辺) をOFFにする。
		const bridgeAD = screen.getByRole('switch', { name: /^辺 A-D/ });
		await user.click(bridgeAD);

		expect(bridgeAD).toHaveAttribute('aria-checked', 'false');
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['6']);
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['2']);
		expect(rowCells(/^判定: 一筆書き/)).toEqual(['可能(出発点には戻れない)']);
	});

	it('キーボード操作(Enter)でも辺をトグルできる', async () => {
		render(<GraphTheoryExperiment />);
		const user = userEvent.setup();
		await enterExperiment(user);

		const bridgeAD = screen.getByRole('switch', { name: /^辺 A-D/ });
		bridgeAD.focus();
		fireEvent.keyDown(bridgeAD, { key: 'Enter' });

		expect(bridgeAD).toHaveAttribute('aria-checked', 'false');
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['2']);

		// スペースキーで再度ONに戻せる。
		fireEvent.keyDown(bridgeAD, { key: ' ' });
		expect(bridgeAD).toHaveAttribute('aria-checked', 'true');
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['4']);
	});

	it('判定式(hasEulerPath)と構成的アルゴリズム(findEulerPath)の実行時交差検証が「一致しています」と表示される', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/一致しています/)).toBeInTheDocument();
	});

	it('動的性質(田の字): 全12辺ONで奇数次数4・判定「不可能」(手計算・再検算済み)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: /田の字/ }));
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['12']);
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['4']);
		expect(rowCells(/^判定: 一筆書き/)).toEqual(['不可能']);
	});

	it('動的性質(封筒(開)): 全8辺ONで奇数次数2・判定「可能(出発点には戻れない)」(手計算・再検算済み)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: /封筒/ }));
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['8']);
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['2']);
		expect(rowCells(/^判定: 一筆書き/)).toEqual(['可能(出発点には戻れない)']);
	});

	it('動的性質(五芒星): 全5辺ONで奇数次数0・判定「可能(出発点に戻れる)」(手計算・再検算済み)', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: /五芒星/ }));
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['5']);
		expect(rowCells(/^奇数次数の頂点数/)).toEqual(['0']);
		expect(rowCells(/^判定: 一筆書き/)).toEqual(['可能(出発点に戻れる)']);
	});

	it('プリセットを切り替えると辺がすべてONの状態にリセットされる', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		const bridgeAD = screen.getByRole('switch', { name: /^辺 A-D/ });
		await user.click(bridgeAD);
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['6']);

		await user.click(screen.getByRole('radio', { name: /五芒星/ }));
		await user.click(screen.getByRole('radio', { name: /ケーニヒスベルクの橋/ }));
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['7']);
	});

	it('リセットボタンでケーニヒスベルク・全辺ONに戻る', async () => {
		const user = userEvent.setup();
		render(<GraphTheoryExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: /五芒星/ }));
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['5']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByRole('radio', { name: /ケーニヒスベルクの橋/ })).toBeChecked();
		expect(rowCells(/^ONになっている辺の本数/)).toEqual(['7']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<GraphTheoryExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('次数の偶奇の色・ラベルは予想ゲート確定後のみ現れる(操作前は「偶」「奇」のテキストが無い)', () => {
		render(<GraphTheoryExperiment />);
		expect(screen.queryByText(/次数\d+\)/)).not.toBeInTheDocument();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<GraphTheoryExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
