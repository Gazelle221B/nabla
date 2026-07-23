import { describe, expect, it } from 'vitest';
import { pickCorrectChoiceId } from '../types.js';
import { trigonometricRatiosExercise } from '../trigonometricRatios.js';
import { derivativeFunctionExercise } from '../derivativeFunction.js';
import { permutationCombinationExercise } from '../permutationCombination.js';
import { unitCirclePoint, sine, cosine, tangent } from '../../math/trigonometry.js';
import { derivativeAt, tangentLine, type DifferentiableFunction } from '../../math/derivative.js';
import { permutations, combinations } from '../../math/combinatorics.js';

// M9c(ADR-006)演習データの単体テスト。
// C-7: lib/math の既存関数を独立に呼び直して期待値を再計算し(データファイル内の計算を
// そのまま再利用する自己確認にしない)、データファイルが公開する correctChoiceId と
// 突き合わせる。パイロット3単元とも「各単元5問」(ADR-006 M9c)であることも固定する。

describe('pickCorrectChoiceId(演習データの共通ヘルパー)', () => {
	it('正しい候補がちょうど1つならその id を返す', () => {
		const choices = [
			{ id: 'a', label: '1', misconception: null },
			{ id: 'b', label: '2', misconception: null },
		];
		expect(pickCorrectChoiceId(choices, (c) => c.id === 'b')).toBe('b');
	});

	it('正しい候補が0個なら例外を投げる(C-7: サイレントな誤答混入を防ぐ)', () => {
		const choices = [
			{ id: 'a', label: '1', misconception: null },
			{ id: 'b', label: '2', misconception: null },
		];
		expect(() => pickCorrectChoiceId(choices, () => false)).toThrow();
	});

	it('正しい候補が2個以上なら例外を投げる(問題データの矛盾を検知する)', () => {
		const choices = [
			{ id: 'a', label: '1', misconception: null },
			{ id: 'b', label: '2', misconception: null },
		];
		expect(() => pickCorrectChoiceId(choices, () => true)).toThrow();
	});
});

describe('trigonometricRatiosExercise(単元自身の理解確認)', () => {
	const data = trigonometricRatiosExercise;
	const DEG_TO_RAD = Math.PI / 180;

	it('パイロット単元の設問数は5問(ADR-006 M9c)', () => {
		expect(data.questions).toHaveLength(5);
	});

	it('Q1: θ=270°の単位円上の点は(0,-1)(unitCirclePointで独立に再検算)', () => {
		const [x, y] = unitCirclePoint(270 * DEG_TO_RAD);
		expect(x).toBeCloseTo(0, 10);
		expect(y).toBeCloseTo(-1, 10);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('(0, -1)');
	});

	it('Q2: tanθが定義できないのは90°のみ(0/90/180/360の中で、独立に再検算)', () => {
		const isUndefined = (deg: number) => {
			try {
				tangent(deg * DEG_TO_RAD);
				return false;
			} catch {
				return true;
			}
		};
		expect(isUndefined(0)).toBe(false);
		expect(isUndefined(90)).toBe(true);
		expect(isUndefined(180)).toBe(false);
		expect(isUndefined(360)).toBe(false);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('90°');
	});

	it('Q3: θ=40°でsin²θ+cos²θ=1(独立に再検算)', () => {
		const theta = 40 * DEG_TO_RAD;
		const value = sine(theta) ** 2 + cosine(theta) ** 2;
		expect(value).toBeCloseTo(1, 10);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('1');
	});

	it('Q4: sinθの最大値は1(0°〜360°のサンプリングで独立に再検算)', () => {
		const samples = Array.from({ length: 361 }, (_, i) => sine(i * DEG_TO_RAD));
		expect(Math.max(...samples)).toBeCloseTo(1, 8);
		const correct = data.questions[3]!.choices.find(
			(c) => c.id === data.questions[3]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('1');
	});

	it('Q5: θ=0°→90°でcosθは1から0へ単調減少する(独立に再検算)', () => {
		const degrees = [0, 15, 30, 45, 60, 75, 90];
		const samples = degrees.map((d) => cosine(d * DEG_TO_RAD));
		expect(samples[0]).toBeCloseTo(1, 10);
		expect(samples[samples.length - 1]).toBeCloseTo(0, 10);
		for (let i = 1; i < samples.length; i++) {
			expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]! + 1e-9);
		}
		const correct = data.questions[4]!.choices.find(
			(c) => c.id === data.questions[4]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('1から0へ減少する');
	});
});

describe('derivativeFunctionExercise(単元自身の理解確認)', () => {
	const data = derivativeFunctionExercise;
	const SQUARE: DifferentiableFunction = { evaluate: (x) => x * x, derivative: (x) => 2 * x };
	const CUBE: DifferentiableFunction = { evaluate: (x) => x ** 3, derivative: (x) => 3 * x * x };

	it('パイロット単元の設問数は5問(ADR-006 M9c)', () => {
		expect(data.questions).toHaveLength(5);
	});

	it("Q1: f(x)=x², a=2の微分係数は4(独立に再検算)", () => {
		expect(derivativeAt(SQUARE, 2)).toBe(4);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('4');
	});

	it("Q2: f(x)=x³, a=2の微分係数は12(独立に再検算)", () => {
		expect(derivativeAt(CUBE, 2)).toBe(12);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('12');
	});

	it("Q3: f(x)=x³, a=-1の微分係数は3(独立に再検算)", () => {
		expect(derivativeAt(CUBE, -1)).toBe(3);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('3');
	});

	it('Q4: f(x)=x², a=1の接線はy=2x-1(独立に再検算)', () => {
		const line = tangentLine(SQUARE, 1);
		expect(line.slope).toBe(2);
		expect(line.intercept).toBe(-1);
		const correct = data.questions[3]!.choices.find(
			(c) => c.id === data.questions[3]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('y = 2x - 1');
	});

	it('Q5: a=1でx³の微分係数(3)はx²の微分係数(2)より大きい(独立に再検算)', () => {
		expect(derivativeAt(CUBE, 1)).toBeGreaterThan(derivativeAt(SQUARE, 1));
		const correct = data.questions[4]!.choices.find(
			(c) => c.id === data.questions[4]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('x³の方が大きい');
	});
});

describe('permutationCombinationExercise(単元自身の理解確認)', () => {
	const data = permutationCombinationExercise;

	it('パイロット単元の設問数は5問(ADR-006 M9c)', () => {
		expect(data.questions).toHaveLength(5);
	});

	it('Q1: 8P3=336(独立に再検算)', () => {
		expect(permutations(8, 3)).toBe(336);
		const correct = data.questions[0]!.choices.find(
			(c) => c.id === data.questions[0]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('336');
	});

	it('Q2: 8C3=56(独立に再検算)', () => {
		expect(combinations(8, 3)).toBe(56);
		const correct = data.questions[1]!.choices.find(
			(c) => c.id === data.questions[1]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('56');
	});

	it('Q3: 5P2=20(独立に再検算)', () => {
		expect(permutations(5, 2)).toBe(20);
		const correct = data.questions[2]!.choices.find(
			(c) => c.id === data.questions[2]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('20');
	});

	it('Q4: 6P1=6C1=6(r=1で一致することを独立に再検算)', () => {
		expect(permutations(6, 1)).toBe(6);
		expect(combinations(6, 1)).toBe(6);
		const correct = data.questions[3]!.choices.find(
			(c) => c.id === data.questions[3]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('6P1=6C1=6(一致する)');
	});

	it('Q5: 6C4=15, 6P4=360=15×4!(独立に再検算)', () => {
		expect(combinations(6, 4)).toBe(15);
		expect(permutations(6, 4)).toBe(360);
		expect(15 * 24).toBe(360);
		const correct = data.questions[4]!.choices.find(
			(c) => c.id === data.questions[4]!.correctChoiceId,
		)!;
		expect(correct.label).toBe('360');
	});
});

describe('誤答パターン別フィードバックの構造ガード(タスク仕様)', () => {
	const allData = [trigonometricRatiosExercise, derivativeFunctionExercise, permutationCombinationExercise];

	it('全15問・全誤答選択肢に misconception(誤答理由の説明)が設定されている', () => {
		for (const section of allData) {
			for (const question of section.questions) {
				for (const choice of question.choices) {
					if (choice.id === question.correctChoiceId) {
						expect(
							choice.misconception,
							`${question.id}: 正答選択肢 "${choice.id}" の misconception は null であるべき`,
						).toBeNull();
					} else {
						expect(
							choice.misconception,
							`${question.id}: 誤答選択肢 "${choice.id}" に misconception が設定されていない`,
						).toEqual(expect.any(String));
						expect(choice.misconception!.length).toBeGreaterThan(0);
					}
				}
			}
		}
	});

	it('各設問はちょうど4択で、正答がちょうど1つ存在する', () => {
		for (const section of allData) {
			for (const question of section.questions) {
				expect(question.choices).toHaveLength(4);
				const correctCount = question.choices.filter((c) => c.id === question.correctChoiceId).length;
				expect(correctCount).toBe(1);
			}
		}
	});
});

describe('正答の位置バイアス回帰ガード(M9bの教訓を踏襲)', () => {
	// 全15問の正答が特定の位置(表示順)に偏っていると、学習者が「常に同じ位置を選ぶ」だけで
	// 演習を通過でき、理解確認としての診断力が無効化される。M9b(前提チェック)で発見された
	// 実欠陥と同種の回帰を、演習データについても最初からガードする。
	function correctChoicePosition(question: {
		choices: readonly { id: string }[];
		correctChoiceId: string;
	}): number {
		const index = question.choices.findIndex((c) => c.id === question.correctChoiceId);
		expect(index, `correctChoiceId "${question.correctChoiceId}" が choices 内に見つからない`).toBeGreaterThanOrEqual(0);
		return index;
	}

	const allQuestions = [
		...trigonometricRatiosExercise.questions,
		...derivativeFunctionExercise.questions,
		...permutationCombinationExercise.questions,
	];

	it('パイロット3単元・全15問が存在する(ADR-006 M9c: 各単元5問)', () => {
		expect(allQuestions).toHaveLength(15);
	});

	it('全問の正答インデックスが同一ではない(「常に先頭を選ぶ」だけで通過できる位置バイアスを禁止)', () => {
		const positions = allQuestions.map(correctChoicePosition);
		const uniquePositions = new Set(positions);
		expect(
			uniquePositions.size,
			`全15問の正答位置: [${positions.join(', ')}](異なる位置が2種類以上必要)`,
		).toBeGreaterThan(1);
	});

	it('正答位置が特定の1箇所に偏り過ぎていない(過半数を超えない)', () => {
		const positions = allQuestions.map(correctChoicePosition);
		const counts = new Map<number, number>();
		for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
		const maxCount = Math.max(...counts.values());
		expect(
			maxCount,
			`正答位置ごとの件数: ${JSON.stringify(Object.fromEntries(counts))}(全15問中、同一位置は過半数の8件以下であるべき)`,
		).toBeLessThanOrEqual(7);
	});
});
