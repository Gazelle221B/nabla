import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initCoreLoopMetrics } from '../coreLoopObserver.js';
import { ExerciseSection } from '../../../components/lesson/ExerciseSection.js';
import type { ExerciseSectionData } from '../../exercises/types.js';

// jsdom は IntersectionObserver を実装しないため、coreLoopObserver.test.ts と同じ方針で
// 最小限のスタブを注入する。
class NoopIntersectionObserver {
	observe(): void {}
	disconnect(): void {}
	unobserve(): void {}
}

// タスク仕様(M9c): 「演習操作が experiment_interact 等に誤カウントされないこと」を固定する。
// coreLoopObserver.ts の isOperateControl は `section[aria-labelledby$="-exp-title"]` の
// 内側でのみ操作コントロールを検出するため、ExerciseSection(aria-labelledby=
// "exercise-section-title")は自然にスコープ外になるはずだが、これを回帰テストで固定する
// (src/lib/analytics/__tests__/prerequisiteCheckScope.test.tsx と同じ検証方針)。
//
// 実際の記事ページを模した「本物の実験セクション + その外に置かれた ExerciseSection」という
// 構成で検証する。サニティチェックとして、実験セクション内の操作は実際に発火することも確認し、
// テストハーネスが機能していることを担保する。

const FIXTURE: ExerciseSectionData = {
	questions: [
		{
			id: 'q1',
			prompt: '設問1',
			choices: [
				{ id: 'a', label: '選択肢A', misconception: null },
				{ id: 'b', label: '選択肢B', misconception: '誤答理由1' },
			],
			correctChoiceId: 'a',
			source: '出典1',
			rationale: '根拠1',
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

describe('ExerciseSection は coreLoopObserver のスコープ外(experiment_interact 等を誤発火しない)', () => {
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

	it('ExerciseSection 内のラジオ選択操作は一切 GA4 イベントを発火しない', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);
		dispose = initCoreLoopMetrics();

		await user.click(screen.getByRole('radio', { name: '選択肢B' }));
		await user.click(screen.getByRole('radio', { name: '選択肢A' }));

		expect(gtagMock).not.toHaveBeenCalled();
	});

	it('ExerciseSection のラジオ name は "-prediction" で終わらない(prediction_start 誤発火の防止)', () => {
		render(<ExerciseSection data={FIXTURE} />);
		const radios = document.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBeGreaterThan(0);
		radios.forEach((radio) => {
			expect(radio.getAttribute('name')).not.toMatch(/-prediction$/);
		});
	});

	it('ExerciseSection の外枠 section は "-exp-title" で終わる aria-labelledby を持たない', () => {
		const { container } = render(<ExerciseSection data={FIXTURE} />);
		const section = container.querySelector('section')!;
		expect(section.getAttribute('aria-labelledby')).not.toMatch(/-exp-title$/);
	});
});
