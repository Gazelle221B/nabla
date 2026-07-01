# LICENSES.md — ライセンス境界

> 出典・確定経緯: `docs/REQUIREMENTS.md` §制約・前提、`docs/DESIGN.md`。全文は `LICENSE`(要約)/ `LICENSE-CODE`(GPL-3.0-or-later)/ `LICENSE-CONTENT`(CC BY-SA 4.0)。

## ディレクトリ単位の適用

```text
src/content/**             CC BY-SA 4.0   # MDX記事本文・独自図版の説明
public/lesson-images/**    CC BY-SA 4.0   # 独自作成の画像・図版
src/components/**          GPL-3.0-or-later
src/lib/**                 GPL-3.0-or-later
scripts/**                 GPL-3.0-or-later
astro.config.mjs, *.config.*  GPL-3.0-or-later
```

判定に迷うファイル(例: コンポーネント内に埋め込まれた説明文字列)は、**そのファイルが主にコードかコンテンツかで判断**する。コード内の短いUI文言(ボタンラベル等)はGPL側、記事本文相当の長文はCC BY-SA側とみなす。迷う場合はIssueで確認する(DEVELOPMENT.md参照)。

## 第三者素材

| 種別 | ライセンス | 備考 |
|---|---|---|
| npm依存パッケージ(Astro, React, Mafs, KaTeX 等) | 各パッケージの `package.json` に記載のライセンスに従う | `npm ls --json` 等で定期確認。GPL-3.0-or-laterと非両立のライセンス(コピーレフト条件が衝突するもの)は導入前にADRで検討する |
| フォント | 採用時に個別記載(未選定) | OFL等のWebフォントライセンスを想定 |
| `@mathigon/euclid` / `@mathigon/fermat`(評価ゲート通過時のみ) | MIT | `docs/DESIGN.md` §検討した代替案を参照。採用時はここに追記する |

## なぜコードとコンテンツを分けるか

GPL-3.0はソフトウェア向けのコピーレフトライセンスであり、教材コンテンツ(文章・図版)にはCC BY-SA 4.0(表示+継承のもとで複製・改変・商用利用が可能)の方が適している。両ライセンスとも著作権者(制作者)自身が将来別条件で提供したり非公開版を作ったりすることは妨げないが、**一度公開・配布した版に付与された利用権を後から撤回することはできない**(`docs/REQUIREMENTS.md` §9)。

## 運用上の注意

- MVP期間中は外部コードPRを原則受け付けない(`CONTRIBUTING.md`)。これは、貢献者の著作権が個別に残ることで将来の再ライセンスが難しくなることを避けるための運用上の判断であり、ライセンス自体の制約ではない。
- 公開サイトのフッターに `Version: <commit>` / `Source: <対応する公開ソースURL>` / `License: GPL-3.0-or-later + CC BY-SA 4.0` を表示する(将来リポジトリを非公開化した場合でも、公開済みビルドに対応するソースへ到達可能にするため。`docs/REQUIREMENTS.md` §9)。
- 本ファイルはライセンス運用の要約であり法的助言ではない。正式公開前に商標検索を行う(サイト名「ナブラ」は仮称)。
