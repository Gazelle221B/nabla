// スケール相対誤差の共通ヘルパー (MATH_CONVENTIONS.md §2)。
// lib/math 配下の純粋 TypeScript。React/描画ライブラリを一切 import しない (AGENTS.md §5)。
//
// 固定絶対誤差ではなく、比較対象と同じ次元・オーダーの量 (scale) に対する相対誤差で
// 「実質的にゼロか」を判定する。Math.max(1, scale) により scale が 0 に近い退化ケースでも
// 許容誤差が消失しない。

export const EPSILON = 1e-9;

export function approximatelyZero(value: number, scale: number): boolean {
	return Math.abs(value) <= EPSILON * Math.max(1, scale);
}
