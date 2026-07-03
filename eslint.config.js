// @ts-check
import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// 最小限の構成(過剰なルール追加はしない): 各ツールのrecommendedのみを適用する。
// 対象: TypeScript(.ts) + Astro(.astro)。docs/DEVELOPMENT.md の「テスト必須化」等の
// プロジェクト固有規約はコードコメントではなくレビュー/CIの別ゲートで担保する。
export default defineConfig(
	eslint.configs.recommended,
	tseslint.configs.recommended,
	eslintPluginAstro.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		ignores: ['dist/**', '.astro/**', 'node_modules/**'],
	},
);
