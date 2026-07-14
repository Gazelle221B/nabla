import { expect } from '@playwright/test';

// client:visible の島は交差検出後に JS チャンクを取得してハイドレーションするため、
// ページ到達直後や scrollIntoViewIfNeeded 直後のクリックはリスナー未接続のまま
// ネイティブ DOM だけを変化させて失われることがある。ここで厄介なのは、ラジオボタンは
// 「既にチェック済みの選択肢」を再クリックしても checked 状態が変化しないため
// change イベントが再発火しない、というネイティブ HTML の仕様: 1回目のクリックが
// ハイドレーション未接続で失われると、同じ選択肢を何度リトライしてもネイティブ DOM 側は
// 既に checked のままなので新たな change は一切発火せず、click() の単純なリトライは
// 効果がない(実測: 20秒リトライしても解消しないフレークを確認)。
// 対策: 別の選択肢 (decoy) → 目的の選択肢、を1セットにしてクリックする。こうすると
// 毎回のリトライが必ず「未選択→選択」または「別の選択肢→目的の選択肢」という
// 本物の状態遷移になり、native の change イベントが確実に発火する。ハイドレーションが
// 完了した直後のセットで React 側が拾い、確定ボタンが有効になる(実測: 5/5 成功、
// いずれも初回セットかつ100ms未満で成功)。三平方(T4-1)・微分係数(M2)の両レーンで
// 独立に同じ問題を発見し、同じ対策に収束した(全ページ共通で使う)。
export async function selectPredictionRobustly(
	page: import('@playwright/test').Page,
	targetLabel: string,
	decoyLabel: string,
): Promise<void> {
	const decoyRadio = page.getByRole('radio', { name: decoyLabel });
	const targetRadio = page.getByRole('radio', { name: targetLabel });
	const submitButton = page.getByRole('button', { name: '予想を確定して実験する' });
	await expect(async () => {
		await decoyRadio.click();
		await targetRadio.click();
		await expect(submitButton).toBeEnabled({ timeout: 1000 });
	}).toPass({ timeout: 20000 });
}
