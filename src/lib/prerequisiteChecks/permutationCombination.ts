// 「場合の数 — 順列と組合せ」冒頭の前提チェック(ADR-006 M9b パイロット)。
// 前提単元: probability/simple-probability(確率 — 単純な試行と相対度数)。
// この単元は「同様に確からしい場合の確率 = 有利な場合の数 ÷ 全体の場合の数」を前提に、
// 場合の数(順列・組合せ)という数え方の道具を導入する。設問は simple-probability.mdx の
// 定義式・具体例(サイコロ、相対度数)をそのまま数値だけ変えて再利用する(C-5 の慎重さ)。
import { theoreticalProbability, relativeFrequencies } from '../math/probability.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type PrerequisiteCheckData, type PrerequisiteQuestion } from './types.js';

function approxEqual(a: number, b: number): boolean {
	return approximatelyZero(a - b, Math.max(1, Math.abs(b)));
}

const q1Value = theoreticalProbability(1, 6); // = 1/6(サイコロで1の目)

// 正答の位置バイアス対策(オーケストレータ指摘): 正答(id='a', 1/6)を配列の末尾
// (4番目、表示順)に置く。id と数値の対応は保ったまま並び順のみ変える
// (pickCorrectChoiceId は順序非依存)。
const q1Choices = [
	{ id: 'b', label: '1/3', value: 1 / 3 },
	{ id: 'c', label: '1/2', value: 1 / 2 },
	{ id: 'd', label: '1', value: 1 },
	{ id: 'a', label: '1/6', value: 1 / 6 },
];

const q1: PrerequisiteQuestion = {
	id: 'permcomb-prereq-1',
	prompt: 'サイコロ(6面)を1回振るとき、「1の目が出る」理論確率はいくつですか。',
	choices: q1Choices.map(({ id, label }) => ({ id, label })),
	correctChoiceId: pickCorrectChoiceId(
		q1Choices.map(({ id, label }) => ({ id, label })),
		(choice) => approxEqual(q1Choices.find((c) => c.id === choice.id)!.value, q1Value),
	),
	source:
		'前提単元「確率 — 単純な試行と相対度数」: 確率 = 事柄が起こる場合の数 ÷ 起こりうるすべての場合の数(サイコロの例と同一)。',
	rationale: 'lib/math/probability.ts の theoreticalProbability(1, 6) を検算に使う(= 1/6)。',
};

const q2Value = theoreticalProbability(3, 5); // = 3/5(赤玉3個・合計5個から赤玉を引く確率)

const q2Choices = [
	{ id: 'a', label: '3/5', value: 3 / 5 },
	{ id: 'b', label: '2/5', value: 2 / 5 },
	{ id: 'c', label: '1/5', value: 1 / 5 },
	{ id: 'd', label: '1/2', value: 1 / 2 },
];

const q2: PrerequisiteQuestion = {
	id: 'permcomb-prereq-2',
	prompt: '赤玉3個・青玉2個(合計5個)が入った袋から1個取り出すとき、赤玉を取り出す確率はいくつですか。',
	choices: q2Choices.map(({ id, label }) => ({ id, label })),
	correctChoiceId: pickCorrectChoiceId(
		q2Choices.map(({ id, label }) => ({ id, label })),
		(choice) => approxEqual(q2Choices.find((c) => c.id === choice.id)!.value, q2Value),
	),
	source: '前提単元「確率 — 単純な試行と相対度数」: 「同様に確からしい」場合の確率の定義。',
	rationale: 'lib/math/probability.ts の theoreticalProbability(3, 5) を検算に使う(= 3/5)。',
};

// simple-probability.mdx の具体例(サイコロ10回・1の目2回で相対度数0.2)と同じ形式で、
// 数値だけ変えた具体例(10回中4回)を使う。
const q3Frequencies = relativeFrequencies([4, 6]); // [1の目が出た回数, それ以外の回数] = [4, 6]
const q3Value = q3Frequencies[0]!; // = 0.4 = 2/5

// 正答の位置バイアス対策(オーケストレータ指摘): 正答(id='a', 2/5)を配列の3番目
// (表示順)に置く。
const q3Choices = [
	{ id: 'b', label: '1/6', value: 1 / 6 },
	{ id: 'c', label: '4/6', value: 4 / 6 },
	{ id: 'a', label: '2/5', value: 2 / 5 },
	{ id: 'd', label: '10/4', value: 10 / 4 },
];

const q3: PrerequisiteQuestion = {
	id: 'permcomb-prereq-3',
	prompt: 'サイコロを10回振って「1の目」が4回出たとき、1の目の相対度数はいくつですか。',
	choices: q3Choices.map(({ id, label }) => ({ id, label })),
	correctChoiceId: pickCorrectChoiceId(
		q3Choices.map(({ id, label }) => ({ id, label })),
		(choice) => approxEqual(q3Choices.find((c) => c.id === choice.id)!.value, q3Value),
	),
	source: '前提単元「確率 — 単純な試行と相対度数」: 相対度数 = 実際に起こった回数 ÷ 試行した回数。',
	rationale:
		'lib/math/probability.ts の relativeFrequencies([4, 6])[0] を検算に使う(= 0.4 = 2/5)。' +
		'度数配列は [1の目の回数, それ以外の回数] = [4, 6](合計10回)として構成する。',
};

export const permutationCombinationPrerequisiteCheck: PrerequisiteCheckData = {
	prerequisiteHref: '../simple-probability/',
	prerequisiteTitle: '確率 — 単純な試行と相対度数',
	questions: [q1, q2, q3],
};
