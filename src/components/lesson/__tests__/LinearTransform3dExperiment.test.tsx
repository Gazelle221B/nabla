import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Three.js シーンはブラウザ API(WebGL 等)に依存し jsdom で動かないため、状態同期の結合テスト
// ではシーンをスタブに差し替える(CltScene と同じ方針、ADR-005 §4: RTL は Scene をスタブする)。
vi.mock('../../scenes/three/LinearTransform3dScene.js', () => ({
	LinearTransform3dScene: (props: {
		matrix: readonly [
			readonly [number, number, number],
			readonly [number, number, number],
			readonly [number, number, number],
		];
		revealVolumeLabel: boolean;
	}) => (
		<div data-testid="scene">
			<span data-testid="scene-matrix">{JSON.stringify(props.matrix)}</span>
			<span data-testid="scene-reveal">{String(props.revealVolumeLabel)}</span>
		</div>
	),
}));

import { LinearTransform3dExperiment } from '../LinearTransform3dExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '行列の成分によって決まった倍率になる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('LinearTransform3dExperiment (MVP3, Tier 3a/Three.js)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・スライダーを隠す(ゲート前は体積ラベルも非表示)', () => {
		render(<LinearTransform3dExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/成分 a\(1行1列\)/)).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('false');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<LinearTransform3dExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れ、体積ラベルのゲートも解ける(初期値 det=2, 体積=2)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^行列式/)).toEqual(['2']);
		expect(rowCells(/^三重積による符号つき体積/)).toEqual(['2']);
		expect(rowCells(/^体積拡大率/)).toEqual(['2']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
		expect(screen.getByTestId('scene-reveal')).toHaveTextContent('true');
	});

	it('予想確定後、フォーカスが新出現する成分 a のスライダーへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: /成分 a\(1行1列\)\(スライダー\)/ })).toHaveFocus();
	});

	it('行列式と三重積による体積の一致が実行時検証され、一致していれば「一致しています」が表示される', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/結果が一致しています/)).toBeInTheDocument();
	});

	it('対角プリセット(2,1,0.5)に切り替えると det=1・体積拡大率=1・向き=保持になる(既知例)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /対角行列 diag\(2, 1, 0\.5\)/ }));

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(rowCells(/^体積拡大率/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('z軸まわり45°回転プリセットに切り替えると det=1(体積・向きを保つ)になる(既知例)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /z軸まわり45°回転/ }));

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('鏡映プリセットに切り替えると det=-1・向き=反転になり、例外なく安全に表示される', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鏡映/ }));

		expect(rowCells(/^行列式/)).toEqual(['-1']);
		expect(rowCells(/^体積拡大率/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['反転']);
		expect(screen.getByText(/向きが反転しています/)).toBeInTheDocument();
	});

	it('退化プリセット(ランク2)に切り替えると det=0 になり、向きは「定義されません」と安全表示される', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /退化/ }));

		expect(rowCells(/^行列式/)).toEqual(['0']);
		expect(rowCells(/^向き/)).toEqual(['定義されません(退化)']);
		expect(screen.getByText(/空間が平面/)).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('せん断プリセットに切り替えると det=1 になる(既知例、形は歪むが体積は保存される)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /せん断/ }));

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(rowCells(/^向き/)).toEqual(['保持']);
	});

	it('数値入力 → 確定(blur)→ 状態 → シーン へ同期する(成分 a)', async () => {
		render(<LinearTransform3dExperiment />);
		const user = userEvent.setup();
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a(1行1列)' });
		fireEvent.change(numberA, { target: { value: '-2' } });
		fireEvent.blur(numberA);

		expect(rowCells(/^行列式/)).toEqual(['-2']);
		expect(screen.getByTestId('scene-matrix')).toHaveTextContent('[[-2,1,0],[0,1,0],[0,0,1]]');
	});

	it('対角成分の数値入力欄はスライダーの可動域([-2,2])を超えて指定できる(転用問題1: diag(3,2,1)→det=6)', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /対角行列 diag\(2, 1, 0\.5\)/ }));

		const numberA = screen.getByRole('textbox', { name: '成分 a(1行1列)' });
		fireEvent.change(numberA, { target: { value: '3' } });
		fireEvent.blur(numberA);
		const numberE = screen.getByRole('textbox', { name: '成分 e(2行2列)' });
		fireEvent.change(numberE, { target: { value: '2' } });
		fireEvent.blur(numberE);
		const numberI = screen.getByRole('textbox', { name: '成分 i(3行3列)' });
		fireEvent.change(numberI, { target: { value: '1' } });
		fireEvent.blur(numberI);

		expect(rowCells(/^行列式/)).toEqual(['6']);
		expect(rowCells(/^体積拡大率/)).toEqual(['6']);
	});

	it('編集途中の文字列は破壊されず、確定まで数値stateは変わらない', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a(1行1列)' }) as HTMLInputElement;
		fireEvent.change(numberA, { target: { value: '' } });
		expect(numberA.value).toBe('');
		expect(rowCells(/^行列式/)).toEqual(['2']); // 確定前は初期値のまま

		fireEvent.blur(numberA);
		expect(rowCells(/^行列式/)).toEqual(['2']); // 空入力の確定は現在値を維持
		expect(numberA.value).toBe('2');
	});

	it('可動域の外(999・-999)を入力しても例外なくクランプされる(数値入力欄は[-6,6])', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		const numberA = screen.getByRole('textbox', { name: '成分 a(1行1列)' });

		fireEvent.change(numberA, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '成分 a(1行1列)' })).toHaveValue('6');

		fireEvent.change(numberA, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberA)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '成分 a(1行1列)' })).toHaveValue('-6');
	});

	it('その他6成分(オフ対角)も数値入力で操作でき、行列式に反映される', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		// 初期値(a=2,b=1,c=0,d=0,e=1,f=0,g=0,h=0,i=1)で成分 g を1にすると
		// det = a(ei-fh) - b(di-fg) + c(dh-eg) = 2*(1-0) - 1*(0-0) + 0*(0-1) = 2 のまま変わらない
		// (g は3行1列で余因子展開の c の項にしか影響せず、cはここでは0なので det は不変)。
		// 代わりに成分 c を1に変えると det = 2*1 - 1*0 + 1*(0-0) = 2 のままだが、g=1,c=0 のときは
		// c の項が0のため無関係。ここでは成分 b を0にして det の変化を確認する
		// (det = 2*1 - 0*0 + 0 = 2 → 変化なしは検証にならないため、成分 d を1に変更する:
		// det = 2*(1*1-0*0) - 1*(1*1-0*0) + 0 = 2 - 1 = 1)。
		const numberD = screen.getByRole('textbox', { name: '成分 d(2行1列)' });
		fireEvent.change(numberD, { target: { value: '1' } });
		fireEvent.blur(numberD);

		expect(rowCells(/^行列式/)).toEqual(['1']);
		expect(screen.getByTestId('scene-matrix')).toHaveTextContent('[[2,1,0],[1,1,0],[0,0,1]]');
	});

	it('リセットで初期値(det=2)に戻る', async () => {
		const user = userEvent.setup();
		render(<LinearTransform3dExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('button', { name: /鏡映/ }));
		expect(rowCells(/^行列式/)).toEqual(['-1']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^行列式/)).toEqual(['2']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<LinearTransform3dExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<LinearTransform3dExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
