import { afterEach, describe, expect, it } from 'vitest';
import { PREDICTION_RADIO_SELECTOR, SUBMIT_BUTTON_TEXT, getUnitSlug } from '../predictionContract.js';

// predictionContract.ts(GA4計測=coreLoopObserver.ts と予想履歴=predictionHistoryRecorder.ts の
// 両方が依拠する中立モジュール、独立レビュー指摘 2026-07-24)の単体テスト。
// 契約の値そのものを固定し、どちらか一方のモジュールだけがこっそり異なる値を参照する
// (=契約のドリフト)ことを防ぐ。

describe('predictionContract(GA4計測・予想履歴が共有する構造契約)', () => {
	afterEach(() => {
		window.history.pushState({}, '', '/');
	});

	it('PREDICTION_RADIO_SELECTOR は name が "-prediction" で終わるラジオにマッチする', () => {
		document.body.innerHTML = `
			<input type="radio" name="foo-prediction" value="a" />
			<input type="radio" name="foo-other" value="b" />
		`;
		const matches = document.querySelectorAll(PREDICTION_RADIO_SELECTOR);
		expect(matches).toHaveLength(1);
		expect((matches[0] as HTMLInputElement).name).toBe('foo-prediction');
		document.body.innerHTML = '';
	});

	it('SUBMIT_BUTTON_TEXT は全32単元共通の確定ボタン文言と一致する', () => {
		expect(SUBMIT_BUTTON_TEXT).toBe('予想を確定して実験する');
	});

	it('getUnitSlug は /lessons/{slug}/ から slug を取り出す', () => {
		window.history.pushState({}, '', '/lessons/trigonometric-ratios/');
		expect(getUnitSlug()).toBe('trigonometric-ratios');
	});

	it('getUnitSlug は単元ページ以外では null を返す', () => {
		window.history.pushState({}, '', '/map/');
		expect(getUnitSlug()).toBeNull();
	});
});
