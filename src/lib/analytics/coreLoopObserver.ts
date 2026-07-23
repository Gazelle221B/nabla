// 「予想 → 操作 → 発見」の中核ループを計測する4イベントの発火点 (docs/METRICS_PLAN.md §3・§4)。
//
// 全32単元の Experiment Island は同一の構造規約 (T3-1 の黄金パターンの複製) を共有しており、
// 2026-07-24 時点で grep により全単元での成立を確認済み:
//   - 実験セクション   : <section aria-labelledby="{prefix}-exp-title">
//   - 予想ラジオ       : <input type="radio" name="{prefix}-prediction">
//   - 予想確定ボタン   : 文言が完全一致する <button>予想を確定して実験する</button>
//   - チェックポイント : 見出しが完全一致する <h3>予想と結果</h3>
//
// 操作コントロール(「操作(実験)実施」の発火点)は、当初 `-slider`/`-number` の id 命名
// 規約に依存していたが、独立レビュー(2026-07-24, Kimi K2.7 経由)で
// **GraphTheoryExperiment(辺のON/OFFを SVG の role="switch" 要素で行い、-slider/-number
// の <input> を一切持たない)だけが取りこぼされる**ことが判明した。そのため定義を
// 「予想確定後の実験セクション内にある操作コントロール」へ一般化する:
//   - `<input>` への 'input'/'change'(予想ラジオを除く。プリセット選択ラジオ・スライダー・
//     数値入力をすべて含む)
//   - `button`・`[role="button"]`・`[role="switch"]`・`[tabindex="0"]` への 'click'/'keydown'
//     (Enter/Space。予想確定ボタン自体は文言で明示的に除外する)
// これにより、input 以外の対話パターン(GraphScene の SVG スイッチ等)を持つ将来の単元にも
// 個別配線なしで対応できる。docs/METRICS_PLAN.md §3 の operational definition と 1:1。
//
// この規約に依存することで、32個の Experiment Island 自体には一切変更を加えず
// (検証済みの数学・アクセシビリティ実装への回帰リスクをゼロにする、AGENTS.md C-8)、
// 単一のドキュメントレベルのイベント委譲で計測する。単元 slug は URL パス
// (/lessons/{slug}/) から導出するため、Island 側に slug を渡す配線も不要。
import { trackEvent } from './ga4.js';
import type { NablaEventName } from './events.js';

const EXPERIMENT_SECTION_SELECTOR = 'section[aria-labelledby$="-exp-title"]';
const PREDICTION_RADIO_SELECTOR = 'input[type="radio"][name$="-prediction"]';
// 操作コントロールとして扱うクリック可能要素 (予想確定ボタン自身は文言で個別に除外する)。
const OPERATE_CLICKABLE_SELECTOR = 'button, [role="button"], [role="switch"], [tabindex="0"]';
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

function isSubmitButton(el: Element): boolean {
	return el instanceof HTMLButtonElement && el.textContent?.trim() === SUBMIT_BUTTON_TEXT;
}

/**
 * `target` が「実験セクション内の操作コントロール」かどうかを判定する (docs/METRICS_PLAN.md §3)。
 * 予想ラジオ・予想確定ボタン自身は除外する (それぞれ別イベントの発火点であり、
 * 「操作(実験)実施」と混同すると単元完了の操作的定義=§4 が意味をなさなくなるため)。
 * 実験セクションの外側 (グローバルなナビゲーション等) は対象外にする (スコープ制限)。
 */
function isOperateControl(target: Element): boolean {
	const section = target.closest(EXPERIMENT_SECTION_SELECTOR);
	if (!section) return false;
	if (target.matches(PREDICTION_RADIO_SELECTOR)) return false;

	if (target instanceof HTMLInputElement) return true;

	const clickable = target.closest(OPERATE_CLICKABLE_SELECTOR);
	if (!clickable || !section.contains(clickable)) return false;
	if (isSubmitButton(clickable)) return false;
	return true;
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

	const markInteracted = (): void => {
		hasInteracted = true;
		fireOnce('experiment_interact');
	};

	// 予想ラジオは 'change' のみを発火する (仕様上 'input' は無い)。操作コントロール
	// (スライダー・数値入力・プリセット選択ラジオ等の <input>) はドラッグ/キーボード操作の
	// 経路によって 'input' のみが先に来る場合があるため、両方を購読して取りこぼしを防ぐ
	// (fireOnce で多重発火は防止済み)。
	const handleInputLikeEvent = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.matches(PREDICTION_RADIO_SELECTOR)) {
			fireOnce('prediction_start');
			return;
		}
		if (isOperateControl(target)) {
			markInteracted();
		}
	};

	const handleClick = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest('button');
		if (button && isSubmitButton(button)) {
			fireOnce('prediction_submit');
			return;
		}
		if (isOperateControl(target)) {
			markInteracted();
		}
	};

	// role="switch" 等の非ネイティブな対話要素 (例: GraphScene の SVG <g role="switch">) は
	// Enter/Space を押してもブラウザがネイティブの 'click' を自動発火しない
	// (ネイティブ <button> と異なる)。アプリ側が onKeyDown で直接ハンドルしているため、
	// ここでも同じキーを明示的に拾う。ネイティブボタンでは 'click' 側と重複しうるが
	// fireOnce が多重発火を防ぐ。
	const handleKeydown = (event: Event): void => {
		if (!(event instanceof KeyboardEvent)) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const clickable = target.closest(OPERATE_CLICKABLE_SELECTOR);
		if (clickable && isSubmitButton(clickable)) return;
		if (isOperateControl(target)) {
			markInteracted();
		}
	};

	document.addEventListener('change', handleInputLikeEvent);
	document.addEventListener('input', handleInputLikeEvent);
	document.addEventListener('click', handleClick);
	document.addEventListener('keydown', handleKeydown);

	// チェックポイントは予想確定後にのみ DOM へ現れるため、MutationObserver で出現を待ち、
	// 現れた時点で IntersectionObserver へ切り替える。
	let dwellTimer: ReturnType<typeof setTimeout> | null = null;
	const intersectionObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const node = entry.target;
				if (entry.isIntersecting) {
					if (dwellTimer) clearTimeout(dwellTimer);
					dwellTimer = setTimeout(() => {
						// 予想確定後の再レンダリングでチェックポイント要素が差し替わり、観測対象が
						// 既に DOM から外れている可能性への防御 (安価なので入れる)。
						if (hasInteracted && node.isConnected) fireOnce('lesson_complete');
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
		document.removeEventListener('change', handleInputLikeEvent);
		document.removeEventListener('input', handleInputLikeEvent);
		document.removeEventListener('click', handleClick);
		document.removeEventListener('keydown', handleKeydown);
		intersectionObserver.disconnect();
		mutationObserver.disconnect();
		if (dwellTimer) clearTimeout(dwellTimer);
	};
}
