import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
	// React コンポーネントテストの .tsx を変換する (tsconfig は Astro 向けに jsx=preserve のため
	// vitest 側で明示的に React 変換プラグインを入れる)。
	plugins: [react()],
	test: {
		// jsdom: React コンポーネントの結合テスト (状態同期) 用。
		// lib/math の純粋テストも jsdom 上で問題なく動く。
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
	},
});
