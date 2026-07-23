import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKPOINT_DWELL_MS, initCoreLoopMetrics } from '../coreLoopObserver.js';

// coreLoopObserver は既存32単元 Experiment Island の共通DOM規約 (docs/METRICS_PLAN.md §3・§4、
// coreLoopObserver.ts 冒頭コメント) に依存する。ここでは実際の Island を使わず、その規約を
// 満たす最小限の DOM フィクスチャで発火条件を検証する。

type IntersectionCallback = (entries: Pick<IntersectionObserverEntry, 'isIntersecting'>[]) => void;

class FakeIntersectionObserver {
	static instances: FakeIntersectionObserver[] = [];
	callback: IntersectionCallback;
	observed: Element[] = [];
	constructor(callback: IntersectionCallback) {
		this.callback = callback;
		FakeIntersectionObserver.instances.push(this);
	}
	observe(el: Element) {
		this.observed.push(el);
	}
	disconnect() {
		this.observed = [];
	}
	unobserve() {}
	trigger(isIntersecting: boolean) {
		this.callback([{ isIntersecting }]);
	}
}

function buildExperimentFixture(prefix: string): void {
	document.body.innerHTML = `
		<section aria-labelledby="${prefix}-exp-title">
			<h2 id="${prefix}-exp-title">実験</h2>
			<fieldset>
				<input type="radio" name="${prefix}-prediction" value="a" />
				<input type="radio" name="${prefix}-prediction" value="b" />
			</fieldset>
			<button type="button">予想を確定して実験する</button>
			<div class="scene"></div>
		</section>
	`;
}

function appendControlsAndCheckpoint(prefix: string): void {
	const section = document.querySelector('section')!;
	const controls = document.createElement('div');
	controls.innerHTML = `
		<input id="${prefix}-a-slider" type="range" />
		<input id="${prefix}-a-number" type="text" />
	`;
	section.appendChild(controls);

	const checkpoint = document.createElement('div');
	checkpoint.innerHTML = `<h3>予想と結果</h3><p>...</p>`;
	section.appendChild(checkpoint);
}

describe('initCoreLoopMetrics', () => {
	let dispose: (() => void) | null = null;
	let gtagMock: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
	const realIntersectionObserver = globalThis.IntersectionObserver;

	beforeEach(() => {
		vi.useFakeTimers();
		gtagMock = vi.fn<(...args: unknown[]) => void>();
		window.gtag = gtagMock;
		FakeIntersectionObserver.instances = [];
		// @ts-expect-error jsdom に IntersectionObserver が無いためテスト用スタブを注入する
		globalThis.IntersectionObserver = FakeIntersectionObserver;
		window.history.pushState({}, '', '/lessons/pythagorean-theorem/');
	});

	afterEach(() => {
		dispose?.();
		dispose = null;
		document.body.innerHTML = '';
		delete window.gtag;
		globalThis.IntersectionObserver = realIntersectionObserver;
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('実験セクションが無いページでは何もせず null を返す', () => {
		document.body.innerHTML = '<main>トップページ</main>';
		dispose = initCoreLoopMetrics();
		expect(dispose).toBeNull();
	});

	it('URL に /lessons/{slug}/ が無い場合は何もしない', () => {
		buildExperimentFixture('pythagoras');
		window.history.pushState({}, '', '/map/');
		dispose = initCoreLoopMetrics();
		expect(dispose).toBeNull();
	});

	it('予想ラジオの最初の change で prediction_start が一度だけ発火する', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();

		const radios = document.querySelectorAll('input[type="radio"]');
		radios[0].dispatchEvent(new Event('change', { bubbles: true }));
		radios[1].dispatchEvent(new Event('change', { bubbles: true }));

		const predictionStartCalls = gtagMock.mock.calls.filter((c) => c[1] === 'prediction_start');
		expect(predictionStartCalls).toHaveLength(1);
		expect(predictionStartCalls[0][2]).toEqual({ unit_slug: 'pythagorean-theorem' });
	});

	it('確定ボタンのクリックで prediction_submit が発火する (完全一致の文言のみ)', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();

		document.querySelector('button')!.dispatchEvent(new Event('click', { bubbles: true }));

		expect(gtagMock).toHaveBeenCalledWith('event', 'prediction_submit', {
			unit_slug: 'pythagorean-theorem',
		});
	});

	it('無関係なボタンのクリックでは prediction_submit を発火しない', () => {
		buildExperimentFixture('pythagoras');
		const decoy = document.createElement('button');
		decoy.textContent = 'リセット';
		document.querySelector('section')!.appendChild(decoy);
		dispose = initCoreLoopMetrics();

		decoy.dispatchEvent(new Event('click', { bubbles: true }));

		expect(gtagMock).not.toHaveBeenCalledWith('event', 'prediction_submit', expect.anything());
	});

	it('予想確定後に現れる操作コントロールの change で experiment_interact が一度だけ発火する', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();
		appendControlsAndCheckpoint('pythagoras');

		const slider = document.querySelector('#pythagoras-a-slider')!;
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		slider.dispatchEvent(new Event('change', { bubbles: true }));

		const interactCalls = gtagMock.mock.calls.filter((c) => c[1] === 'experiment_interact');
		expect(interactCalls).toHaveLength(1);
	});

	it('操作なしでチェックポイントが可視化されても lesson_complete は発火しない', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();
		appendControlsAndCheckpoint('pythagoras');

		expect(FakeIntersectionObserver.instances).toHaveLength(1);
		FakeIntersectionObserver.instances[0].trigger(true);
		vi.advanceTimersByTime(CHECKPOINT_DWELL_MS + 10);

		expect(gtagMock).not.toHaveBeenCalledWith('event', 'lesson_complete', expect.anything());
	});

	it('操作 → チェックポイント可視 (1000ms以上) で lesson_complete が発火する', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();
		appendControlsAndCheckpoint('pythagoras');

		document
			.querySelector('#pythagoras-a-slider')!
			.dispatchEvent(new Event('change', { bubbles: true }));

		FakeIntersectionObserver.instances[0].trigger(true);
		vi.advanceTimersByTime(CHECKPOINT_DWELL_MS + 10);

		expect(gtagMock).toHaveBeenCalledWith('event', 'lesson_complete', {
			unit_slug: 'pythagorean-theorem',
		});
	});

	it('ドウェル時間 (1000ms) 未満でビューポートから外れた場合は lesson_complete が発火しない', () => {
		buildExperimentFixture('pythagoras');
		dispose = initCoreLoopMetrics();
		appendControlsAndCheckpoint('pythagoras');

		document
			.querySelector('#pythagoras-a-slider')!
			.dispatchEvent(new Event('change', { bubbles: true }));

		const observer = FakeIntersectionObserver.instances[0];
		observer.trigger(true);
		vi.advanceTimersByTime(CHECKPOINT_DWELL_MS - 200);
		observer.trigger(false);
		vi.advanceTimersByTime(1000);

		expect(gtagMock).not.toHaveBeenCalledWith('event', 'lesson_complete', expect.anything());
	});
});
