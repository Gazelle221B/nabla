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
