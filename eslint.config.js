// @ts-check
import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// 最小限の構成(過剰なルール追加はしない): 各ツールのrecommendedのみを適用する。
// 対象: TypeScript(.ts) + Astro(.astro)。docs/DEVELOPMENT.md の「テスト必須化」等の
// プロジェクト固有規約はコードコメントではなくレビュー/CIの別ゲートで担保する。
//
// globalsはファイル群で分離する(browser/nodeを全ファイル一括適用しない)。
// 一括適用するとブラウザで動くコードでのNodeグローバル誤用(逆もまた然り)を
// ESLintが検出できなくなるため。
export default defineConfig(
	eslint.configs.recommended,
	tseslint.configs.recommended,
	eslintPluginAstro.configs.recommended,
	{
		// ブラウザで実行されるコード(Astroページ/レイアウト、lib/math等の
		// クライアント側から読まれるモジュール)。テストファイルは対象外。
		files: ['src/**/*.{ts,tsx,astro}'],
		ignores: ['src/**/*.test.ts', 'src/**/__tests__/**'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	{
		// Node上で実行されるコード: ビルド設定・E2E(Playwright)・Vitestテスト
		// (vitest.config.tsの`environment: 'node'`と一致させる)。
		files: [
			'*.config.{js,mjs,ts}',
			'e2e/**/*.ts',
			'src/**/*.test.ts',
			'src/**/__tests__/**/*.ts',
		],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		ignores: ['dist/**', '.astro/**', 'node_modules/**'],
	},
);
