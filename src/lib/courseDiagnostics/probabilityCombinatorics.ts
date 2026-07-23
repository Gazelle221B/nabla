// コース「場合の数と確率」(ADR-006 M9d)の入口診断。
// コースの単元順: [確率(単純な試行と相対度数), 場合の数(順列と組合せ), 確率分布, 正規分布・
// 中心極限定理](実 DAG のエッジ simple-probability → permutation-combination /
// probability-distribution → normal-distribution-clt に沿う。詳細な選定根拠は
// src/lib/courses/data.ts のコメントを参照)。
//
// 3問で単元0〜2の内容を確認する(checksUnitIndex)。値はすべて厳密一致(整数・単純小数)に
// なるよう例を選び、prerequisiteChecks/permutationCombination.ts が使う具体例とは別の数値を
// 用いて暗記による通過を避ける。
import { theoreticalProbability } from '../math/probability.js';
import { combinations } from '../math/combinatorics.js';
import { expectedValue } from '../math/probabilityDistribution.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type CourseDiagnosticData, type CourseDiagnosticQuestion } from './types.js';

// ---- Q1 (checksUnitIndex=0, 確率): サイコロで偶数の目が出る理論確率 ----
const q1TrueValue = theoreticalProbability(3, 6); // = 0.5 (偶数の目は2,4,6の3通り/6通り)

const q1Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '1/3' },
	{ id: 'a', label: '1/2' }, // 正解(表示順2番目)
	{ id: 'c', label: '1/6' },
	{ id: 'd', label: '2/3' },
];

const q1: CourseDiagnosticQuestion = {
	id: 'course-prob-1',
	prompt: '1つのサイコロを1回振るとき、出た目が偶数(2, 4, 6のいずれか)である理論確率はいくつですか。',
	choices: q1Choices,
	correctChoiceId: pickCorrectChoiceId(q1Choices, (choice) => {
		const parts = choice.label.split('/').map(Number);
		const numeric = parts.length === 2 ? parts[0]! / parts[1]! : Number(choice.label);
		return approximatelyZero(numeric - q1TrueValue, 1);
	}),
	checksUnitIndex: 0,
	source: '単元「確率 — 単純な試行と相対度数」: 理論確率 = 有利な場合の数 ÷ すべての場合の数。',
	rationale: 'lib/math/probability.ts の theoreticalProbability(3, 6) を検算し、1/2 に一致する選択肢を正解とする。',
};

// ---- Q2 (checksUnitIndex=1, 場合の数): 6人から3人を選ぶ組合せ 6C3 ----
const q2TrueValue = combinations(6, 3); // = 20

const q2Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '18' },
	{ id: 'c', label: '120' }, // 順列 6P3 との混同を狙った誤答
	{ id: 'a', label: '20' }, // 正解(表示順3番目)
	{ id: 'd', label: '6' },
];

const q2: CourseDiagnosticQuestion = {
	id: 'course-prob-2',
	prompt: '6人から3人を選ぶ(並べない、選ぶだけの)組合せは何通りですか。',
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(q2Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q2TrueValue, Math.max(1, q2TrueValue)),
	),
	checksUnitIndex: 1,
	source: '単元「場合の数 — 順列と組合せ」: 組合せの総数 nCr = n! ÷ (r!×(n−r)!)。',
	rationale: 'lib/math/combinatorics.ts の combinations(6, 3) を検算し、20 に一致する選択肢を正解とする。',
};

// ---- Q3 (checksUnitIndex=2, 確率分布): 期待値 E[X] ----
const q3Values = [1, 2, 3];
const q3Probs = [0.2, 0.3, 0.5];
const q3TrueValue = expectedValue(q3Values, q3Probs); // = 1*0.2+2*0.3+3*0.5 = 2.3

const q3Choices: readonly { id: string; label: string }[] = [
	{ id: 'a', label: '2.3' }, // 正解(表示順1番目)
	{ id: 'b', label: '2' },
	{ id: 'c', label: '1.8' },
	{ id: 'd', label: '3' },
];

const q3: CourseDiagnosticQuestion = {
	id: 'course-prob-3',
	prompt: '確率変数 X が値 1, 2, 3 をそれぞれ確率 0.2, 0.3, 0.5 でとるとき、期待値 E[X] はいくつですか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q3TrueValue, 1),
	),
	checksUnitIndex: 2,
	source: '単元「確率分布」: 期待値 E[X] = Σ(値 × 確率)。',
	rationale:
		'lib/math/probabilityDistribution.ts の expectedValue([1,2,3], [0.2,0.3,0.5]) を検算し、' +
		'2.3 に一致する選択肢を正解とする。',
};

export const probabilityCombinatoricsDiagnostic: CourseDiagnosticData = {
	questions: [q1, q2, q3],
};
