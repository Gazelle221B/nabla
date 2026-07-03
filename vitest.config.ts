import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// e2e/ は Playwright(npm run test:e2e)専用。Vitestのデフォルトglobは
		// **/*.spec.ts にもマッチするため、明示的に除外する(T5-1でPlaywrightを
		// 導入した際にVitestと衝突することが判明)。
		exclude: [...configDefaults.exclude, 'e2e/**'],
	},
});
