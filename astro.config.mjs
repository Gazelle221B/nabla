// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { unified } from '@astrojs/markdown-remark';

// GitHub Pagesはプロジェクトページ(サブパス公開)になる想定:
// https://gazelle221b.github.io/nabla/
// site/baseの設定を誤るとリンク・画像が壊れる(docs/DESIGN.md 既知のリスク)。
// https://docs.astro.build/en/guides/deploy/github/
export default defineConfig({
	site: 'https://gazelle221b.github.io',
	base: '/nabla',
	// trailingSlashを固定し、import.meta.env.BASE_URL が常に末尾スラッシュ付きになることを保証する
	// (生HTMLでのアセット参照は `${import.meta.env.BASE_URL}foo` の形で組み立てる)。
	trailingSlash: 'always',
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
	},
	integrations: [react(), mdx()],
});
