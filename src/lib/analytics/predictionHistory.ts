// 予想履歴(localStorage、ADR-006 M9c)のストレージ層。DOM への配線(document への
// イベント委譲)は predictionHistoryRecorder.ts に分離し、このモジュールは純粋な
// 読み書き・検証ロジックのみを持つ(テスト容易性のため関心を分離する)。
//
// プライバシー方針(タスク仕様・docs/METRICS_PLAN.md の境界):
//   - localStorage のみに保存し、どこにも送信しない(GA4にも送らない)。
//   - 記録失敗(容量超過・プライベートモードでの例外)時は無言で機能停止する。本文閲覧に
//     一切影響しないことが最優先であり、console エラーも出さない(C-3 の精神の敷衍)。
//
// キー設計: バージョン付き("nabla:predictions:v1")。将来レコード形式を破壊的に変更する
// 場合は v2 など新しいキーへ移行し、旧キーの読み替えは行わない(単純さを優先、C-4 の精神:
// 進捗保存は「デバイス横断は埋めないと割り切る」ため、移行の複雑さに投資しない)。

export const PREDICTION_HISTORY_STORAGE_KEY = 'nabla:predictions:v1';

/** 1件の予想確定の記録。 */
export interface PredictionRecord {
	/** 単元 slug(例: "trigonometric-ratios")。URL パス /lessons/{slug}/ から導出する。 */
	readonly unitSlug: string;
	/** 選択したラジオの value 属性(内部的な安定キー。表示にはchoiceLabelを使う)。 */
	readonly choiceValue: string;
	/** 選択した予想の人間可読なラベル文字列(ラジオを包む <label> のテキスト)。 */
	readonly choiceLabel: string;
	/** 確定した日時(ISO 8601、new Date().toISOString())。 */
	readonly confirmedAt: string;
}

function isPredictionRecord(value: unknown): value is PredictionRecord {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.unitSlug === 'string' &&
		typeof record.choiceValue === 'string' &&
		typeof record.choiceLabel === 'string' &&
		typeof record.confirmedAt === 'string'
	);
}

/**
 * localStorage から既存の履歴を読む。壊れたJSON・想定外の形・localStorage 不在(SSR・
 * プライベートモードでのアクセス拒否等)はすべて空配列にフォールバックする(無言で機能停止、
 * 例外を外へ漏らさない)。
 */
function safeReadHistory(): PredictionRecord[] {
	try {
		if (typeof window === 'undefined') return [];
		const raw = window.localStorage.getItem(PREDICTION_HISTORY_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isPredictionRecord);
	} catch {
		return [];
	}
}

function safeWriteHistory(records: readonly PredictionRecord[]): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(PREDICTION_HISTORY_STORAGE_KEY, JSON.stringify(records));
	} catch {
		// 容量超過・プライベートモードでの拒否等。無言で何もしない(タスク仕様: console
		// エラーも出さない)。
	}
}

/** 保存済みの予想履歴を新しい順ではなく記録順(古い→新しい)で返す。表示側で並べ替える。 */
export function readPredictionHistory(): readonly PredictionRecord[] {
	return safeReadHistory();
}

/** 予想確定の記録を1件追記する。失敗時は無言で何もしない。 */
export function appendPredictionRecord(record: PredictionRecord): void {
	try {
		const existing = safeReadHistory();
		safeWriteHistory([...existing, record]);
	} catch {
		// 二重の安全網(safeReadHistory/safeWriteHistory自体は例外を投げない設計だが、
		// 将来の変更に対しても「記録失敗時に本文へ影響しない」という不変条件を守る)。
	}
}

/** 履歴を全削除する。失敗時は無言で何もしない。 */
export function clearPredictionHistory(): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.removeItem(PREDICTION_HISTORY_STORAGE_KEY);
	} catch {
		// 無言で何もしない。
	}
}
