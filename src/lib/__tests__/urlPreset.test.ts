import { describe, expect, it, vi } from 'vitest';
import { getPresetSearchParams, readNumberPreset, readEnumPreset } from '../urlPreset.js';

describe('getPresetSearchParams', () => {
	it('window.location.search をパースして返す', () => {
		const original = window.location.search;
		window.history.pushState({}, '', '/?theta=45&fn=cube');
		const params = getPresetSearchParams();
		expect(params.get('theta')).toBe('45');
		expect(params.get('fn')).toBe('cube');
		window.history.pushState({}, '', `/${original}`);
	});

	it('クエリなしでは空の URLSearchParams を返す', () => {
		window.history.pushState({}, '', '/');
		const params = getPresetSearchParams();
		expect(params.get('theta')).toBeNull();
	});

	it('window が存在しない環境(SSR相当)では空の URLSearchParams を返す(例外なし)', () => {
		const originalWindow = globalThis.window;
		// @ts-expect-error -- SSR環境を模擬するため意図的にwindowを消す
		delete globalThis.window;
		expect(() => getPresetSearchParams()).not.toThrow();
		expect(getPresetSearchParams().toString()).toBe('');
		globalThis.window = originalWindow;
	});
});

describe('readNumberPreset', () => {
	const opts = { min: 0, max: 100, fallback: 42 };

	it('有効な数値パラメータを読み取る', () => {
		const params = new URLSearchParams('a=10');
		expect(readNumberPreset(params, 'a', opts)).toBe(10);
	});

	it('パラメータ欠落時は fallback を返す', () => {
		const params = new URLSearchParams('');
		expect(readNumberPreset(params, 'a', opts)).toBe(42);
	});

	it('非数値(文字列)は黙って fallback を返す(console エラーなし)', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const params = new URLSearchParams('a=abc');
		expect(readNumberPreset(params, 'a', opts)).toBe(42);
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('Infinity/NaN 相当の値は fallback を返す', () => {
		const params = new URLSearchParams('a=Infinity');
		expect(readNumberPreset(params, 'a', opts)).toBe(42);
	});

	it('範囲外の値は境界へクランプする(範囲内に収まり、例外を投げない)', () => {
		const params = new URLSearchParams('a=9999');
		expect(readNumberPreset(params, 'a', opts)).toBe(100);
		const paramsLow = new URLSearchParams('a=-50');
		expect(readNumberPreset(paramsLow, 'a', opts)).toBe(0);
	});

	it('空文字列パラメータ(?a=)は fallback を返す', () => {
		const params = new URLSearchParams('a=');
		expect(readNumberPreset(params, 'a', opts)).toBe(42);
	});
});

describe('readEnumPreset', () => {
	const allowed = ['square', 'cube'] as const;

	it('許可リスト内の値を読み取る', () => {
		const params = new URLSearchParams('fn=cube');
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('cube');
	});

	it('パラメータ欠落時は fallback を返す', () => {
		const params = new URLSearchParams('');
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('square');
	});

	it('許可リスト外の値は黙って fallback を返す(console エラーなし)', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const params = new URLSearchParams('fn=quartic');
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('square');
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	// 任意採用(Low、2026-07-24 コードレビュー指摘): 教師が URL を手打ちする際の表記ゆれに
	// 耐性を持たせる(前後空白・大文字小文字を無視する)。
	it('前後の空白を無視する', () => {
		const params = new URLSearchParams('fn=' + encodeURIComponent('  cube  '));
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('cube');
	});

	it('大文字・小文字を区別せず許可リストと突き合わせ、許可リスト側の正規表記を返す', () => {
		const params = new URLSearchParams('fn=CUBE');
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('cube');

		const paramsMixed = new URLSearchParams('fn=CuBe');
		expect(readEnumPreset(paramsMixed, 'fn', allowed, 'square')).toBe('cube');
	});

	it('空白のみの値は空文字列扱いとなり、許可リストに一致しなければ fallback を返す', () => {
		const params = new URLSearchParams('fn=' + encodeURIComponent('   '));
		expect(readEnumPreset(params, 'fn', allowed, 'square')).toBe('square');
	});
});
