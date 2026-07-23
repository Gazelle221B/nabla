import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExerciseSection } from '../ExerciseSection.js';
import type { ExerciseSectionData } from '../../../lib/exercises/types.js';

const FIXTURE: ExerciseSectionData = {
	questions: [
		{
			id: 'q1',
			prompt: '設問1',
			choices: [
				{ id: 'a', label: '選択肢A(正解)', misconception: null },
				{ id: 'b', label: '選択肢B(誤答)', misconception: 'よくある誤解その1' },
			],
			correctChoiceId: 'a',
			source: '出典1',
			rationale: '根拠1',
		},
		{
			id: 'q2',
			prompt: '設問2',
			choices: [
				{ id: 'a', label: '選択肢A(誤答)', misconception: 'よくある誤解その2' },
				{ id: 'b', label: '選択肢B(正解)', misconception: null },
			],
			correctChoiceId: 'b',
			source: '出典2',
			rationale: '根拠2',
		},
	],
};

describe('ExerciseSection(演習、ADR-006 M9c)', () => {
	it('正答を選ぶと即時に「正解です」が表示される', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);

		await user.click(screen.getByRole('radio', { name: '選択肢A(正解)' }));

		expect(screen.getByText('正解です。')).toBeInTheDocument();
	});

	it('誤答を選ぶと、その選択肢固有の誤答パターン(misconception)が表示される', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);

		await user.click(screen.getByRole('radio', { name: '選択肢B(誤答)' }));

		expect(screen.getByText(/正解ではありません/)).toBeInTheDocument();
		expect(screen.getByText(/よくある誤解その1/)).toBeInTheDocument();
	});

	it('選び直すとフィードバックが選び直した内容に更新される(ロックされない)', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);

		await user.click(screen.getByRole('radio', { name: '選択肢B(誤答)' }));
		expect(screen.getByText(/よくある誤解その1/)).toBeInTheDocument();

		await user.click(screen.getByRole('radio', { name: '選択肢A(正解)' }));
		expect(screen.getByText('正解です。')).toBeInTheDocument();
		expect(screen.queryByText(/よくある誤解その1/)).not.toBeInTheDocument();
	});

	it('別の設問(q2)は誤答パターンが問1と独立して表示される(誤答パターン別)', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);

		await user.click(screen.getByRole('radio', { name: '選択肢A(誤答)' })); // q2の誤答
		expect(screen.getByText(/よくある誤解その2/)).toBeInTheDocument();
		expect(screen.queryByText(/よくある誤解その1/)).not.toBeInTheDocument();
	});

	it('全問に解答すると、正解数のサマリーが表示される', async () => {
		const user = userEvent.setup();
		render(<ExerciseSection data={FIXTURE} />);

		await user.click(screen.getByRole('radio', { name: '選択肢A(正解)' }));
		expect(screen.queryByText(/問中/)).not.toBeInTheDocument();

		await user.click(screen.getByRole('radio', { name: '選択肢B(正解)' }));
		expect(screen.getByText('2問中2問正解です。')).toBeInTheDocument();
	});

	it('外枠 section の aria-labelledby は "-exp-title" で終わらない(GA4誤発火防止の前提)', () => {
		const { container } = render(<ExerciseSection data={FIXTURE} />);
		const section = container.querySelector('section')!;
		expect(section.getAttribute('aria-labelledby')).toBe('exercise-section-title');
		expect(section.getAttribute('aria-labelledby')).not.toMatch(/-exp-title$/);
	});

	it('ラジオの name は "-prediction" で終わらない(prediction_start誤発火防止の前提)', () => {
		render(<ExerciseSection data={FIXTURE} />);
		const radios = document.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBeGreaterThan(0);
		radios.forEach((radio) => {
			expect(radio.getAttribute('name')).not.toMatch(/-prediction$/);
		});
	});
});
