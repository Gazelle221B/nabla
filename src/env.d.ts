/// <reference types="astro/client" />

// GA4 測定 ID (docs/METRICS_PLAN.md §6)。未設定時は計測を無効化する
// (現時点では未発行 = HUMAN ゲート、AGENTS.md §11 の「疑ったら止める」に沿い
// 実装は未設定を安全な既定値として扱う)。
interface ImportMetaEnv {
	readonly PUBLIC_GA4_ID?: string;
}
