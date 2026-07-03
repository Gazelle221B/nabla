import { defineConfig, devices } from '@playwright/test';

// GitHub Pagesサブパス公開(astro.config.mjs の base: '/nabla')を反映したE2Eスモーク設定。
// 現時点で記事は無いため、既存ページ(トップページ)への到達性とアクセシビリティのみを検証する
// (docs/IMPLEMENTATION_PLAN.md T5-1: 過剰実装しない)。
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4321/nabla/',
		trace: 'on-first-retry',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// CIでは.github/workflows/ci.ymlが直前に`npm run build`を実行済みのため、
		// 二重ビルドを避けてpreviewのみ起動する。ローカルでは毎回build+previewする。
		command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
		url: 'http://localhost:4321/nabla/',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
