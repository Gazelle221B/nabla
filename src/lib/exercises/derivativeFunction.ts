// 「導関数 — 微分係数から関数へ」単元末尾の演習(ADR-006 M9c パイロット)。5問固定。
// この単元自身の内容(係数の規則 n·x^(n-1)・接線の式・導関数どうしの比較)の理解を確認する。
// 前提単元(微分係数と接線)の復習ではない点が prerequisiteChecks/derivativeFunction.ts との違い。
import {
	derivativeAt,
	tangentLine,
	type DifferentiableFunction,
} from '../math/derivative.js';
import { toDifferentiableFunction, type Polynomial } from '../math/derivativeFunction.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type ExerciseChoice, type ExerciseSectionData, type ExerciseQuestion } from './types.js';

// 本文と同じ対象関数(derivative-function.mdx / DerivativeFunctionExperiment.tsx と同一)。
const SQUARE: Polynomial = [0, 0, 1]; // f(x) = x²
const CUBE: Polynomial = [0, 0, 0, 1]; // f(x) = x³
const squareFn: DifferentiableFunction = toDifferentiableFunction(SQUARE);
const cubeFn: DifferentiableFunction = toDifferentiableFunction(CUBE);

// ---- Q1: f(x)=x², a=2 の微分係数 f'(2) ----
// 正答の位置バイアス対策: 正答(id='a', "4")を2番目(表示順)に置く。
const q1TrueValue = derivativeAt(squareFn, 2); // = 4 (係数の規則 2a)

const q1Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '2',
		misconception: "f'(a)=2aという規則を、f'(a)=aと誤って覚えている(係数2を掛け忘れている)。",
	},
	{ id: 'a', label: '4', misconception: null }, // 正解
	{ id: 'c', label: '8', misconception: '係数の規則を2a²のように誤って次数を上げて計算している。' },
	{ id: 'd', label: '-4', misconception: '符号を取り違えている(2aの計算結果の符号を逆にしている)。' },
];

const q1: ExerciseQuestion = {
	id: 'derivfnex-1',
	prompt: "f(x) = x² のとき、x = 2 における微分係数(接線の傾き)f'(2) はいくつですか。",
	choices: q1Choices,
	correctChoiceId: pickCorrectChoiceId(q1Choices, (choice) => {
		const numeric = Number(choice.label);
		if (Number.isNaN(numeric)) return false;
		return approximatelyZero(numeric - q1TrueValue, Math.max(1, Math.abs(q1TrueValue)));
	}),
	source: '本文「形式的な定義」: f(x)=x² の係数の規則(x^n の導関数は n·x^(n-1))から f\'(x)=2x。',
	rationale:
		"lib/math/derivativeFunction.ts の toDifferentiableFunction([0,0,1]) を lib/math/derivative.ts の " +
		"derivativeAt に渡し、a=2 での値(=4)を検算する。",
};

// ---- Q2: f(x)=x³, a=2 の微分係数 f'(2) ----
// 正答の位置バイアス対策: 正答(id='a', "12")を3番目(表示順)に置く。
const q2TrueValue = derivativeAt(cubeFn, 2); // = 12 (係数の規則 3a²)

const q2Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '4',
		misconception: '係数の規則の係数(3)を忘れ、指数だけを1つ下げて a²=2²=4 と計算している。',
	},
	{
		id: 'c',
		label: '6',
		misconception: '指数の下げ方を誤り、3·a の1乗(3×2=6)としている(a^(n-1) ではなく a のまま)。',
	},
	{ id: 'a', label: '12', misconception: null }, // 正解
	{
		id: 'd',
		label: '24',
		misconception: '指数を1つ下げずに、元の次数のまま 3·a³=3×8=24 と計算している。',
	},
];

const q2: ExerciseQuestion = {
	id: 'derivfnex-2',
	prompt: "f(x) = x³ のとき、x = 2 における微分係数 f'(2) はいくつですか。",
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(q2Choices, (choice) => {
		const numeric = Number(choice.label);
		if (Number.isNaN(numeric)) return false;
		return approximatelyZero(numeric - q2TrueValue, Math.max(1, Math.abs(q2TrueValue)));
	}),
	source: '本文「転用問題」: f(x)=x³ の係数の規則から f\'(x)=3x²(n=3の場合)。',
	rationale:
		'lib/math/derivativeFunction.ts の toDifferentiableFunction([0,0,0,1]) を derivativeAt に渡し、' +
		'a=2 での値(=12)を検算する。',
};

// ---- Q3: f(x)=x³, a=-1 の微分係数 f'(-1) ----
// 正答の位置バイアス対策: 正答(id='a', "3")を4番目(表示順、末尾)に置く。
const q3TrueValue = derivativeAt(cubeFn, -1); // = 3 (偶数乗3x²は符号によらず非負)

const q3Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '-3',
		misconception: '偶数乗で負号が消えることを見落とし、3×(-1)=-3のように計算している。',
	},
	{ id: 'c', label: '1', misconception: '係数3を掛け忘れ、(-1)²=1だけを答えている。' },
	{ id: 'd', label: '-1', misconception: '係数3を掛け忘れた上に、符号も誤っている。' },
	{ id: 'a', label: '3', misconception: null }, // 正解
];

const q3: ExerciseQuestion = {
	id: 'derivfnex-3',
	prompt: "f(x) = x³ のとき、x = -1 における微分係数 f'(-1) はいくつですか。",
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) => {
		const numeric = Number(choice.label);
		if (Number.isNaN(numeric)) return false;
		return approximatelyZero(numeric - q3TrueValue, Math.max(1, Math.abs(q3TrueValue)));
	}),
	source: '本文「係数の規則」: f\'(x)=3x² は x の符号によらず0以上の値になる(3×(-1)²=3)。',
	rationale: 'lib/math/derivative.ts の derivativeAt(cubeFn, -1) で検算する(=3)。',
};

// ---- Q4: f(x)=x², a=1 の接線の式 ----
// 正答の位置バイアス対策: 正答(id='a')を先頭(1番目、表示順)に置く。
// 各選択肢に slope/intercept を直接持たせ、tangentLine の計算結果と内容ベースで比較する
// (id の並び順にも文字列パースにも依存しない。prerequisiteChecks/derivativeFunction.ts の
// q3Choices と同じ設計判断)。
const q4TrueLine = tangentLine(squareFn, 1); // slope=2, intercept=-1 → y = 2x - 1

const q4Candidates = [
	{ id: 'a', label: 'y = 2x - 1', slope: 2, intercept: -1 }, // 正解
	{ id: 'b', label: 'y = 2x + 1', slope: 2, intercept: 1 },
	{ id: 'c', label: 'y = x - 1', slope: 1, intercept: -1 },
	{ id: 'd', label: 'y = 2x', slope: 2, intercept: 0 },
];

const q4Choices: readonly ExerciseChoice[] = q4Candidates.map(({ id, label }) => ({
	id,
	label,
	misconception:
		id === 'b'
			? "切片の符号を取り違えている(y=f'(a)(x-a)+f(a) の展開でマイナスを見落とす)。"
			: id === 'c'
				? "傾き f'(1)=2 を、f(1)=1(接点のy座標)と取り違えている。"
				: id === 'd'
					? '接線が必ず原点を通ると誤解し、切片を0としている。'
					: null,
}));

const q4: ExerciseQuestion = {
	id: 'derivfnex-4',
	prompt: 'f(x) = x² の x = 1 における接線の式はどれですか。',
	choices: q4Choices,
	correctChoiceId: pickCorrectChoiceId(q4Choices, (choice) => {
		const found = q4Candidates.find((c) => c.id === choice.id)!;
		return found.slope === q4TrueLine.slope && found.intercept === q4TrueLine.intercept;
	}),
	source: "本文「形式的な定義」: 接線の式 y = f'(a)(x-a) + f(a)。",
	rationale: 'lib/math/derivative.ts の tangentLine(squareFn, 1) で検算する(slope=2, intercept=-1)。',
};

// ---- Q5: a=1 における f'(x)=2x と f'(x)=3x² の大小比較 ----
// 正答の位置バイアス対策: 正答(id='a')を2番目(表示順)に置く。
const q5SquareValue = derivativeAt(squareFn, 1); // = 2
const q5CubeValue = derivativeAt(cubeFn, 1); // = 3
const q5CubeIsBigger = q5CubeValue > q5SquareValue;

const q5Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: 'x²の方が大きい',
		misconception: '2と3の大小を取り違えている、または次数が高いほど微分係数が小さくなると誤解している。',
	},
	{ id: 'a', label: 'x³の方が大きい', misconception: null }, // 正解
	{
		id: 'c',
		label: '等しい',
		misconception:
			'x²とx³の導関数の式(2xと3x²)がa=1でたまたま近い値になることと、一般に等しいことを混同している。',
	},
	{
		id: 'd',
		label: 'aの値によって大小が変わるので一概に言えない',
		misconception: 'a=1という具体的な値が与えられているのに、比較を必要以上に一般化している。',
	},
];

const q5: ExerciseQuestion = {
	id: 'derivfnex-5',
	prompt:
		'f(x) = x² の導関数 f\'(x) = 2x と、f(x) = x³ の導関数 f\'(x) = 3x² について、x = 1 における' +
		'微分係数の大小関係として正しいものはどれですか。',
	choices: q5Choices,
	correctChoiceId: pickCorrectChoiceId(q5Choices, (choice) => {
		if (choice.id === 'a') return q5CubeIsBigger;
		if (choice.id === 'b') return !q5CubeIsBigger && q5SquareValue !== q5CubeValue;
		if (choice.id === 'c') return q5SquareValue === q5CubeValue;
		return false; // 'd': a=1に固定した比較であり、実測で大小は一意に決まっている
	}),
	source: '本文「形式的な定義」「転用問題」: f(x)=x²とf(x)=x³それぞれの導関数の式。',
	rationale:
		'lib/math/derivative.ts の derivativeAt を squareFn・cubeFn の両方に a=1 で適用し(=2, =3)、' +
		'実測値を直接比較する。',
};

export const derivativeFunctionExercise: ExerciseSectionData = {
	questions: [q1, q2, q3, q4, q5],
};
