import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// globals:false のため Testing Library の自動クリーンアップが登録されない。
// テスト間で DOM を破棄し、レンダリングの積み残し (要素の重複検出) を防ぐ。
afterEach(() => {
	cleanup();
});

// M9c(ADR-006、予想履歴のlocalStorage実装)向けの環境フォールバック:
// Node.js の新しいバージョン(v22以降、experimental webstorage)は `--localstorage-file` の
// 指定なしだと globalThis.localStorage を「メソッドを一切持たない壊れたスタブ」として
// 提供する。この環境では jsdom の window (テスト実行時は globalThis と同一)がその壊れた
// グローバルをそのまま引き継いでしまい、getItem/setItem/removeItem/clear が全く使えない
// (実ブラウザ・Playwright実行のe2eには存在しない、Node起動時のみの問題)。
// 壊れている場合(clear が関数でない場合)のみ、最小限の実装のlocalStorageポリフィルに
// 差し替える(本物のブラウザ実装が正しく動く環境では何もしない、フィーチャー検出方式)。
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
	class MemoryStorage implements Storage {
		#store = new Map<string, string>();

		get length(): number {
			return this.#store.size;
		}

		clear(): void {
			this.#store.clear();
		}

		getItem(key: string): string | null {
			return this.#store.has(key) ? this.#store.get(key)! : null;
		}

		key(index: number): string | null {
			return Array.from(this.#store.keys())[index] ?? null;
		}

		removeItem(key: string): void {
			this.#store.delete(key);
		}

		setItem(key: string, value: string): void {
			this.#store.set(key, String(value));
		}
	}

	const polyfill = new MemoryStorage();
	Object.defineProperty(globalThis, 'localStorage', {
		value: polyfill,
		configurable: true,
		writable: true,
	});
}
