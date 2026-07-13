// ドットヒストグラムの表示密度計算(純粋 TypeScript、Pixi.js を import しない)。
// CltScene.tsx(実際に Pixi を扱う描画層)と CltExperiment.tsx(観察表に同じ値を表示する
// DOM 層)の両方がこの値を参照するため、独立したモジュールに切り出している——CltScene.tsx
// と同じファイルに置くと、CltExperiment のテスト(RTL)で CltScene をスタブ化する際に
// pixi.js の import ごと巻き込んでしまい、jsdom 環境での Pixi 初期化(WebGL 等のブラウザ API)
// に不必要に依存することになるため(Mafs シーンを丸ごとスタブ化する既存の方針と同じ理由)。

export const DEFAULT_MAX_DOTS_PER_COLUMN = 70;

/**
 * 表示密度(1ドットが表す試行回数)を、最大度数と描画可能な最大ドット数から決める。
 * n(試行回数)が大きいときに1ドット=複数試行の集約になる——この値は Scene の描画と
 * CltExperiment の観察表(「集約規則は状態依存の実値でラベル表示」という要件)の両方で
 * そのまま使われ、表示される数値が食い違わないようにする。
 */
export function computeTrialsPerDot(
	frequencies: readonly number[],
	maxDotsPerColumn: number = DEFAULT_MAX_DOTS_PER_COLUMN,
): number {
	const maxFrequency = frequencies.reduce((m, f) => Math.max(m, f), 0);
	return Math.max(1, Math.ceil(maxFrequency / maxDotsPerColumn));
}
