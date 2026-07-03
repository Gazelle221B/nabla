import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// globals:false のため Testing Library の自動クリーンアップが登録されない。
// テスト間で DOM を破棄し、レンダリングの積み残し (要素の重複検出) を防ぐ。
afterEach(() => {
	cleanup();
});
