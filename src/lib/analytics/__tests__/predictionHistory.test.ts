import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PREDICTION_HISTORY_STORAGE_KEY,
	appendPredictionRecord,
	clearPredictionHistory,
	readPredictionHistory,
	type PredictionRecord,
} from '../predictionHistory.js';

const SAMPLE: PredictionRecord = {
	unitSlug: 'trigonometric-ratios',
	choiceValue: 'decreases',
	choiceLabel: 'cos θ は 1 から 0 へ向かって減っていく',
	confirmedAt: '2026-07-24T00:00:00.000Z',
};

describe('predictionHistory(localStorage ストレージ層、ADR-006 M9c)', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it('初期状態は空配列', () => {
		expect(readPredictionHistory()).toEqual([]);
	});

	it('appendPredictionRecord で1件追記でき、readPredictionHistory で読める', () => {
		appendPredictionRecord(SAMPLE);
		expect(readPredictionHistory()).toEqual([SAMPLE]);
	});

	it('複数回追記すると記録順(古い→新しい)で蓄積される', () => {
		const second: PredictionRecord = { ...SAMPLE, unitSlug: 'derivative-function', confirmedAt: '2026-07-24T01:00:00.000Z' };
		appendPredictionRecord(SAMPLE);
		appendPredictionRecord(second);
		expect(readPredictionHistory()).toEqual([SAMPLE, second]);
	});

	it('clearPredictionHistory で全削除できる', () => {
		appendPredictionRecord(SAMPLE);
		clearPredictionHistory();
		expect(readPredictionHistory()).toEqual([]);
	});

	it('バージョン付きキー "nabla:predictions:v1" を使う', () => {
		appendPredictionRecord(SAMPLE);
		const raw = window.localStorage.getItem(PREDICTION_HISTORY_STORAGE_KEY);
		expect(raw).not.toBeNull();
		expect(JSON.parse(raw!)).toEqual([SAMPLE]);
	});

	it('壊れたJSONが保存されていても例外を投げず空配列にフォールバックする', () => {
		window.localStorage.setItem(PREDICTION_HISTORY_STORAGE_KEY, '{not valid json');
		expect(() => readPredictionHistory()).not.toThrow();
		expect(readPredictionHistory()).toEqual([]);
	});

	it('配列でない値が保存されていても空配列にフォールバックする', () => {
		window.localStorage.setItem(PREDICTION_HISTORY_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
		expect(readPredictionHistory()).toEqual([]);
	});

	it('想定外の形のレコードは読み飛ばす(部分的に壊れたデータでも他の正常なレコードは読める)', () => {
		window.localStorage.setItem(
			PREDICTION_HISTORY_STORAGE_KEY,
			JSON.stringify([SAMPLE, { unitSlug: 'broken' }, 42, null]),
		);
		expect(readPredictionHistory()).toEqual([SAMPLE]);
	});

	it('記録失敗(setItemが例外を投げる、容量超過・プライベートモードを模す)時は無言で機能停止する(例外を投げず、console.errorも出さない)', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});

		expect(() => appendPredictionRecord(SAMPLE)).not.toThrow();
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		setItemSpy.mockRestore();
	});

	it('読み取り失敗(getItemが例外を投げる、プライベートモードを模す)時も無言で空配列にフォールバックする', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('SecurityError');
		});

		expect(() => readPredictionHistory()).not.toThrow();
		expect(readPredictionHistory()).toEqual([]);
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		getItemSpy.mockRestore();
	});

	it('削除失敗(removeItemが例外を投げる)時も無言で機能停止する', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('SecurityError');
		});

		expect(() => clearPredictionHistory()).not.toThrow();
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		removeItemSpy.mockRestore();
	});
});
