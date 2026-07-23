import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseEntryDiagnostic } from '../CourseEntryDiagnostic.js';
import type { CourseDiagnosticData } from '../../../lib/courseDiagnostics/types.js';

const DATA: CourseDiagnosticData = {
	questions: [
		{
			id: 'q1',
			prompt: '設問1',
			choices: [
				{ id: 'a', label: '正解' },
				{ id: 'b', label: '誤答' },
			],
			correctChoiceId: 'a',
			checksUnitIndex: 0,
			source: 'test',
			rationale: 'test',
		},
		{
			id: 'q2',
			prompt: '設問2',
			choices: [
				{ id: 'a', label: '正解' },
				{ id: 'b', label: '誤答' },
			],
			correctChoiceId: 'a',
			checksUnitIndex: 1,
			source: 'test',
			rationale: 'test',
		},
	],
};

const UNITS = [
	{ href: '../unit-0/', title: '単元0' },
	{ href: '../unit-1/', title: '単元1' },
	{ href: '../unit-2/', title: '単元2' },
];

describe('CourseEntryDiagnostic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('採点前は「診断する」ボタンが無効(全問回答が必須)', () => {
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);
		expect(screen.getByRole('button', { name: '診断する' })).toBeDisabled();
	});

	it('2問とも正解すると、最後にテストした単元の次(unit2)が推奨される', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '正解' }));
		await user.click(within(groups[1]).getByRole('radio', { name: '正解' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));

		const recommendation = screen.getByRole('link', { name: /単元2/ });
		expect(recommendation).toHaveAttribute('href', '../unit-2/');
	});

	it('1問目を誤答すると unit0(checksUnitIndex=0)が推奨される', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '誤答' }));
		await user.click(within(groups[1]).getByRole('radio', { name: '正解' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));

		const recommendation = screen.getByRole('link', { name: /単元0/ });
		expect(recommendation).toHaveAttribute('href', '../unit-0/');
	});

	it('2問目のみ誤答すると unit1(checksUnitIndex=1)が推奨される', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '正解' }));
		await user.click(within(groups[1]).getByRole('radio', { name: 'わからない/自信がない' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));

		const recommendation = screen.getByRole('link', { name: /単元1/ });
		expect(recommendation).toHaveAttribute('href', '../unit-1/');
	});

	it('回答を変更すると採点結果がリセットされる(再提出が必要)', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '正解' }));
		await user.click(within(groups[1]).getByRole('radio', { name: '正解' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));
		expect(screen.getByRole('link')).toBeInTheDocument();

		await user.click(within(groups[0]).getByRole('radio', { name: '誤答' }));
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('強制ブロックしない: スキップでパネルが畳まれ、再表示でき、状態は保持される', async () => {
		const user = userEvent.setup();
		render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '正解' }));

		await user.click(screen.getByRole('button', { name: 'スキップして最初の単元から始める' }));
		expect(screen.queryByRole('heading', { name: '入口診断' })).not.toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'もう一度診断する' }));
		expect(screen.getByRole('heading', { name: '入口診断' })).toBeInTheDocument();
		// 回答状態が保持されている(アンマウントしないため)
		const groupsAfter = screen.getAllByRole('group');
		expect(within(groupsAfter[0]).getByRole('radio', { name: '正解' })).toBeChecked();
	});

	it('採点結果は aria-live で支援技術へ通知される', async () => {
		const user = userEvent.setup();
		const { container } = render(<CourseEntryDiagnostic data={DATA} units={UNITS} />);

		const groups = screen.getAllByRole('group');
		await user.click(within(groups[0]).getByRole('radio', { name: '正解' }));
		await user.click(within(groups[1]).getByRole('radio', { name: '正解' }));
		await user.click(screen.getByRole('button', { name: '診断する' }));

		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});
});
