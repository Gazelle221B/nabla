import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initCoreLoopMetrics } from '../coreLoopObserver.js';
import { PrerequisiteCheck } from '../../../components/lesson/PrerequisiteCheck.js';
import type { PrerequisiteCheckData } from '../../prerequisiteChecks/types.js';

// jsdom は IntersectionObserver を実装しないため、coreLoopObserver.test.ts と同じ方針で
// 最小限のスタブを注入する(このテストの関心事はチェックポイントの可視判定ではなく
// input/click 系のイベント委譲なので、observe/disconnect が例外を投げなければ十分)。
class NoopIntersectionObserver {
	observe(): void {}
	disconnect(): void {}
	unobserve(): void {}
}

// ADR-006 M9b タスク仕様: 「前提チェックの操作が experiment_interact に誤カウントされない
// こと」をここで固定する。coreLoopObserver.ts の isOperateControl は
// `section[aria-labelledby$="-exp-title"]` の内側でのみ操作コントロールを検出するため、
// PrerequisiteCheck(aria-labelledby="prereq-check-title")は自然にスコープ外になるはずだが、
// これを回帰テストで固定する(タスク仕様の明示要求)。
//
// 単に「実験セクションが無いページ」で試すと initCoreLoopMetrics 自体が早期リターンして
// 意味のある検証にならないため、実際の記事ページを模した「本物の実験セクション + その外に
// 置かれた PrerequisiteCheck」という構成で検証する。サニティチェックとして、実験セクション
// 内の操作は実際に発火することも確認し、テストハーネスが機能していることを担保する。

const FIXTURE: PrerequisiteCheckData = {
	prerequisiteHref: '../fixture-prereq/',
	prerequisiteTitle: 'フィクスチャ前提単元',
	questions: [
		{
			id: 'q1',
			prompt: '設問1',
			choices: [
				{ id: 'a', label: '選択肢A' },
				{ id: 'b', label: '選択肢B' },
			],
			correctChoiceId: 'a',
			source: '出典1',
			rationale: '根拠1',
		},
		{
			id: 'q2',
			prompt: '設問2',
			choices: [
				{ id: 'a', label: '選択肢A' },
				{ id: 'b', label: '選択肢B' },
			],
			correctChoiceId: 'b',
			source: '出典2',
			rationale: '根拠2',
		},
		{
			id: 'q3',
			prompt: '設問3',
			choices: [
				{ id: 'a', label: '選択肢A' },
				{ id: 'b', label: '選択肢B' },
			],
			correctChoiceId: 'a',
			source: '出典3',
			rationale: '根拠3',
		},
	],
};

function appendExperimentFixture(): void {
	const section = document.createElement('section');
	section.setAttribute('aria-labelledby', 'sanity-exp-title');
	section.innerHTML = `
		<h2 id="sanity-exp-title">実験(サニティチェック用)</h2>
		<input id="sanity-a-slider" type="range" />
	`;
	document.body.appendChild(section);
}

describe('PrerequisiteCheck は coreLoopObserver のスコープ外(experiment_interact 等を誤発火しない)', () => {
	let dispose: (() => void) | null = null;
	let gtagMock: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
	const realIntersectionObserver = globalThis.IntersectionObserver;

	beforeEach(() => {
		gtagMock = vi.fn<(...args: unknown[]) => void>();
		window.gtag = gtagMock;
		window.history.pushState({}, '', '/lessons/dummy-lesson/');
		// @ts-expect-error jsdom に IntersectionObserver が無いためテスト用スタブを注入する
		globalThis.IntersectionObserver = NoopIntersectionObserver;
		appendExperimentFixture();
	});

	afterEach(() => {
		dispose?.();
		dispose = null;
		document.body.innerHTML = '';
		delete window.gtag;
		globalThis.IntersectionObserver = realIntersectionObserver;
		vi.restoreAllMocks();
	});

	it('サニティチェック: 実験セクション内の操作は experiment_interact を発火する(ハーネスが機能している証明)', () => {
		dispose = initCoreLoopMetrics();
		const slider = document.getElementById('sanity-a-slider')!;
		slider.dispatchEvent(new Event('input', { bubbles: true }));

		const interactCalls = gtagMock.mock.calls.filter((c) => c[1] === 'experiment_interact');
		expect(interactCalls).toHaveLength(1);
	});

	it('PrerequisiteCheck 内のラジオ選択・採点ボタン操作は一切 GA4 イベントを発火しない', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);
		dispose = initCoreLoopMetrics();

		// q1 は意図的に不正解 (b) を選び、前提単元へのリンクが出る分岐まで操作を通す
		// (このテストの主眼は GA4 が発火しないことであり、正誤の分岐に関わらず検証する)。
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[0]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!);
		await user.click(screen.getByRole('button', { name: '採点する' }));
		expect(screen.getByRole('link', { name: /フィクスチャ前提単元/ })).toBeInTheDocument();

		expect(gtagMock).not.toHaveBeenCalled();
	});

	it('PrerequisiteCheck のラジオ name は "-prediction" で終わらない(prediction_start 誤発火の防止)', () => {
		render(<PrerequisiteCheck data={FIXTURE} />);
		const radios = document.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBeGreaterThan(0);
		radios.forEach((radio) => {
			expect(radio.getAttribute('name')).not.toMatch(/-prediction$/);
		});
	});

	it('PrerequisiteCheck の外枠 section は "-exp-title" で終わる aria-labelledby を持たない', () => {
		const { container } = render(<PrerequisiteCheck data={FIXTURE} />);
		const section = container.querySelector('section')!;
		expect(section.getAttribute('aria-labelledby')).not.toMatch(/-exp-title$/);
	});
});
