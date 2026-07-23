// 「場合の数 — 順列と組合せ」単元末尾の演習(ADR-006 M9c パイロット)。5問固定。
// この単元自身の内容(nPr・nCr の計算、順列と組合せの使い分け、nPr = nCr × r! の関係)の
// 理解を確認する。前提単元(確率)の復習ではない点が prerequisiteChecks/permutationCombination.ts
// との違い。本文の具体例(6P3=120, 6C3=20, 7P2=42, 5P3=60, 5C3=10)とは異なる n・r の値を使い、
// <details>の答えの暗記だけで解けないようにする。
import { permutations, combinations } from '../math/combinatorics.js';
import { pickCorrectChoiceId, type ExerciseChoice, type ExerciseSectionData, type ExerciseQuestion } from './types.js';

// ---- Q1: 8人から3人を選んで並べる(順列) ----
// 正答の位置バイアス対策: 正答(id='a', "336")を3番目(表示順)に置く。
const q1TrueValue = permutations(8, 3); // = 8×7×6 = 336

const q1Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '56',
		misconception: '順列と組合せを取り違えている(役割・順序の違いを見落とし、8C3=56を使ってしまっている)。',
	},
	{
		id: 'c',
		label: '24',
		misconception: '8×3のように単純な掛け算をしている(1人選ぶごとに選択肢が減っていくことを考慮していない)。',
	},
	{ id: 'a', label: '336', misconception: null }, // 正解
	{
		id: 'd',
		label: '512',
		misconception: '同じ人を繰り返し選べる(重複あり)と誤解し、8×8×8=512と計算している。',
	},
];

const q1: ExerciseQuestion = {
	id: 'permcombex-1',
	prompt: '8人の中から3人を選んで、1列に並べます。並べ方は何通りありますか。',
	choices: q1Choices,
	correctChoiceId: pickCorrectChoiceId(q1Choices, (choice) => {
		const numeric = Number(choice.label);
		return !Number.isNaN(numeric) && numeric === q1TrueValue;
	}),
	source: '本文「形式的な定義」: nPr = n×(n-1)×(n-2)×…×(n-r+1)。',
	rationale: 'lib/math/combinatorics.ts の permutations(8, 3) で検算する(=336)。',
};

// ---- Q2: 8人から3人を選ぶだけ(組合せ) ----
// 正答の位置バイアス対策: 正答(id='a', "56")を4番目(表示順、末尾)に置く。
const q2TrueValue = combinations(8, 3); // = 56

const q2Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '336',
		misconception: '組合せなのに順列の式(8P3)をそのまま使い、並べ方の重複(3!通り)で割っていない。',
	},
	{
		id: 'c',
		label: '112',
		misconception: '組合せの式で 3!(=6) ではなく 3 で割ってしまっている(336÷3=112)。',
	},
	{ id: 'd', label: '28', misconception: 'r=3ではなくr=2の場合(8C2=28)と混同している。' },
	{ id: 'a', label: '56', misconception: null }, // 正解
];

const q2: ExerciseQuestion = {
	id: 'permcombex-2',
	prompt: '8人の中から(並べる順番を気にせず)3人を選びます。選び方は何通りありますか。',
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(q2Choices, (choice) => {
		const numeric = Number(choice.label);
		return !Number.isNaN(numeric) && numeric === q2TrueValue;
	}),
	source: '本文「形式的な定義」: nCr = n! ÷ (r! × (n-r)!)。',
	rationale: 'lib/math/combinatorics.ts の combinations(8, 3) で検算する(=56)。',
};

// ---- Q3: 5人から2人を選んで役割(順列)を割り当てる ----
// 正答の位置バイアス対策: 正答(id='a', "20")を先頭(1番目、表示順)に置く。
const q3TrueValue = permutations(5, 2); // = 20

const q3Choices: readonly ExerciseChoice[] = [
	{ id: 'a', label: '20', misconception: null }, // 正解
	{ id: 'b', label: '10', misconception: '役割の違い(順序)を無視し、組合せ5C2=10を使ってしまっている。' },
	{ id: 'c', label: '25', misconception: '5²のように単純に掛け算(累乗)している。' },
	{
		id: 'd',
		label: '3',
		misconception:
			'5-2=3のように引き算で考えてしまっている(場合の数を数えるにはこの問題では掛け算(積の法則)が必要で、引き算では求まらない)。',
	},
];

const q3: ExerciseQuestion = {
	id: 'permcombex-3',
	prompt: '5人の部員から、部長・副部長をそれぞれ1人ずつ選びます。選び方は何通りありますか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) => {
		const numeric = Number(choice.label);
		return !Number.isNaN(numeric) && numeric === q3TrueValue;
	}),
	source:
		'本文「よくある誤解」: 役割が異なる場合(部長・副部長)は順列で数える(7人の例 7P2=42 と同じ考え方)。',
	rationale: 'lib/math/combinatorics.ts の permutations(5, 2) で検算する(=20)。',
};

// ---- Q4: r=1 のときの nPr と nCr の関係 ----
// 正答の位置バイアス対策: 正答(id='a')を2番目(表示順)に置く。
const q4TruePermutations = permutations(6, 1); // = 6
const q4TrueCombinations = combinations(6, 1); // = 6

const q4Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '6P1の方が6C1より大きい',
		misconception:
			'r≥2のときは常に順列の方が大きいという一般則を、r=1(r!=1なので一致する場合)にもそのまま当てはめている。',
	},
	{ id: 'a', label: '6P1=6C1=6(一致する)', misconception: null }, // 正解
	{
		id: 'c',
		label: '6C1の方が6P1より大きい',
		misconception: '順列と組合せの大小関係を取り違えている(一般に nPr ≧ nCr であり、逆はない)。',
	},
	{
		id: 'd',
		label: 'どちらも1(選び方は1通りしかない)',
		misconception:
			'r=1(1人を選ぶ、6人の中から選ぶので6通りある)と、r=0(何も選ばない、選び方は1通りしかない)の' +
			'場合を混同している。',
	},
];

const q4: ExerciseQuestion = {
	id: 'permcombex-4',
	prompt: '6人の中から1人を選ぶとき、6P1(並べ方)と6C1(選び方)の関係として正しいものはどれですか。',
	choices: q4Choices,
	correctChoiceId: pickCorrectChoiceId(q4Choices, (choice) => {
		if (choice.id === 'a') return q4TruePermutations === q4TrueCombinations;
		if (choice.id === 'b') return q4TruePermutations > q4TrueCombinations;
		if (choice.id === 'c') return q4TrueCombinations > q4TruePermutations;
		return false; // 'd': 実際にはどちらも6であり、1ではない
	}),
	source:
		'本文「形式的な定義」: r=0やr=1のときはr!=1なので、順列と組合せの場合の数はちょうど一致する。',
	rationale:
		'lib/math/combinatorics.ts の permutations(6, 1) と combinations(6, 1) を両方計算し(=6, =6)、' +
		'一致することを検算する。',
};

// ---- Q5: nPr = nCr × r! の関係を使った計算 ----
// 正答の位置バイアス対策: 正答(id='a', "360")を3番目(表示順)に置く。
const q5Combinations = combinations(6, 4); // = 15(問題文で既知として与える)
const q5TrueValue = permutations(6, 4); // = 360(独立に順列の式でも検算する)

const q5Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '60',
		misconception: 'r!(4!=24)ではなくr(4)をそのまま掛けている(15×4=60)。',
	},
	{ id: 'c', label: '39', misconception: '掛け算(×r!)ではなく足し算をしている(15+24=39)。' },
	{ id: 'a', label: '360', misconception: null }, // 正解
	{
		id: 'd',
		label: '15',
		misconception: '組合せの数(15)がそのまま順列の数と同じだと誤解している(役割・順序の違いを見落としている)。',
	},
];

const q5: ExerciseQuestion = {
	id: 'permcombex-5',
	prompt:
		'6人から4人を選ぶ組合せの数は15通りです。このとき、6人から4人を選んで並べる順列の数は' +
		'何通りですか(公式 nPr = nCr × r! を使って求めてください)。',
	choices: q5Choices,
	correctChoiceId: pickCorrectChoiceId(q5Choices, (choice) => {
		const numeric = Number(choice.label);
		return !Number.isNaN(numeric) && numeric === q5TrueValue;
	}),
	source: '本文「形式的な定義」: nPr = nCr × r!(選んでから並べる、という2段階に分けて数える)。',
	rationale:
		'lib/math/combinatorics.ts の combinations(6, 4)=15(問題文の前提と一致することも確認済み)と ' +
		'permutations(6, 4)=360 を独立に計算し、15×4!(=24)=360 と一致することで nPr=nCr×r! の関係を検算する。',
};

if (q5Combinations !== 15) {
	// C-7: 問題文が前提とする「6人から4人を選ぶ組合せは15通り」という主張自体が誤りなら、
	// サイレントに間違った問題を出さずビルド時に例外にする。
	throw new Error(
		`permutationCombination exercise: combinations(6, 4) = ${q5Combinations}, expected 15. ` +
			'Update the question text or check combinatorics.ts.',
	);
}

export const permutationCombinationExercise: ExerciseSectionData = {
	questions: [q1, q2, q3, q4, q5],
};
