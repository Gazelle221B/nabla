import { describe, expect, it } from 'vitest';
import { pickCorrectChoiceId, nearestChoiceId } from '../types.js';
import { geometryTrigonometryDiagnostic } from '../geometryTrigonometry.js';
import { derivativeCalculusDiagnostic } from '../derivativeCalculus.js';
import { probabilityCombinatoricsDiagnostic } from '../probabilityCombinatorics.js';
import { squaredDistance, type Point2 } from '../../math/pythagoras.js';
import { cosine } from '../../math/trigonometry.js';
import { lawOfCosinesSide } from '../../math/lawOfSinesCosines.js';
import { derivativeAt } from '../../math/derivative.js';
import { toDifferentiableFunction } from '../../math/derivativeFunction.js';
import { exactIntegralPoly } from '../../math/riemannSum.js';
import { theoreticalProbability } from '../../math/probability.js';
import { combinations } from '../../math/combinatorics.js';
import { expectedValue } from '../../math/probabilityDistribution.js';

// ADR-006 M9d 既定学習経路の入口診断データの単体テスト。
// C-7: lib/math の既存関数を独立に呼び直して期待値を再計算し(データファイル内の計算を
// そのまま再利用する自己確認にしない)、データファイルが公開する correctChoiceId と
// 突き合わせる。3コースとも「各コース3問」であることも固定する。

describe('pickCorrectChoiceId / nearestChoiceId', () => {
	it('pickCorrectChoiceId: 正しい候補が0個・2個以上なら例外を投げる', () => {
		const choices = [
			{ id: 'a', label: '1' },
			{ id: 'b', label: '2' },
		];
		expect(() => pickCorrectChoiceId(choices, () => false)).toThrow();
		expect(() => pickCorrectChoiceId(choices, () => true)).toThrow();
	});

	it('nearestChoiceId: trueValue に最も近い label の id を返す', () => {
		const choices = [
			{ id: 'a', label: '1' },
			{ id: 'b', label: '5' },
			{ id: 'c', label: '10' },
		];
		expect(nearestChoiceId(choices, 4.4)).toBe('b');
		expect(nearestChoiceId(choices, 0.9)).toBe('a');
	});

	it('nearestChoiceId: 空配列は例外を投げる', () => {
		expect(() => nearestChoiceId([], 1)).toThrow();
	});
});

describe('geometryTrigonometryDiagnostic(コース: 図形と三角比)', () => {
	const data = geometryTrigonometryDiagnostic;

	it('3問固定(ADR-006 M9d)、checksUnitIndex は 0,1,2', () => {
		expect(data.questions).toHaveLength(3);
		expect(data.questions.map((q) => q.checksUnitIndex)).toEqual([0, 1, 2]);
	});

	it('Q1: 脚9・12の斜辺は15(squaredDistance で独立に再検算)', () => {
		const hyp = Math.sqrt(squaredDistance([9, 0] as Point2, [0, 12] as Point2));
		expect(hyp).toBeCloseTo(15, 10);
		const correct = data.questions[0]!.choices.find((c) => c.id === data.questions[0]!.correctChoiceId)!;
		expect(correct.label).toBe('15');
	});

	it('Q2: θ=60° の cosθ は0.5に最も近い(cosine で独立に再検算)', () => {
		const cos60 = cosine((60 * Math.PI) / 180);
		expect(cos60).toBeCloseTo(0.5, 10);
		const correct = data.questions[1]!.choices.find((c) => c.id === data.questions[1]!.correctChoiceId)!;
		expect(correct.label).toBe('0.5');
	});

	it('Q3: b=7,c=8,A=60°の余弦定理の対辺は√57(≈7.55)に最も近い(lawOfCosinesSide で独立に再検算)', () => {
		const side = lawOfCosinesSide(7, 8, (60 * Math.PI) / 180);
		expect(side).toBeCloseTo(Math.sqrt(57), 10);
		const correct = data.questions[2]!.choices.find((c) => c.id === data.questions[2]!.correctChoiceId)!;
		expect(correct.label).toBe('7.6');
	});
});

describe('derivativeCalculusDiagnostic(コース: 微分と積分の考え方)', () => {
	const data = derivativeCalculusDiagnostic;
	const squareFn = toDifferentiableFunction([0, 0, 1]);
	const cubeFn = toDifferentiableFunction([0, 0, 0, 1]);

	it('3問固定(ADR-006 M9d)、checksUnitIndex は 0,1,2', () => {
		expect(data.questions).toHaveLength(3);
		expect(data.questions.map((q) => q.checksUnitIndex)).toEqual([0, 1, 2]);
	});

	it("Q1: f(x)=x² の x=3 における微分係数は6(derivativeAt で独立に再検算)", () => {
		expect(derivativeAt(squareFn, 3)).toBe(6);
		const correct = data.questions[0]!.choices.find((c) => c.id === data.questions[0]!.correctChoiceId)!;
		expect(correct.label).toBe('6');
	});

	it("Q2: f(x)=x³ の f'(2) は12(derivativeAt で独立に再検算)", () => {
		expect(derivativeAt(cubeFn, 2)).toBe(12);
		const correct = data.questions[1]!.choices.find((c) => c.id === data.questions[1]!.correctChoiceId)!;
		expect(correct.label).toBe('12');
	});

	it('Q3: f(x)=x² の [0,3] 定積分は9(exactIntegralPoly で独立に再検算)', () => {
		expect(exactIntegralPoly([0, 0, 1], 0, 3)).toBe(9);
		const correct = data.questions[2]!.choices.find((c) => c.id === data.questions[2]!.correctChoiceId)!;
		expect(correct.label).toBe('9');
	});
});

describe('probabilityCombinatoricsDiagnostic(コース: 場合の数と確率)', () => {
	const data = probabilityCombinatoricsDiagnostic;

	it('3問固定(ADR-006 M9d)、checksUnitIndex は 0,1,2', () => {
		expect(data.questions).toHaveLength(3);
		expect(data.questions.map((q) => q.checksUnitIndex)).toEqual([0, 1, 2]);
	});

	it('Q1: サイコロで偶数の目が出る理論確率は1/2(theoreticalProbability で独立に再検算)', () => {
		expect(theoreticalProbability(3, 6)).toBeCloseTo(0.5, 12);
		const correct = data.questions[0]!.choices.find((c) => c.id === data.questions[0]!.correctChoiceId)!;
		expect(correct.label).toBe('1/2');
	});

	it('Q2: 6人から3人を選ぶ組合せは20通り(combinations で独立に再検算)', () => {
		expect(combinations(6, 3)).toBe(20);
		const correct = data.questions[1]!.choices.find((c) => c.id === data.questions[1]!.correctChoiceId)!;
		expect(correct.label).toBe('20');
	});

	it('Q3: 期待値は2.3(expectedValue で独立に再検算)', () => {
		expect(expectedValue([1, 2, 3], [0.2, 0.3, 0.5])).toBeCloseTo(2.3, 10);
		const correct = data.questions[2]!.choices.find((c) => c.id === data.questions[2]!.correctChoiceId)!;
		expect(correct.label).toBe('2.3');
	});
});

describe('正答の位置バイアス回帰ガード(M9bの教訓を踏襲)', () => {
	function correctChoicePosition(question: {
		choices: readonly { id: string }[];
		correctChoiceId: string;
	}): number {
		const index = question.choices.findIndex((c) => c.id === question.correctChoiceId);
		expect(index, `correctChoiceId "${question.correctChoiceId}" が choices 内に見つからない`).toBeGreaterThanOrEqual(0);
		return index;
	}

	const allQuestions = [
		...geometryTrigonometryDiagnostic.questions,
		...derivativeCalculusDiagnostic.questions,
		...probabilityCombinatoricsDiagnostic.questions,
	];

	it('3コース・全9問が存在する(ADR-006 M9d: 各コース3問)', () => {
		expect(allQuestions).toHaveLength(9);
	});

	it('全問の正答インデックスが同一ではない(「常に先頭を選ぶ」だけで通過できる位置バイアスを禁止)', () => {
		const positions = allQuestions.map(correctChoicePosition);
		const uniquePositions = new Set(positions);
		expect(
			uniquePositions.size,
			`全9問の正答位置: [${positions.join(', ')}](異なる位置が2種類以上必要)`,
		).toBeGreaterThan(1);
	});

	it('正答位置が特定の1箇所に偏り過ぎていない(過半数を超えない)', () => {
		const positions = allQuestions.map(correctChoicePosition);
		const counts = new Map<number, number>();
		for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
		const maxCount = Math.max(...counts.values());
		expect(
			maxCount,
			`正答位置ごとの件数: ${JSON.stringify(Object.fromEntries(counts))}(全9問中、同一位置は過半数の5件以下であるべき)`,
		).toBeLessThanOrEqual(4);
	});
});
