// 予想履歴の記録(ADR-006 M9c)を担う document レベルのイベント委譲。coreLoopObserver.ts
// (M9a)と同じ設計判断: 32単元共通の構造契約(予想ラジオ name="*-prediction"、確定ボタン
// 文言「予想を確定して実験する」)に依拠し、既存 Island には一切変更を加えない(C-8)。
// 契約の定数(PREDICTION_RADIO_SELECTOR・SUBMIT_BUTTON_TEXT・getUnitSlug)は GA4専用の
// coreLoopObserver.ts からではなく、中立モジュール predictionContract.ts から直接 import する
// (独立レビュー指摘、2026-07-24: 予想履歴機能がGA4専用モジュールに依存する不自然な結合を解消)。
//
// GA4(coreLoopObserver.ts)との違い: これは外部送信を一切行わず、localStorage のみに
// 書き込む(docs/METRICS_PLAN.md の境界を維持——予想の選択内容は許可リストにないため
// GA4には送らない。ここではそもそもネットワーク送信自体が無い)。
import { getUnitSlug, PREDICTION_RADIO_SELECTOR, SUBMIT_BUTTON_TEXT } from '../predictionContract.js';
import { appendPredictionRecord } from './predictionHistory.js';

function isSubmitButton(el: Element): boolean {
	return el instanceof HTMLButtonElement && el.textContent?.trim() === SUBMIT_BUTTON_TEXT;
}

/** 選択中のラジオの人間可読なラベルを、それを包む <label> のテキストから取り出す。 */
function extractCheckedLabel(radio: HTMLInputElement): string {
	const label = radio.closest('label');
	if (label?.textContent) return label.textContent.trim();
	// <label> で包まれていない構造(将来の単元で構造が変わった場合の保険)。value をそのまま使う。
	return radio.value;
}

/**
 * 予想履歴の記録を初期化する。単元ページ(URL が /lessons/{slug}/ の形)以外では何もしない
 * (coreLoopObserver.ts の initCoreLoopMetrics と同じ早期リターン方針)。
 *
 * 戻り値の破棄関数はテスト用(本番の静的サイトはページ遷移がフルリロードのため呼ばない)。
 */
export function initPredictionHistoryRecorder(): (() => void) | null {
	const unitSlug = getUnitSlug();
	if (!unitSlug) return null;

	// 重複レコード防止(独立レビュー指摘、2026-07-24): 確定ボタンの連打や、フォーカス移動前の
	// ダブルクリック等で同一の確定操作に対して click イベントが複数回配送されると、内容が
	// 同一のレコードが何度も履歴に積み重なってしまう。coreLoopObserver.ts の
	// `prediction_submit` イベントが「1ページロードにつき最大1回」に制限されているのと同じ
	// fireOnce 相当のガードを設け、1回のページロードで記録するのは最初の確定操作1回だけとする。
	// (通常の使用では各 Experiment Island 側で確定後にラジオ群が disabled になり2回目の確定
	// 自体が起こりにくいが、その防御に依存せずここでも独立に保証する。)
	let hasRecorded = false;

	const handleClick = (event: Event): void => {
		if (hasRecorded) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest('button');
		if (!button || !isSubmitButton(button)) return;

		// 記録失敗(容量超過・プライベートモード等)は appendPredictionRecord 内部で無言に
		// 吸収される。ここでは DOM 読み取り自体が失敗しうる状況(想定外の構造変更等)にも
		// 同じ「無言で機能停止・本文閲覧に影響しない」方針を適用する(C-3 の精神の敷衍)。
		try {
			const radios = document.querySelectorAll<HTMLInputElement>(PREDICTION_RADIO_SELECTOR);
			const checked = Array.from(radios).find((radio) => radio.checked);
			if (!checked) return;

			appendPredictionRecord({
				unitSlug,
				choiceValue: checked.value,
				choiceLabel: extractCheckedLabel(checked),
				confirmedAt: new Date().toISOString(),
			});
			hasRecorded = true;
		} catch {
			// 無言で何もしない(タスク仕様: console エラーも出さない)。
		}
	};

	document.addEventListener('click', handleClick);

	return () => {
		document.removeEventListener('click', handleClick);
	};
}
