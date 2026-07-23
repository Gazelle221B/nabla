import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PredictionHistoryView } from '../PredictionHistoryView.js';
import { appendPredictionRecord } from '../../../lib/analytics/predictionHistory.js';

describe('PredictionHistoryView(あなたの予想履歴、ADR-006 M9c)', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it('履歴が空のときは空状態のメッセージを表示する', () => {
		render(<PredictionHistoryView />);
		expect(
			screen.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});

	it('記録済みの予想を一覧表示する(単元・選んだ予想・日時)', () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'decreases',
			choiceLabel: 'cos θ は 1 から 0 へ向かって減っていく',
			confirmedAt: '2026-07-24T03:00:00.000Z',
		});
		render(<PredictionHistoryView />);

		const table = screen.getByRole('table');
		expect(within(table).getByText('trigonometric-ratios')).toBeInTheDocument();
		expect(within(table).getByText('cos θ は 1 から 0 へ向かって減っていく')).toBeInTheDocument();
	});

	it('新しい順(確定日時の降順)に並べ替えて表示する', () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '古い記録',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		appendPredictionRecord({
			unitSlug: 'derivative-function',
			choiceValue: 'b',
			choiceLabel: '新しい記録',
			confirmedAt: '2026-07-24T02:00:00.000Z',
		});
		render(<PredictionHistoryView />);

		const rows = screen.getAllByRole('row').slice(1); // 先頭はヘッダ行
		expect(within(rows[0]!).getByText('新しい記録')).toBeInTheDocument();
		expect(within(rows[1]!).getByText('古い記録')).toBeInTheDocument();
	});

	it('履歴が空のときはエクスポート・削除ボタンが無効化される', () => {
		render(<PredictionHistoryView />);
		expect(screen.getByRole('button', { name: 'JSONでエクスポート' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'すべて削除' })).toBeDisabled();
	});

	it('JSONでエクスポートを押すとBlobのダウンロードリンクが生成・クリックされる', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		const createObjectURLSpy = vi
			.spyOn(URL, 'createObjectURL')
			.mockReturnValue('blob:mock-url');
		const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		render(<PredictionHistoryView />);
		await user.click(screen.getByRole('button', { name: 'JSONでエクスポート' }));

		expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
		const blobArg = createObjectURLSpy.mock.calls[0]![0] as Blob;
		expect(blobArg.type).toBe('application/json');
		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
	});

	it('すべて削除は2段階確認が必要で、キャンセルすると履歴は消えない', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		render(<PredictionHistoryView />);

		await user.click(screen.getByRole('button', { name: 'すべて削除' }));
		expect(screen.getByText('本当にすべての履歴を削除しますか?')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'キャンセル' }));
		expect(screen.queryByText('本当にすべての履歴を削除しますか?')).not.toBeInTheDocument();
		expect(screen.getByText('記録1')).toBeInTheDocument();
	});

	it('a11y: 確認UI出現時に「削除する」ボタンへフォーカスが移動する(独立レビュー指摘)', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		render(<PredictionHistoryView />);

		await user.click(screen.getByRole('button', { name: 'すべて削除' }));

		expect(screen.getByRole('button', { name: '削除する' })).toHaveFocus();
	});

	it('a11y: キャンセルすると、フォーカスが「すべて削除」ボタンへ戻る', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		render(<PredictionHistoryView />);

		await user.click(screen.getByRole('button', { name: 'すべて削除' }));
		await user.click(screen.getByRole('button', { name: 'キャンセル' }));

		expect(screen.getByRole('button', { name: 'すべて削除' })).toHaveFocus();
	});

	it('a11y: 確認UIの外枠は aria-live="polite" を持つ(スクリーンリーダーへの通知)', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		render(<PredictionHistoryView />);

		await user.click(screen.getByRole('button', { name: 'すべて削除' }));

		const liveRegion = screen.getByText('本当にすべての履歴を削除しますか?').closest('[aria-live]');
		expect(liveRegion).toHaveAttribute('aria-live', 'polite');
	});

	it('すべて削除→削除するで確定すると、履歴が全削除され空状態に戻る', async () => {
		appendPredictionRecord({
			unitSlug: 'trigonometric-ratios',
			choiceValue: 'a',
			choiceLabel: '記録1',
			confirmedAt: '2026-07-24T01:00:00.000Z',
		});
		const user = userEvent.setup();
		render(<PredictionHistoryView />);

		await user.click(screen.getByRole('button', { name: 'すべて削除' }));
		await user.click(screen.getByRole('button', { name: '削除する' }));

		expect(
			screen.getByText('まだ予想の記録がありません。単元ページで予想を確定すると、ここに記録されます。'),
		).toBeInTheDocument();
		expect(window.localStorage.getItem('nabla:predictions:v1')).toBeNull();
	});
});
