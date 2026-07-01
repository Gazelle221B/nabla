# MATH_CONVENTIONS.md — 数値計算・表示規約

> `lib/math/` および教材コンポーネント全体で共通して守る規約。目的は「内部計算値」と「読者へ表示する値」を混ぜないこと(`docs/DESIGN.md` §数学的正しさの検証規約 の前提)。この規約に反する実装はレビューで指摘対象とする。

## 1. 数値型と精度

- 内部計算は常に `number`(IEEE 754倍精度)を使う。任意精度演算・BigIntは導入しない(教材で扱う数値範囲では不要。必要になった場合はADRで検討)。
- **内部精度と表示丸めを分離する**。計算・不変条件判定は丸め前の値で行い、読者への表示のみ丸める。丸めた値を再度計算に使わない。

```typescript
// 良い例
const residual = pythagoreanResidual(rightAngle, pointA, pointB); // 丸めない
const displayValue = formatForDisplay(residual); // 表示専用

// 悪い例(丸めた値を判定に使う)
const rounded = Number(residual.toFixed(2));
if (rounded === 0) { /* ... */ } // 丸め誤差で意図しない分岐になりうる
```

## 2. 誤差比較(スケール相対誤差)

固定絶対誤差(`Math.abs(x) < 0.0001`等)は、値の大きさによって意味が変わるため使わない。**スケール相対誤差**を既定とする。

```typescript
export const EPSILON = 1e-9;

export function approximatelyZero(value: number, scale: number): boolean {
  return Math.abs(value) <= EPSILON * Math.max(1, scale);
}
// 使用例(三平方の残差判定):
// approximatelyZero(residual, legA2 + legB2 + hypotenuse2)
```

`scale` には、比較対象と同じ次元・オーダーの量(面積の残差なら面積の和、長さの残差なら長さの和)を渡す。`Math.max(1, scale)` により、scaleが0に近い退化ケースでも許容誤差が消失しない。

## 3. NaN / Infinity の扱い

- `lib/math` の公開関数は、**境界(UIからの入力)で** NaN/Infinity を弾く。関数内部では原則として受け付けない(事前条件違反として扱う)。
- 例外は「境界値テストとして意図的にNaN/Infinityを渡す」不変条件テストのみ。その場合、関数は例外を投げるか、明示的なセンチネル値(例: `{ valid: false }`)を返す——**サイレントにNaNを伝播させない**。
- ゼロ除算になりうる箇所(傾きの計算等)は、事前に分母がゼロに近いかを`approximatelyZero`で判定し、専用の分岐(例: 垂直な接線)を用意する。

## 4. ゼロ長・退化ケース

ゼロ長の辺・縮退した図形は「不正値」ではなく「退化例」として扱い、明示的にハンドリングする(例外を投げて処理を止めない)。三平方の定理であれば脚の長さ0は「点」に退化するため、UIの可動点制約(`useMovablePoint`)側で最小値を設ける(例: 最小0.1)。`lib/math`側は退化入力に対しても破綻せず有限値を返すことを不変条件テストで保証する。

## 5. 座標系・角度

- **座標系はx右・y上の標準的な数学の向き**を`lib/math`内で一貫させる。SVG/Canvas等の描画APIはy下向きが標準のため、**座標変換はレンダラー層(components/scenes/）でのみ行い**、`lib/math`はスクリーン座標を意識しない。
- **角度の内部単位はラジアン**で統一する。度(°)はUI表示・入力の境界でのみ変換する(`degreesToRadians`/`radiansToDegrees`をUI層に置く)。

## 6. 型表現

```typescript
export type Point2 = readonly [number, number];
export type Vector2 = readonly [number, number];
export type Matrix2x2 = readonly [readonly [number, number], readonly [number, number]];
```

タプル型+`readonly`を既定とする(コーディングスタイルのイミュータビリティ原則と一致)。オブジェクト型(`{x, y}`)は使わない——タプルはMafs等のライブラリとの相互変換コストが低く、分割代入がしやすい。

## 7. 負のゼロ(`-0`)

計算結果に`-0`が現れた場合、**表示直前で`0`に正規化**する。内部の比較・不変条件判定では`-0 === 0`はJavaScriptの仕様上trueなので通常問題ないが、`Object.is(x, -0)`や`1/x`の符号を使う判定(例: 極限の左右からの接近)がある場合は明示的に扱う。

```typescript
export function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
```

## 8. 教材表示の小数桁数

既定は**小数第2位**(`toFixed(2)`相当)。ただし、値がその桁数で「ちょうど0」に見えてしまい、実際には微小な非ゼロ値である場合(例: 浮動小数点誤差)、UIは「≈0」等の近似記号を使うか、内部的に`approximatelyZero`で真にゼロと判定した場合のみ`0`と表示する。桁数を単元ごとに変える場合はfrontmatterまたはコンポーネントpropsで明示し、暗黙のデフォルト変更をしない。

## 9. 色が表す数学的意味(デザイントークン、`docs/DESIGN.md` §3b1b風デザイン要件と対応)

サイト全体でトークンの意味を統一する。**記事ごとに同じトークンが違う意味(ある記事で赤=入力、別記事で赤=誤り)を持つことを禁止する**(meeting.mdの指摘: 意味の一貫性が理解を妨げないための必須事項)。

| トークン | 数学的・UI的意味 |
|---|---|
| `background` / `surface` | 背景(ダーク基調)。数学的意味は持たない |
| `text-primary` / `text-secondary` | 本文・補足説明。数学的意味は持たない |
| `grid` / `axis` | 座標系の構造(グリッド線・座標軸)。常に控えめな色で、データそのものと混同されないようにする |
| `accent-primary` | **読者が操作する/変化する量**(可動点、スライダーで動かす変数)を表す。「入力」の役割は常にこの色 |
| `accent-secondary` | **参照・固定される量**(比較対象、変化しない基準線)を表す |
| `success` | 予想が的中した/不変条件が成立していることの視覚的フィードバック |
| `warning` | 予想と結果の矛盾(黄金パターンの核心)、または不正な操作状態 |
| `focus-ring` | キーボードフォーカスの可視化(アクセシビリティ要件) |

`success`/`warning`は正誤判定のみに使い、「誤り」の意味で`accent-primary`/`accent-secondary`を流用しない(操作対象の色と正誤フィードバックの色を混同させないため)。

## 10. 数学的真実と表示上の便宜の分離(固有値計算の例)

`docs/DESIGN.md` §API/インターフェース境界 で定義した三分割を、本規約の実例として再掲する。

```typescript
computeEigenSystem(matrix)              // 数学的結果(丸めない)
classifyEigenSystem(result)             // 教材上の状態分類(4状態)
stabilizeEigenvectorDirection(current, previous) // 表示上の符号連続性のみを扱う
```

`stabilizeEigenvectorDirection`は「前フレームとの内積が負なら符号を反転する」という**表示上の便宜**であり、`computeEigenSystem`の数学的結果を変更してはならない。両者を1つの関数に混在させない。
