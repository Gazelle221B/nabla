import { describe, expect, it } from 'vitest';
import { pickCorrectChoiceId, nearestChoiceId, roundToDecimal } from '../types.js';
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

	// 数学QA指摘(2026-07-24、course-geo-trig-3): √57≈7.549834… を「約7.55」経由でさらに
	// 丸めて「7.6」と手書きする二重丸めの事故が実際に起きた。roundToDecimal は常に
	// 一度だけ丸めることを固定する回帰テスト。
	describe('roundToDecimal: 一度だけ丸める(二重丸め防止の回帰ガード)', () => {
		it('√57(=7.549834…)を小数第1位へ丸めると7.5になる(7.6ではない)', () => {
			const value = Math.sqrt(57);
			expect(roundToDecimal(value, 1)).toBeCloseTo(7.5, 10);
			expect(roundToDecimal(value, 1).toFixed(1)).toBe('7.5');
		});

		it('通常の四捨五入として機能する(0桁・1桁・2桁)', () => {
			expect(roundToDecimal(2.5, 0)).toBe(3);
			expect(roundToDecimal(1.25, 1)).toBeCloseTo(1.3, 10);
			// 1.005 のような境界値は2進浮動小数点の表現誤差(1.005 は実際には
			// 1.00499999999999989…)により四捨五入の境界例としては不適切なため避ける
			// (roundToDecimal自体の欠陥ではなくJSの数値表現の性質)。
			expect(roundToDecimal(1.234, 2)).toBeCloseTo(1.23, 10);
			expect(roundToDecimal(1.236, 2)).toBeCloseTo(1.24, 10);
		});

		it('二重丸めの温床になる「中間丸め値をさらに丸める」呼び出し方はしない(直接 value を渡すことの確認)', () => {
			// 7.549834… を先に「7.55」へ丸めてから再度丸めると7.6になってしまう
			// (これが実際に起きたバグの再現)。roundToDecimal は生の値を直接渡す限り
			// 常に単一の丸めで7.5になることを固定する。
			const raw = Math.sqrt(57);
			const doubleRounded = roundToDecimal(roundToDecimal(raw, 2), 1);
			const singleRounded = roundToDecimal(raw, 1);
			expect(doubleRounded).toBeCloseTo(7.6, 10); // 二重丸めなら誤って7.6になる例の再現
			expect(singleRounded).toBeCloseTo(7.5, 10); // 単一丸めが正しい(7.5)
		});

		it('非有限値・不正な decimals は例外を投げる', () => {
			expect(() => roundToDecimal(Number.NaN, 1)).toThrow();
			expect(() => roundToDecimal(Infinity, 1)).toThrow();
			expect(() => roundToDecimal(1, -1)).toThrow();
			expect(() => roundToDecimal(1, 1.5)).toThrow();
		});
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

	it('Q3: b=7,c=8,A=60°の余弦定理の対辺は√57(=7.549834…、単一丸めで7.5)に最も近い(lawOfCosinesSide で独立に再検算)', () => {
		const side = lawOfCosinesSide(7, 8, (60 * Math.PI) / 180);
		expect(side).toBeCloseTo(Math.sqrt(57), 10);
		// 単一丸め(roundToDecimal)の結果が7.5であることを独立に固定する(7.6は二重丸めの誤り)。
		expect(roundToDecimal(side, 1).toFixed(1)).toBe('7.5');
		const correct = data.questions[2]!.choices.find((c) => c.id === data.questions[2]!.correctChoiceId)!;
		expect(correct.label).toBe('7.5');
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

	it("Q2: f(x)=x³ の導関数の式は「3x²」(5つの独立な標本点で derivativeAt と再検算、C-7)", () => {
		// データファイル内の判定(5点: -2,-1,0.5,1.5,2.5)とは独立に、別の5点でも
		// candidate=3x² が derivativeAt(cubeFn, x) と一致し、distractor(x², 3x, x³/3)は
		// 一致しないことを確認する(自己確認的な検証にしない、C-7)。
		const independentSamplePoints = [-3, -0.5, 0.25, 1, 4];
		const candidates: Record<string, (x: number) => number> = {
			correct: (x) => 3 * x * x,
			forgotCoefficient: (x) => x * x,
			overReducedExponent: (x) => 3 * x,
			confusedWithIntegral: (x) => (x * x * x) / 3,
		};
		for (const x of independentSamplePoints) {
			const trueValue = derivativeAt(cubeFn, x);
			expect(candidates.correct!(x)).toBeCloseTo(trueValue, 10);
		}
		// distractor は少なくともどこかの標本点で不一致になる(=全点一致はしない)。
		for (const key of ['forgotCoefficient', 'overReducedExponent', 'confusedWithIntegral'] as const) {
			const mismatches = independentSamplePoints.filter(
				(x) => Math.abs(candidates[key]!(x) - derivativeAt(cubeFn, x)) > 1e-9,
			);
			expect(mismatches.length, `${key} は全点で一致してはならない`).toBeGreaterThan(0);
		}

		const correct = data.questions[1]!.choices.find((c) => c.id === data.questions[1]!.correctChoiceId)!;
		expect(correct.label).toBe('3x²');
	});

	it('Q1とQ2は異なる観点(1点の微分係数の値 vs 導関数そのものの式)を問い、設問文が重複しない', () => {
		expect(data.questions[0]!.prompt).not.toBe(data.questions[1]!.prompt);
		expect(data.questions[0]!.prompt).toMatch(/微分係数.*f'\(3\)/);
		expect(data.questions[1]!.prompt).toMatch(/導関数.*式として/);
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
