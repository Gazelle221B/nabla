import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mafs シーンはブラウザ API (ResizeObserver 等) に依存し jsdom で不安定なため、
// 状態同期の結合テストではシーンをスタブに差し替える (QuadraticEquationExperiment.test.tsx
// と同じ方針)。
vi.mock('../../scenes/mafs/CircleLineScene.js', () => ({
	CircleLineScene: (props: { p: number; q: number; r: number; m: number; k: number; interactive: boolean }) => (
		<div data-testid="scene">
			<span data-testid="scene-pqrmk">{JSON.stringify([props.p, props.q, props.r, props.m, props.k])}</span>
			<span data-testid="scene-interactive">{String(props.interactive)}</span>
		</div>
	),
}));

import { CircleLineExperiment } from '../CircleLineExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCells(name: RegExp | string): string[] {
	return within(row(name))
		.getAllByRole('cell')
		.map((cell) => cell.textContent ?? '');
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole('radio', {
			name: '直線を円に近づける(切片 k を小さくする)と、交点の個数は0個→1個→2個と増えていく',
		}),
	);
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('CircleLineExperiment (M8)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・スライダーを隠す', () => {
		render(<CircleLineExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('直線の切片 k')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<CircleLineExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる (初期値 m=0,k=2 → d=2, 交点0個)', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['2']);
		expect(rowCells(/^半径 r/)).toEqual(['1']);
		expect(rowCells(/^交点の個数/)).toEqual(['0個(交わらない)']);
		expect(rowCells(/^交点の座標/)).toEqual(['なし']);
	});

	it('予想確定後、フォーカスが新出現する k のスライダーへ移る (body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '直線の切片 k(スライダー)' })).toHaveFocus();
	});

	it('交点を円・直線の両方の方程式に代入すると0に戻ることが実行時検証され、確認メッセージが表示される', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		fireEvent.change(numberK, { target: { value: '0' } });
		fireEvent.blur(numberK);

		expect(screen.getByText(/確かに0に戻ることを確認しました/)).toBeInTheDocument();
	});

	it('k を1にすると d=r(接する)になり、交点1個・座標(0,1)が安全に表示される(境界で例外なし)', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		expect(() => fireEvent.change(numberK, { target: { value: '1' } })).not.toThrow();
		expect(() => fireEvent.blur(numberK)).not.toThrow();

		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['1']);
		expect(rowCells(/^交点の個数/)).toEqual(['1個(ちょうど接する)']);
		expect(rowCells(/^交点の座標/)).toEqual(['(0, 1)']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('k を0にすると d<r(交点2個)になり、座標(-1,0)・(1,0)が例外なく安全に表示される', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		fireEvent.change(numberK, { target: { value: '0' } });
		expect(() => fireEvent.blur(numberK)).not.toThrow();

		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['0']);
		expect(rowCells(/^交点の個数/)).toEqual(['2個(異なる2点で交わる)']);
		expect(rowCells(/^交点の座標/)).toEqual(['(-1, 0), (1, 0)']);
		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
	});

	it('円と交わらない(交点0個)ときは、代入して確かめる交点がない旨の中立な案内が表示される', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		expect(screen.getByText(/円と直線は交わらないため/)).toBeInTheDocument();
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' }) as HTMLInputElement;
		fireEvent.change(numberK, { target: { value: '' } });
		expect(numberK.value).toBe('');
		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['2']); // 確定前は初期値のまま

		fireEvent.blur(numberK);
		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['2']); // 空入力の確定は現在値(k=2)を維持
		expect(numberK.value).toBe('2');
	});

	it('可動域の外を入力しても例外なくクランプされる (k:[-3,3], m:[-2,2])', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		fireEvent.change(numberK, { target: { value: '999' } });
		expect(() => fireEvent.blur(numberK)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '直線の切片 k' })).toHaveValue('3');

		fireEvent.change(numberK, { target: { value: '-999' } });
		expect(() => fireEvent.blur(numberK)).not.toThrow();
		expect(screen.getByRole('textbox', { name: '直線の切片 k' })).toHaveValue('-3');

		const numberM = screen.getByRole('textbox', { name: '直線の傾き m' });
		fireEvent.change(numberM, { target: { value: '999' } });
		fireEvent.blur(numberM);
		expect(screen.getByRole('textbox', { name: '直線の傾き m' })).toHaveValue('2');
	});

	it('m≠0 では距離 d が |k| と一致しない(誤解「y切片比較で判定」の実験的反証を自動テストでも踏む、GrokBuild 指摘)', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		// m=2, k=3: d = |k|/√(m²+1) = 3/√5 ≈ 1.34(|k|=3 とは大きく異なる)。
		const numberM = screen.getByRole('textbox', { name: '直線の傾き m' });
		fireEvent.change(numberM, { target: { value: '2' } });
		fireEvent.blur(numberM);
		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		fireEvent.change(numberK, { target: { value: '3' } });
		fireEvent.blur(numberK);

		const dRow = screen.getByRole('row', { name: /中心から直線までの距離 d/ });
		expect(within(dRow).getByRole('cell').textContent).toBe('1.34');
	});

	it('リセットで初期値 (m=0,k=2) に戻る', async () => {
		const user = userEvent.setup();
		render(<CircleLineExperiment />);
		await enterExperiment(user);

		const numberK = screen.getByRole('textbox', { name: '直線の切片 k' });
		fireEvent.change(numberK, { target: { value: '0' } });
		fireEvent.blur(numberK);
		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['0']);

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCells(/^中心から直線までの距離 d/)).toEqual(['2']);
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<CircleLineExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<CircleLineExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});
