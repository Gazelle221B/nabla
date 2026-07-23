// GA4 (gtag.js) への薄いラッパー。実際のスクリプト読み込み・有効化判定は
// src/layouts/BaseLayout.astro が担う (docs/METRICS_PLAN.md §6)。このモジュールは
// 「送信してよい形」を型で強制し、gtag が存在しない環境 (測定ID未設定・非本番・
// スクリプト未ロード) では何もしない安全なノーオペレーションに徹する。
import type { NablaEventName, NablaEventParams } from './events.js';

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: (...args: unknown[]) => void;
	}
}

/**
 * 許可リストのイベントを GA4 へ送信する。
 * `window.gtag` が無い場合 (測定ID未設定・非本番・SSR) は何もしない。
 * コンソールエラーを出さないこと自体が要件 (docs/METRICS_PLAN.md §6、非本番無効化)。
 */
export function trackEvent(name: NablaEventName, params: NablaEventParams): void {
	if (typeof window === 'undefined') return;
	if (typeof window.gtag !== 'function') return;
	window.gtag('event', name, params);
}
