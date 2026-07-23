// 「予想 → 操作 → 発見」の中核ループを計測する4イベントの発火点 (docs/METRICS_PLAN.md §3・§4)。
//
// 全32単元の Experiment Island は同一の構造規約 (T3-1 の黄金パターンの複製) を共有しており、
// 2026-07-24 時点で grep により全単元での成立を確認済み:
//   - 実験セクション   : <section aria-labelledby="{prefix}-exp-title">
//   - 予想ラジオ       : <input type="radio" name="{prefix}-prediction">
//   - 予想確定ボタン   : 文言が完全一致する <button>予想を確定して実験する</button>
//   - 操作コントロール : id が "-slider" または "-number" で終わる <input>
//     (予想確定後にのみ DOM へ現れる。DOM に現れた時点で change/input が発火すれば
//      「確定後の操作」であることが構造的に保証される)
//   - チェックポイント : 見出しが完全一致する <h3>予想と結果</h3>
//
// この規約に依存することで、32個の Experiment Island 自体には一切変更を加えず
// (検証済みの数学・アクセシビリティ実装への回帰リスクをゼロにする、AGENTS.md C-8)、
// 単一のドキュメントレベルのイベント委譲で計測する。単元 slug は URL パス
// (/lessons/{slug}/) から導出するため、Island 側に slug を渡す配線も不要。
import { trackEvent } from './ga4.js';
import type { NablaEventName } from './events.js';

const EXPERIMENT_SECTION_SELECTOR = 'section[aria-labelledby$="-exp-title"]';
const PREDICTION_RADIO_SELECTOR = 'input[type="radio"][name$="-prediction"]';
const INTERACTION_INPUT_SELECTOR = 'input[id$="-slider"], input[id$="-number"]';
const SUBMIT_BUTTON_TEXT = '予想を確定して実験する';
const CHECKPOINT_HEADING_TEXT = '予想と結果';

/** チェックポイント可視のドウェル判定時間 (docs/METRICS_PLAN.md §4)。 */
export const CHECKPOINT_DWELL_MS = 1000;

function getUnitSlug(): string | null {
	const match = window.location.pathname.match(/\/lessons\/([^/]+)\/?/);
	return match?.[1] ?? null;
}

function findCheckpointHeading(): Element | null {
	const headings = document.querySelectorAll('h3');
	for (const heading of headings) {
		if (heading.textContent?.trim() === CHECKPOINT_HEADING_TEXT) {
			return heading.parentElement;
		}
	}
	return null;
}

/**
 * 中核ループの計測を初期化する。単元ページ (実験セクションを含むページ) でのみ実質的に
 * 動作し、それ以外のページでは何もせず null を返す (トップページ・単元マップ等)。
 *
 * 戻り値の破棄関数はテスト用 (本番の静的サイトはページ遷移がフルリロードのため呼ばない)。
 */
export function initCoreLoopMetrics(): (() => void) | null {
	const unitSlug = getUnitSlug();
	if (!unitSlug) return null;
	if (!document.querySelector(EXPERIMENT_SECTION_SELECTOR)) return null;

	// 各イベントはページ読み込みごとに単元あたり最大1回だけ発火する (多重発火防止、
	// docs/METRICS_PLAN.md §3)。
	const fired = new Set<NablaEventName>();
	const fireOnce = (name: NablaEventName): void => {
		if (fired.has(name)) return;
		fired.add(name);
		trackEvent(name, { unit_slug: unitSlug });
	};

	// 単元完了の操作的定義 (docs/METRICS_PLAN.md §4) は「操作実施」が既に起きていることを
	// 前提条件にする。
	let hasInteracted = false;

	// 予想ラジオは 'change' のみを発火する (仕様上 'input' は無い)。操作コントロール
	// (スライダー・数値入力) はドラッグ/キーボード操作の経路によって 'input' のみが
	// 先に来る場合があるため、両方を購読して取りこぼしを防ぐ (fireOnce で多重発火は防止済み)。
	const handleInteractionEvent = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.matches(PREDICTION_RADIO_SELECTOR)) {
			fireOnce('prediction_start');
		}
		if (target.matches(INTERACTION_INPUT_SELECTOR)) {
			hasInteracted = true;
			fireOnce('experiment_interact');
		}
	};

	const handleClick = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest('button');
		if (button && button.textContent?.trim() === SUBMIT_BUTTON_TEXT) {
			fireOnce('prediction_submit');
		}
	};

	document.addEventListener('change', handleInteractionEvent);
	document.addEventListener('input', handleInteractionEvent);
	document.addEventListener('click', handleClick);

	// チェックポイントは予想確定後にのみ DOM へ現れるため、MutationObserver で出現を待ち、
	// 現れた時点で IntersectionObserver へ切り替える。
	let dwellTimer: ReturnType<typeof setTimeout> | null = null;
	const intersectionObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					if (dwellTimer) clearTimeout(dwellTimer);
					dwellTimer = setTimeout(() => {
						if (hasInteracted) fireOnce('lesson_complete');
					}, CHECKPOINT_DWELL_MS);
				} else if (dwellTimer) {
					clearTimeout(dwellTimer);
					dwellTimer = null;
				}
			}
		},
		{ threshold: 0.6 },
	);

	const mutationObserver = new MutationObserver(() => {
		const checkpoint = findCheckpointHeading();
		if (checkpoint) {
			intersectionObserver.observe(checkpoint);
			mutationObserver.disconnect();
		}
	});

	const existingCheckpoint = findCheckpointHeading();
	if (existingCheckpoint) {
		intersectionObserver.observe(existingCheckpoint);
	} else {
		mutationObserver.observe(document.body, { childList: true, subtree: true });
	}

	return () => {
		document.removeEventListener('change', handleInteractionEvent);
		document.removeEventListener('input', handleInteractionEvent);
		document.removeEventListener('click', handleClick);
		intersectionObserver.disconnect();
		mutationObserver.disconnect();
		if (dwellTimer) clearTimeout(dwellTimer);
	};
}
