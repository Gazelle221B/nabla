// GA4 に送信してよいイベント・属性の許可リスト (docs/METRICS_PLAN.md §3 と 1:1 対応)。
// ここに無い名前・属性は型エラーになるため、実装が許可リストから逸脱することを
// コンパイル時に防ぐ (AGENTS.md C-5: 数値入力値・自由記述・個人特定情報を送信しない)。
//
// このファイルは lib/math ではなく lib/analytics に置く (C-6: 描画・計測を数学モデルに
// 混ぜない)。GA4・DOM 等の実行環境には一切依存しない純粋な型定義のみを持つ。

/** docs/METRICS_PLAN.md §3 の許可リストそのもの。増やす場合は METRICS_PLAN.md を先に改訂する。 */
export const NABLA_EVENT_NAMES = [
	'prediction_start',
	'prediction_submit',
	'experiment_interact',
	'lesson_complete',
] as const;

export type NablaEventName = (typeof NABLA_EVENT_NAMES)[number];

/**
 * 送信を許可する属性は単元 slug のみ (docs/METRICS_PLAN.md §2)。
 * 数値入力値・予想の選択内容・自由記述・個人特定情報はここに追加しない。
 */
export interface NablaEventParams {
	readonly unit_slug: string;
}
