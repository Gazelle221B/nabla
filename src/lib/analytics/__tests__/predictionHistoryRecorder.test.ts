import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPredictionHistoryRecorder } from '../predictionHistoryRecorder.js';
import { readPredictionHistory } from '../predictionHistory.js';

// 32単元共通の構造契約(docs/METRICS_PLAN.md §3、coreLoopObserver.ts と同じ規約)を模した
// 最小限の実験セクション DOM を組み立てる。既存 Island を実際にレンダリングせずとも、
// この構造契約さえ満たせば predictionHistoryRecorder は正しく動作するはず(構造契約への
// 依拠こそが「既存 Island 無変更」を成立させる設計そのものであるため)。
function appendExperimentFixture(): void {
	const section = document.createElement('section');
	section.setAttribute('aria-labelledby', 'fixture-exp-title');
	section.innerHTML = `
		<h2 id="fixture-exp-title">実験(フィクスチャ)</h2>
		<fieldset>
			<label>
				<input type="radio" name="fixture-prediction" value="a" />
				予想Aのラベルテキスト
			</label>
			<label>
				<input type="radio" name="fixture-prediction" value="b" />
				予想Bのラベルテキスト
			</label>
		</fieldset>
		<button type="button">予想を確定して実験する</button>
	`;
	document.body.appendChild(section);
}

describe('predictionHistoryRecorder(document委譲、ADR-006 M9c)', () => {
	let dispose: (() => void) | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		appendExperimentFixture();
	});

	afterEach(() => {
		dispose?.();
		dispose = null;
		document.body.innerHTML = '';
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it('単元ページ以外(URLに/lessons/{slug}/を含まない)では初期化が早期リターンする', () => {
		window.history.pushState({}, '', '/map/');
		dispose = initPredictionHistoryRecorder();
		expect(dispose).toBeNull();
	});

	it('予想を選んで確定ボタンを押すと、選択内容がlocalStorageに記録される', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		dispose = initPredictionHistoryRecorder();

		const radioA = document.querySelector<HTMLInputElement>('input[value="a"]')!;
		radioA.checked = true;
		radioA.dispatchEvent(new Event('change', { bubbles: true }));

		document.querySelector('button')!.click();

		const history = readPredictionHistory();
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '予想Aのラベルテキスト',
		});
		expect(typeof history[0]!.confirmedAt).toBe('string');
		expect(() => new Date(history[0]!.confirmedAt).toISOString()).not.toThrow();
	});

	it('選び直してから確定すると、直近の選択が記録される', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		dispose = initPredictionHistoryRecorder();

		const radioA = document.querySelector<HTMLInputElement>('input[value="a"]')!;
		const radioB = document.querySelector<HTMLInputElement>('input[value="b"]')!;
		radioA.checked = true;
		radioA.dispatchEvent(new Event('change', { bubbles: true }));
		radioA.checked = false;
		radioB.checked = true;
		radioB.dispatchEvent(new Event('change', { bubbles: true }));

		document.querySelector('button')!.click();

		const history = readPredictionHistory();
		expect(history).toHaveLength(1);
		expect(history[0]!.choiceValue).toBe('b');
	});

	it('何も選ばずに確定ボタンを押しても記録されない', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		dispose = initPredictionHistoryRecorder();

		document.querySelector('button')!.click();

		expect(readPredictionHistory()).toEqual([]);
	});

	it('確定ボタン以外(別のbutton・ラジオ自体)のクリックでは記録されない', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		const otherButton = document.createElement('button');
		otherButton.textContent = '別のボタン';
		document.body.appendChild(otherButton);

		dispose = initPredictionHistoryRecorder();

		const radioA = document.querySelector<HTMLInputElement>('input[value="a"]')!;
		radioA.checked = true;
		radioA.dispatchEvent(new Event('change', { bubbles: true }));
		otherButton.click();

		expect(readPredictionHistory()).toEqual([]);
	});

	it('記録が失敗する状況(localStorageが例外を投げる)でもクリック自体は例外を投げず、console.errorも出さない', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});

		dispose = initPredictionHistoryRecorder();
		const radioA = document.querySelector<HTMLInputElement>('input[value="a"]')!;
		radioA.checked = true;
		radioA.dispatchEvent(new Event('change', { bubbles: true }));

		expect(() => document.querySelector('button')!.click()).not.toThrow();
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		setItemSpy.mockRestore();
	});

	it('dispose()を呼ぶとイベントリスナーが解除され、以降の確定操作は記録されない', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		const disposeFn = initPredictionHistoryRecorder();
		disposeFn?.();

		const radioA = document.querySelector<HTMLInputElement>('input[value="a"]')!;
		radioA.checked = true;
		radioA.dispatchEvent(new Event('change', { bubbles: true }));
		document.querySelector('button')!.click();

		expect(readPredictionHistory()).toEqual([]);
	});
});
