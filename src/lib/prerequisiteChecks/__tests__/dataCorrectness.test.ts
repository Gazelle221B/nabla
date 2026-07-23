import { describe, expect, it } from 'vitest';
import { pickCorrectChoiceId } from '../types.js';
import { trigonometricRatiosPrerequisiteCheck } from '../trigonometricRatios.js';
import { derivativeFunctionPrerequisiteCheck } from '../derivativeFunction.js';
import { permutationCombinationPrerequisiteCheck } from '../permutationCombination.js';
import { squaredDistance, type Point2 } from '../../math/pythagoras.js';
import { approximatelyZero } from '../../math/compare.js';
import { derivativeAt, tangentLine, type DifferentiableFunction } from '../../math/derivative.js';
import { theoreticalProbability, relativeFrequencies } from '../../math/probability.js';

// M9b(ADR-006)前提チェック関門データの単体テスト。
// C-7: lib/math の既存関数を独立に呼び直して期待値を再計算し(データファイル内の計算を
// そのまま再利用する自己確認にしない)、データファイルが公開する correctChoiceId と
// 突き合わせる。パイロット3単元とも「各単元3問」(ADR-006 M9b)であることも固定する。

describe('pickCorrectChoiceId', () => {
	it('正しい候補がちょうど1つならその id を返す', () => {
		const choices = [
			{ id: 'a', label: '1' },
			{ id: 'b', label: '2' },
		];
		expect(pickCorrectChoiceId(choices, (c) => c.id === 'b')).toBe('b');
	});

	it('正しい候補が0個なら例外を投げる(C-7: サイレントな誤答混入を防ぐ)', () => {
		const choices = [
			{ id: 'a', label: '1' },
			{ id: 'b', label: '2' },
		];
		expect(() => pickCorrectChoiceId(choices, () => false)).toThrow();
	});

	it('正しい候補が2個以上なら例外を投げる(問題データの矛盾を検知する)', () => {
		const choices = [
			{ id: 'a', label: '1' },
			{ id: 'b', label: '2' },
		];
		expect(() => pickCorrectChoiceId(choices, () => true)).toThrow();
	});
});

describe('trigonometricRatiosPrerequisiteCheck(前提: 三平方の定理)', () => {
	const data = trigonometricRatiosPrerequisiteCheck;

	it('パイロット単元の設問数は3問(ADR-006 M9b)', () => {
		expect(data.questions).toHaveLength(3);
	});

	it('前提単元へのリンクと表題を持つ', () => {
		expect(data.prerequisiteHref).toBe('../pythagorean-theorem/');
		expect(data.prerequisiteTitle).toBe('三平方の定理');
	});

	it('Q1: 脚3・4の斜辺は5(squaredDistance で独立に再検算)', () => {
		const hyp = Math.sqrt(squaredDistance([3, 0] as Point2, [0, 4] as Point2));
		expect(hyp).toBeCloseTo(5, 10);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('5');
	});

	it('Q2: (5,12,13) のみが a²+b²=c² を満たす(独立に再検算)', () => {
		const isValid = (a: number, b: number, c: number) => {
			const legA2 = squaredDistance([0, 0], [a, 0]);
			const legB2 = squaredDistance([0, 0], [0, b]);
			return approximatelyZero(legA2 + legB2 - c * c, Math.max(1, legA2 + legB2));
		};
		expect(isValid(5, 12, 13)).toBe(true);
		expect(isValid(5, 12, 14)).toBe(false);
		expect(isValid(6, 8, 11)).toBe(false);
		expect(isValid(2, 3, 4)).toBe(false);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('(5, 12, 13)');
	});

	it('Q3: 斜辺13・脚5のもう一方の脚は12(独立に再検算)', () => {
		const legA2 = squaredDistance([0, 0], [5, 0]);
		const missingLeg = Math.sqrt(13 * 13 - legA2);
		expect(missingLeg).toBeCloseTo(12, 10);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('12');
	});
});

describe('derivativeFunctionPrerequisiteCheck(前提: 微分係数と接線)', () => {
	const data = derivativeFunctionPrerequisiteCheck;
	const CURVE: DifferentiableFunction = { evaluate: (x) => x * x, derivative: (x) => 2 * x };

	it('パイロット単元の設問数は3問(ADR-006 M9b)', () => {
		expect(data.questions).toHaveLength(3);
	});

	it('前提単元へのリンクと表題を持つ', () => {
		expect(data.prerequisiteHref).toBe('../derivative-tangent-line/');
		expect(data.prerequisiteTitle).toBe('微分係数と接線');
	});

	it("Q1: f(x)=x² の x=3 における微分係数は6(derivativeAt で独立に再検算)", () => {
		expect(derivativeAt(CURVE, 3)).toBe(6);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('6');
	});

	it('Q2: a=-1 での割線の傾きの極限は-2(derivativeAt で独立に再検算)', () => {
		expect(derivativeAt(CURVE, -1)).toBe(-2);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('-2');
	});

	it('Q3: x=0 での接線はy=0(tangentLine で独立に再検算)', () => {
		const line = tangentLine(CURVE, 0);
		expect(line.slope).toBe(0);
		expect(line.intercept).toBe(0);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('y = 0');
	});
});

describe('permutationCombinationPrerequisiteCheck(前提: 確率 — 単純な試行と相対度数)', () => {
	const data = permutationCombinationPrerequisiteCheck;

	it('パイロット単元の設問数は3問(ADR-006 M9b)', () => {
		expect(data.questions).toHaveLength(3);
	});

	it('前提単元へのリンクと表題を持つ', () => {
		expect(data.prerequisiteHref).toBe('../simple-probability/');
		expect(data.prerequisiteTitle).toBe('確率 — 単純な試行と相対度数');
	});

	it('Q1: サイコロで1の目の理論確率は1/6(theoreticalProbability で独立に再検算)', () => {
		expect(theoreticalProbability(1, 6)).toBeCloseTo(1 / 6, 12);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('1/6');
	});

	it('Q2: 赤玉3/合計5の確率は3/5(theoreticalProbability で独立に再検算)', () => {
		expect(theoreticalProbability(3, 5)).toBeCloseTo(3 / 5, 12);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('3/5');
	});

	it('Q3: 10回中4回の相対度数は2/5(relativeFrequencies で独立に再検算)', () => {
		expect(relativeFrequencies([4, 6])[0]).toBeCloseTo(2 / 5, 12);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('2/5');
	});
});

describe('正答の位置バイアス回帰ガード(オーケストレータ指摘)', () => {
	// 全9問の正答が常に選択肢の先頭(表示順1番目)に固定されていると、学習者が
	// 「常に最初を選ぶ」だけで前提チェックを通過でき、診断力が無効化される
	// (レビューで発見された実欠陥)。ここでは全パイロット単元の全設問について、
	// 「正答が選択肢配列の何番目(0始まり)にあるか」を求め、位置が偏っていないことを
	// 固定する。将来の問題追加・並び替えでこの回帰が再発しないためのガード。
	function correctChoicePosition(question: {
		choices: readonly { id: string }[];
		correctChoiceId: string;
	}): number {
		const index = question.choices.findIndex((c) => c.id === question.correctChoiceId);
		expect(index, `correctChoiceId "${question.correctChoiceId}" が choices 内に見つからない`).toBeGreaterThanOrEqual(0);
		return index;
	}

	const allQuestions = [
		...trigonometricRatiosPrerequisiteCheck.questions,
		...derivativeFunctionPrerequisiteCheck.questions,
		...permutationCombinationPrerequisiteCheck.questions,
	];

	it('パイロット3単元・全9問が存在する(ADR-006 M9b: 各単元3問)', () => {
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
