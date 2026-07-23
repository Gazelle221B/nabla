import { useMemo, useState } from 'react';
import {
	clearPredictionHistory,
	readPredictionHistory,
	type PredictionRecord,
} from '../../lib/analytics/predictionHistory.js';
import styles from './PredictionHistoryView.module.css';

// 「あなたの予想履歴」ビュー(ADR-006 M9c)。localStorage(nabla:predictions:v1)に記録された
// 予想確定の履歴を一覧表示し、JSONエクスポート(ダウンロード)・全削除を提供する。
// プライバシー方針: この画面はlocalStorageを読むだけで、何もネットワークへ送信しない
// (docs/METRICS_PLAN.mdの境界: 予想内容はローカルのみ、GA4には送らない、を参照)。

const EXPORT_FILENAME = 'nabla-predictions-export.json';

function formatConfirmedAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso; // 想定外の形式でもクラッシュせず生の値を表示する
	return date.toLocaleString('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function buildExportPayload(records: readonly PredictionRecord[]): string {
	return JSON.stringify(
		{
			version: 'nabla:predictions:v1',
			exportedAt: new Date().toISOString(),
			records,
		},
		null,
		2,
	);
}

export function PredictionHistoryView() {
	const [records, setRecords] = useState<readonly PredictionRecord[]>(() => readPredictionHistory());
	const [confirmingClear, setConfirmingClear] = useState(false);

	// 新しい順(直近の予想が先頭)に並べ替えて表示する。ストレージ自体は記録順(古い→新しい)
	// のまま保つ(predictionHistory.ts の追記順、単純さを優先)。
	const sortedRecords = useMemo(
		() => [...records].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)),
		[records],
	);

	function handleExport(): void {
		const payload = buildExportPayload(records);
		const blob = new Blob([payload], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = EXPORT_FILENAME;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function handleConfirmClear(): void {
		clearPredictionHistory();
		setRecords([]);
		setConfirmingClear(false);
	}

	return (
		<div className={styles.section}>
			<p className={styles.intro}>
				各単元で確定した予想が、この端末のブラウザ内(localStorage)にだけ記録されています。
				どこにも送信されません。
			</p>

			<div className={styles.actions}>
				<button type="button" onClick={handleExport} disabled={records.length === 0}>
					JSONでエクスポート
				</button>
				{confirmingClear ? (
					<span className={styles.confirmGroup}>
						<span>本当にすべての履歴を削除しますか?</span>
						<button type="button" className={styles.dangerButton} onClick={handleConfirmClear}>
							削除する
						</button>
						<button type="button" onClick={() => setConfirmingClear(false)}>
							キャンセル
						</button>
					</span>
				) : (
					<button
						type="button"
						onClick={() => setConfirmingClear(true)}
						disabled={records.length === 0}
					>
						すべて削除
					</button>
				)}
			</div>

			{sortedRecords.length === 0 ? (
				<p className={styles.empty}>
					まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。
				</p>
			) : (
				<table className={styles.table}>
					<caption className={styles.tableCaption}>予想の記録(新しい順、全{sortedRecords.length}件)</caption>
					<thead>
						<tr>
							<th scope="col">単元</th>
							<th scope="col">選んだ予想</th>
							<th scope="col">日時</th>
						</tr>
					</thead>
					<tbody>
						{sortedRecords.map((record, index) => (
							<tr key={`${record.unitSlug}-${record.confirmedAt}-${index}`}>
								<td>{record.unitSlug}</td>
								<td>{record.choiceLabel}</td>
								<td>{formatConfirmedAt(record.confirmedAt)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
