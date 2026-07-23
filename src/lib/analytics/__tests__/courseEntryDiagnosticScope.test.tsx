import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initCoreLoopMetrics } from '../coreLoopObserver.js';
import { initPredictionHistoryRecorder } from '../predictionHistoryRecorder.js';
import { CourseEntryDiagnostic } from '../../../components/course/CourseEntryDiagnostic.js';
import type { CourseDiagnosticData } from '../../courseDiagnostics/types.js';

// ADR-006 M9d: CourseEntryDiagnostic(既定学習経路の入口診断)の操作が GA4 中核ループ計測
// (M9a coreLoopObserver.ts)・予想履歴(M9c predictionHistoryRecorder.ts)のどちらにも
// 誤カウントされないことを固定する。PrerequisiteCheck(M9b)の
// prerequisiteCheckScope.test.tsx と同じ方針だが、この診断は /courses/{slug}/ という
// 単元ページ以外の URL にのみ置かれるため、まず「URL そのものが /lessons/{slug}/ でない」
// ことによる早期リターンを検証し(一次防御)、次に構造的なスコープ外(二次防御、念のため)も
// 確認する。

class NoopIntersectionObserver {
	observe(): void {}
	disconnect(): void {}
	unobserve(): void {}
}

const FIXTURE: CourseDiagnosticData = {
	questions: [
		{
			id: 'q1',
			prompt: '設問1',
			choices: [
				{ id: 'a', label: '選択肢A' },
				{ id: 'b', label: '選択肢B' },
			],
			correctChoiceId: 'a',
			checksUnitIndex: 0,
			source: '出典1',
			rationale: '根拠1',
		},
	],
};

const UNITS = [
	{ href: '../unit-0/', title: '単元0' },
	{ href: '../unit-1/', title: '単元1' },
];

describe('CourseEntryDiagnostic は GA4(coreLoopObserver)・予想履歴(predictionHistoryRecorder)のスコープ外', () => {
	let disposeMetrics: (() => void) | null = null;
	let disposeHistory: (() => void) | null = null;
	let gtagMock: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
	const realIntersectionObserver = globalThis.IntersectionObserver;

	beforeEach(() => {
		gtagMock = vi.fn<(...args: unknown[]) => void>();
		window.gtag = gtagMock;
		// /courses/{slug}/ は getUnitSlug() が対象とする /lessons/{slug}/ パターンに一致しない。
		window.history.pushState({}, '', '/courses/geometry-and-trigonometry/');
		// @ts-expect-error jsdom に IntersectionObserver が無いためテスト用スタブを注入する
		globalThis.IntersectionObserver = NoopIntersectionObserver;
		try {
			window.localStorage.clear();
		} catch {
			// jsdom の localStorage ポリフィル状況に依存しないよう握りつぶす(vitest.setup.ts 参照)。
		}
	});

	afterEach(() => {
		disposeMetrics?.();
		disposeMetrics = null;
		disposeHistory?.();
		disposeHistory = null;
		document.body.innerHTML = '';
		delete window.gtag;
		globalThis.IntersectionObserver = realIntersectionObserver;
		vi.restoreAllMocks();
	});

	it('一次防御: /courses/ URL では initCoreLoopMetrics 自体が早期リターンする(null)', () => {
		disposeMetrics = initCoreLoopMetrics();
		expect(disposeMetrics).toBeNull();
	});

	it('一次防御: /courses/ URL では initPredictionHistoryRecorder 自体が早期リターンする(null)', () => {
		disposeHistory = initPredictionHistoryRecorder();
		expect(disposeHistory).toBeNull();
	});

	it('CourseEntryDiagnostic 内のラジオ選択・診断ボタン操作は GA4 イベントを一切発火しない', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={FIXTURE} units={UNITS} />);
		disposeMetrics = initCoreLoopMetrics();
		disposeHistory = initPredictionHistoryRecorder();

		await user.click(screen.getByRole('radio', { name: '選択肢A' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));
		expect(screen.getByRole('link', { name: /単元1/ })).toBeInTheDocument();

		expect(gtagMock).not.toHaveBeenCalled();
	});

	it('二次防御: CourseEntryDiagnostic のラジオ name は "-prediction" で終わらない', () => {
		render(<CourseEntryDiagnostic data={FIXTURE} units={UNITS} />);
		const radios = document.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBeGreaterThan(0);
		radios.forEach((radio) => {
			expect(radio.getAttribute('name')).not.toMatch(/-prediction$/);
		});
	});

	it('二次防御: CourseEntryDiagnostic の外枠 section は "-exp-title" で終わる aria-labelledby を持たない', () => {
		const { container } = render(<CourseEntryDiagnostic data={FIXTURE} units={UNITS} />);
		const section = container.querySelector('section')!;
		expect(section.getAttribute('aria-labelledby')).not.toMatch(/-exp-title$/);
	});

	it('診断確定ボタンの文言は予想確定ボタン("予想を確定して実験する")と異なる(誤爆防止)', () => {
		render(<CourseEntryDiagnostic data={FIXTURE} units={UNITS} />);
		expect(screen.queryByRole('button', { name: '予想を確定して実験する' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '診断する' })).toBeInTheDocument();
	});
});
