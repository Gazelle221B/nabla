import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CombinatoricsExperiment } from '../CombinatoricsExperiment.js';

function row(name: RegExp | string) {
	return screen.getByRole('row', { name });
}

function rowCell(name: RegExp | string): string {
	return within(row(name)).getByRole('cell').textContent ?? '';
}

async function enterExperiment(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('radio', { name: '「並べる」(順列)の方が多くなる' }));
	await user.click(screen.getByRole('button', { name: '予想を確定して実験する' }));
}

describe('CombinatoricsExperiment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('操作前は予想を要求し、観察パネル・n/r のスライダーを隠す', () => {
		render(<CombinatoricsExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('人数(全体の数) n')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('予想を選んで');
	});

	it('予想を選ばないと確定ボタンは押せない', () => {
		render(<CombinatoricsExperiment />);
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});

	it('予想を確定すると観察が現れる(初期値 n=4, r=2 → nPr=12, nCr=6, r!=2)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		expect(screen.getByRole('heading', { name: '観察' })).toBeInTheDocument();
		expect(rowCell(/^全体の数 n/)).toBe('4');
		expect(rowCell(/^選ぶ数 r/)).toBe('2');
		expect(rowCell(/^順列 nPr/)).toBe('12');
		expect(rowCell(/^組合せ nCr/)).toBe('6');
		expect(rowCell(/^r!/)).toBe('2');
		expect(rowCell(/^比 nPr/)).toBe('2');
		expect(rowCell(/^列挙した順列の個数/)).toBe('12');
		expect(rowCell(/^列挙した組合せの個数/)).toBe('6');
	});

	it('予想確定後、フォーカスが新出現する n スライダーへ移る(body に落ちない)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);
		expect(screen.getByRole('slider', { name: '人数(全体の数) n(スライダー)' })).toHaveFocus();
	});

	it('列挙数===公式値の実行時検証、および nPr=nCr×r! の関係検証が「一致しています」と表示される', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		expect(
			screen.getByText(/列挙した個数.*は、公式で求めた nPr\(12\)・nCr\(6\)とそれぞれ一致しています/),
		).toBeInTheDocument();
		expect(screen.getByText(/nPr\(12\)は nCr\(6\)× r!\(2\)に一致しています/)).toBeInTheDocument();
	});

	it('n のスライダーを動かすと nPr・nCr・列挙数が例外なく更新される(n=6, r=2 → nPr=30, nCr=15)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const sliderN = screen.getByRole('slider', { name: '人数(全体の数) n(スライダー)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '6' } })).not.toThrow();

		expect(rowCell(/^全体の数 n/)).toBe('6');
		expect(rowCell(/^順列 nPr/)).toBe('30');
		expect(rowCell(/^組合せ nCr/)).toBe('15');
	});

	it('r のスライダーを r=n(現在の n)まで動かすと nCr=1, nPr=n! になる(境界 r=n)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const sliderR = screen.getByRole('slider', { name: '選ぶ人数 r(スライダー)' });
		fireEvent.change(sliderR, { target: { value: '4' } }); // n=4 のまま r=n

		expect(rowCell(/^選ぶ数 r/)).toBe('4');
		expect(rowCell(/^組合せ nCr/)).toBe('1');
		expect(rowCell(/^順列 nPr/)).toBe('24'); // 4! = 24
	});

	it('n を減らすと、r>新しい n だった場合に r が自動的に再クランプされ、例外が起きない(n↓時の再クランプ)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		// まず r=4 まで上げる (n=4 のまま r=n)。
		const sliderR = screen.getByRole('slider', { name: '選ぶ人数 r(スライダー)' });
		fireEvent.change(sliderR, { target: { value: '4' } });
		expect(rowCell(/^選ぶ数 r/)).toBe('4');

		// n を 2 まで下げる → r は新しい n=2 を超えられないので再クランプされて 2 になる。
		const sliderN = screen.getByRole('slider', { name: '人数(全体の数) n(スライダー)' });
		expect(() => fireEvent.change(sliderN, { target: { value: '2' } })).not.toThrow();

		expect(rowCell(/^全体の数 n/)).toBe('2');
		expect(rowCell(/^選ぶ数 r/)).toBe('2');
		expect(rowCell(/^組合せ nCr/)).toBe('1');
		expect(rowCell(/^順列 nPr/)).toBe('2');
	});

	it('数値入力 → 確定(blur)→ 状態へ同期する(n=5, r=3 の既知例 → nPr=60, nCr=10)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '人数(全体の数) n' });
		fireEvent.change(numberN, { target: { value: '5' } });
		fireEvent.blur(numberN);

		const numberR = screen.getByRole('textbox', { name: '選ぶ人数 r' });
		fireEvent.change(numberR, { target: { value: '3' } });
		fireEvent.blur(numberR);

		expect(rowCell(/^順列 nPr/)).toBe('60');
		expect(rowCell(/^組合せ nCr/)).toBe('10');
	});

	it('編集途中の文字列は破壊されず、確定まで数値 state は変わらない', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '人数(全体の数) n' }) as HTMLInputElement;
		fireEvent.change(numberN, { target: { value: '' } });
		expect(numberN.value).toBe('');
		expect(rowCell(/^全体の数 n/)).toBe('4'); // 確定前は初期値のまま

		fireEvent.blur(numberN);
		expect(numberN.value).toBe('4');
	});

	it('r の数値入力に 0 以下を入れても確定時に 1 へクランプされ例外なし(境界 r=0)', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const numberR = screen.getByRole('textbox', { name: '選ぶ人数 r' }) as HTMLInputElement;
		fireEvent.change(numberR, { target: { value: '0' } });
		expect(() => fireEvent.blur(numberR)).not.toThrow();
		expect(numberR.value).toBe('1');
		expect(rowCell(/^選ぶ数 r/)).toBe('1');
		expect(rowCell(/^順列 nPr/)).toBe('4');
		expect(rowCell(/^組合せ nCr/)).toBe('4');
	});

	it('n の数値入力に範囲外の値を入れても確定時にクランプされ例外なし', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '人数(全体の数) n' }) as HTMLInputElement;

		fireEvent.change(numberN, { target: { value: '99' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('6');

		fireEvent.change(numberN, { target: { value: '-5' } });
		expect(() => fireEvent.blur(numberN)).not.toThrow();
		expect(numberN.value).toBe('2');
	});

	it('表示切替(組合せ)で列挙リストの見出しが選び方の件数に切り替わる', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		await user.click(screen.getByRole('radio', { name: '選び方(組合せ)を列挙' }));
		expect(screen.getByText('選び方(組合せ)の一覧: 6 通り')).toBeInTheDocument();

		await user.click(screen.getByRole('radio', { name: '並べ方(順列)を列挙' }));
		expect(screen.getByText('並べ方(順列)の一覧: 12 通り')).toBeInTheDocument();
	});

	it('リセットで初期値(n=4, r=2, 順列表示)に戻る', async () => {
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);

		const numberN = screen.getByRole('textbox', { name: '人数(全体の数) n' });
		fireEvent.change(numberN, { target: { value: '6' } });
		fireEvent.blur(numberN);
		await user.click(screen.getByRole('radio', { name: '選び方(組合せ)を列挙' }));
		expect(rowCell(/^全体の数 n/)).toBe('6');

		await user.click(screen.getByRole('button', { name: 'リセット' }));
		expect(rowCell(/^全体の数 n/)).toBe('4');
		expect(rowCell(/^選ぶ数 r/)).toBe('2');
		expect(screen.getByText('並べ方(順列)の一覧: 12 通り')).toBeInTheDocument();
	});

	it('観察パネルは aria-live を持ち、値の変化を支援技術へ通知する', async () => {
		const user = userEvent.setup();
		const { container } = render(<CombinatoricsExperiment />);
		await enterExperiment(user);
		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});

	it('JS 無効フォールバックの <noscript> 要素を持つ', () => {
		const { container } = render(<CombinatoricsExperiment />);
		expect(container.querySelector('noscript')).toBeTruthy();
	});
});

// ADR-006 M9d: URL パラメータでの初期状態固定(一斉提示モード、パイロット3単元の1つ)。
describe('CombinatoricsExperiment: URL プリセット (ADR-006 M9d)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		window.history.pushState({}, '', '/');
	});

	it('?n=5&r=3 で予想確定後の初期値が n=5, r=3 になる', async () => {
		window.history.pushState({}, '', '/?n=5&r=3');
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);
		expect(rowCell(/^全体の数 n/)).toBe('5');
		expect(rowCell(/^選ぶ数 r/)).toBe('3');
	});

	it('現在の n を超える ?r= は n へクランプされる(n=3, r=6 → r=3)', async () => {
		window.history.pushState({}, '', '/?n=3&r=6');
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);
		expect(rowCell(/^全体の数 n/)).toBe('3');
		expect(rowCell(/^選ぶ数 r/)).toBe('3');
	});

	it('不正な ?n=abc は既定値(4)へ黙ってフォールバックする(console.error なし)', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		window.history.pushState({}, '', '/?n=abc');
		const user = userEvent.setup();
		render(<CombinatoricsExperiment />);
		await enterExperiment(user);
		expect(rowCell(/^全体の数 n/)).toBe('4');
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('プリセットが指定されていても予想ゲートは表示されたままで、確定前は観察パネルが出ない(迂回不可)', () => {
		window.history.pushState({}, '', '/?n=5&r=3');
		render(<CombinatoricsExperiment />);
		expect(screen.queryByRole('heading', { name: '観察' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '予想を確定して実験する' })).toBeDisabled();
	});
});
