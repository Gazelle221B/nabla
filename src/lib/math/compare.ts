// スケール相対誤差の共通ヘルパー (MATH_CONVENTIONS.md §2)。
// lib/math 配下の純粋 TypeScript。React/描画ライブラリを一切 import しない (AGENTS.md §5)。
//
// 固定絶対誤差ではなく、比較対象と同じ次元・オーダーの量 (scale) に対する相対誤差で
// 「実質的にゼロか」を判定する。scale は大きさ (絶対値) のみが意味を持つため Math.abs を取り、
// Math.max(1, ...) により scale が 0 に近い退化ケースでも許容誤差が消失しない。

export const EPSILON = 1e-9;

export function approximatelyZero(value: number, scale: number): boolean {
	// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに扱わず事前条件違反として例外にする
	// (pythagoreanResidual と同じ流儀)。NaN を偽として飲み込むと誤判定を隠すため。
	if (!Number.isFinite(value) || !Number.isFinite(scale)) {
		throw new RangeError(
			`approximatelyZero requires finite value and scale, got value=${value}, scale=${scale}`,
		);
	}
	return Math.abs(value) <= EPSILON * Math.max(1, Math.abs(scale));
}
