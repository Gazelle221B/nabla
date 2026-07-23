import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrerequisiteCheck } from '../PrerequisiteCheck.js';
import type { PrerequisiteCheckData } from '../../../lib/prerequisiteChecks/types.js';

// ADR-006 M9b の PrerequisiteCheck Island の結合テスト。実データ(trigonometricRatios 等)を
// 直接使わず、grading ロジック自体を検証する最小のフィクスチャデータを使う(データ内容の
// 数学的正しさは src/lib/prerequisiteChecks/__tests__/dataCorrectness.test.ts で別途固定する)。

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

describe('PrerequisiteCheck', () => {
	it('3問すべて表示し、採点ボタンは未回答の間は無効', () => {
		render(<PrerequisiteCheck data={FIXTURE} />);
		expect(screen.getByRole('heading', { name: '前提チェック' })).toBeInTheDocument();
		expect(screen.getAllByRole('group')).toHaveLength(3);
		expect(screen.getByRole('button', { name: '採点する' })).toBeDisabled();
	});

	it('全問回答すると採点ボタンが有効になり、未回答のままでは採点結果が出ない', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[0]!);
		expect(screen.getByRole('button', { name: '採点する' })).toBeDisabled();

		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!);
		expect(screen.getByRole('button', { name: '採点する' })).toBeEnabled();
	});

	it('全問正解すると前提単元へのリンクは出ず、肯定メッセージが出る', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[0]!); // q1: 正解
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!); // q2: 正解
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!); // q3: 正解
		await user.click(screen.getByRole('button', { name: '採点する' }));

		expect(screen.getByText(/3問とも正解でした/)).toBeInTheDocument();
		expect(
			screen.queryByRole('link', { name: /フィクスチャ前提単元/ }),
		).not.toBeInTheDocument();
	});

	it('不正解が1問でもあれば前提単元へのリンクを提示する', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[0]!); // q1: 不正解 (正解はa)
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!); // q2: 正解
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!); // q3: 正解
		await user.click(screen.getByRole('button', { name: '採点する' }));

		const link = screen.getByRole('link', { name: /フィクスチャ前提単元/ });
		expect(link).toHaveAttribute('href', '../fixture-prereq/');
		expect(screen.getByText(/前提知識が不足しているかもしれません/)).toBeInTheDocument();
	});

	it('「わからない/自信がない」を選ぶと不正解と同様に前提単元へのリンクが出る', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getAllByRole('radio', { name: 'わからない/自信がない' })[0]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!);
		await user.click(screen.getByRole('button', { name: '採点する' }));

		expect(screen.getByRole('link', { name: /フィクスチャ前提単元/ })).toBeInTheDocument();
	});

	it('スキップすると本文へ進めるよう内容が畳まれ、再表示できる(強制ブロックしない)', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getByRole('button', { name: 'スキップして本文へ進む' }));
		expect(screen.queryByRole('heading', { name: '前提チェック' })).not.toBeInTheDocument();
		expect(screen.getByText(/スキップしました/)).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'もう一度確認する' }));
		expect(screen.getByRole('heading', { name: '前提チェック' })).toBeInTheDocument();
	});

	it('選択をやり直すと採点結果がリセットされる(古い判定が残らない)', async () => {
		const user = userEvent.setup();
		render(<PrerequisiteCheck data={FIXTURE} />);

		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[0]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[1]!);
		await user.click(screen.getAllByRole('radio', { name: '選択肢A' })[2]!);
		await user.click(screen.getByRole('button', { name: '採点する' }));
		expect(screen.getByText(/3問とも正解でした/)).toBeInTheDocument();

		await user.click(screen.getAllByRole('radio', { name: '選択肢B' })[0]!);
		expect(screen.queryByText(/3問とも正解でした/)).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '採点する' })).toBeEnabled();
	});
});
