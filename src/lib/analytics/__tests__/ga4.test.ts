import { describe, expect, it, vi, afterEach } from 'vitest';
import { trackEvent } from '../ga4.js';

// trackEvent は「送信してよい形」だけを通す薄いラッパー。gtag が無い環境
// (測定ID未設定・非本番) では何もしない安全なノーオペレーションであることが
// docs/METRICS_PLAN.md §6 の非本番無効化要件の中核。

describe('trackEvent', () => {
	afterEach(() => {
		delete window.gtag;
		delete window.dataLayer;
		vi.restoreAllMocks();
	});

	it('window.gtag が存在しない場合は何もしない (測定ID未設定・非本番を模擬)', () => {
		expect(window.gtag).toBeUndefined();
		expect(() => trackEvent('prediction_start', { unit_slug: 'pythagorean-theorem' })).not.toThrow();
	});

	it('window.gtag が存在する場合、許可リストのイベント名と unit_slug のみを渡す', () => {
		const gtagMock = vi.fn();
		window.gtag = gtagMock;

		trackEvent('lesson_complete', { unit_slug: 'derivative-tangent-line' });

		expect(gtagMock).toHaveBeenCalledTimes(1);
		expect(gtagMock).toHaveBeenCalledWith('event', 'lesson_complete', {
			unit_slug: 'derivative-tangent-line',
		});
	});

	it('送信する属性は unit_slug のみ (許可リスト外を混入させない)', () => {
		const gtagMock = vi.fn();
		window.gtag = gtagMock;

		trackEvent('experiment_interact', { unit_slug: 'eigenvectors' });

		const [, , params] = gtagMock.mock.calls[0] as [string, string, Record<string, unknown>];
		expect(Object.keys(params)).toEqual(['unit_slug']);
	});
});
