// URL パラメータでの初期状態固定(ADR-006 M9d、一斉提示モード)。
//
// 教師が「全員同じ初期状態」で提示できるよう、URL クエリで対話 Island の操作コントロールの
// 初期値だけを差し替えられるようにする中立ユーティリティ。タスク仕様の制約:
//   - 既存 Island の大改修は禁止。ここでは「パース+検証+クランプ」だけに徹し、
//     Island 側は初期 useState の計算式を1箇所差し替えるだけで済むようにする。
//   - 不正値は黙って既定値へフォールバックする(C-3 の精神、console エラーは一切出さない)。
//   - **予想ゲートには一切関与しない**: この関数群は「操作コントロールの初期値」のみを
//     読み取る。prediction(予想)・submitted(確定状態)を読み書きする関数は意図的に
//     ここには存在しない——予想ゲート(操作前に予想を要求する設計)を URL パラメータで
//     迂回できないことを、そもそも迂回する手段を提供しないことで保証する。

/**
 * 現在のページの検索パラメータを取得する。ブラウザ以外の環境(SSR等)や URL の解析に
 * 失敗した場合は空の URLSearchParams を返す(fail-safe、例外を投げない)。
 */
export function getPresetSearchParams(): URLSearchParams {
	if (typeof window === 'undefined' || !window.location) return new URLSearchParams();
	try {
		return new URLSearchParams(window.location.search);
	} catch {
		return new URLSearchParams();
	}
}

export interface NumberPresetOptions {
	readonly min: number;
	readonly max: number;
	readonly fallback: number;
}

/**
 * 数値パラメータを読み、[min, max] へクランプして返す。
 * パラメータ欠落・非数値・非有限値(NaN・Infinity)は黙って fallback を返す。
 */
export function readNumberPreset(
	params: URLSearchParams,
	key: string,
	{ min, max, fallback }: NumberPresetOptions,
): number {
	const raw = params.get(key);
	if (raw === null || raw.trim() === '') return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

/**
 * 列挙(許可リスト)パラメータを読む。パラメータ欠落・許可リスト外の値は黙って fallback を返す。
 */
export function readEnumPreset<T extends string>(
	params: URLSearchParams,
	key: string,
	allowed: readonly T[],
	fallback: T,
): T {
	const raw = params.get(key);
	if (raw === null) return fallback;
	return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
