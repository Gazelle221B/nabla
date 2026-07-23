// 全32単元の Experiment Island が共有する構造契約のうち、GA4計測(M9a)と予想履歴(M9c)の
// 両方が依拠する部分を中立モジュールとして独立させる(独立レビュー指摘、2026-07-24)。
//
// 以前はこれらの定数を coreLoopObserver.ts(GA4専用モジュール)が所有し、
// predictionHistoryRecorder.ts がそこから import していた。この構造だと「GA4計測とは
// 無関係な予想履歴機能が、GA4専用モジュールの内部実装に依存する」という不自然な結合になり、
// 将来 coreLoopObserver.ts 側の都合(例: GA4廃止・計測方式変更)でこれらの定数がリネーム・
// 削除された場合に、予想履歴側だけが無言で壊れるリスクがあった。
//
// 契約の本体(値そのもの)は docs/METRICS_PLAN.md §3 に定義された、全32単元共通の
// DOM 構造規約(grep で全数確認済み、coreLoopObserver.ts 冒頭コメント参照)と同一。
// この契約を変更する場合は、GA4(coreLoopObserver.ts)・予想履歴(predictionHistoryRecorder.ts)
// の両方に影響することを踏まえ、両方のテストを確認すること。

/** 予想ラジオの name 規約: `<input type="radio" name="{prefix}-prediction">`。 */
export const PREDICTION_RADIO_SELECTOR = 'input[type="radio"][name$="-prediction"]';

/** 予想確定ボタンの文言(完全一致): `<button>予想を確定して実験する</button>`。 */
export const SUBMIT_BUTTON_TEXT = '予想を確定して実験する';

/**
 * 現在の URL パス(`/lessons/{slug}/`)から単元 slug を取り出す。単元ページ以外では null。
 * GA4計測・予想履歴のどちらも、記録の宛先(単元)をこの関数から導出する。
 */
export function getUnitSlug(): string | null {
	const match = window.location.pathname.match(/\/lessons\/([^/]+)\/?/);
	return match?.[1] ?? null;
}
