// コース「微分と積分の考え方」(ADR-006 M9d)の入口診断。
// コースの単元順: [微分係数と接線, 導関数, 定積分と面積, 偏微分](実 DAG のエッジ
// derivative-tangent-line → derivative-function → definite-integral-area / surface-partial-derivative
// に沿う。詳細な選定根拠は src/lib/courses/data.ts のコメントを参照)。
//
// 3問で単元0〜2の内容を確認する(checksUnitIndex)。値はすべて整数になるよう関数・評価点を
// 選び(exercises/derivativeFunction.ts と同じ流儀)、approximatelyZero による厳密一致判定を使う。
import { derivativeAt } from '../math/derivative.js';
import { toDifferentiableFunction, type Polynomial } from '../math/derivativeFunction.js';
import { exactIntegralPoly } from '../math/riemannSum.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type CourseDiagnosticData, type CourseDiagnosticQuestion } from './types.js';

const SQUARE: Polynomial = [0, 0, 1]; // f(x) = x²
const CUBE: Polynomial = [0, 0, 0, 1]; // f(x) = x³
const squareFn = toDifferentiableFunction(SQUARE);
const cubeFn = toDifferentiableFunction(CUBE);

// ---- Q1 (checksUnitIndex=0, 微分係数と接線): f(x)=x², x=3 における微分係数 ----
const q1TrueValue = derivativeAt(squareFn, 3); // = 6 (2x, x=3)

const q1Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '3' },
	{ id: 'a', label: '6' }, // 正解(表示順2番目)
	{ id: 'c', label: '9' },
	{ id: 'd', label: '-6' },
];

const q1: CourseDiagnosticQuestion = {
	id: 'course-deriv-1',
	prompt: 'f(x) = x² のとき、x = 3 における微分係数(接線の傾き)f\'(3) はいくつですか。',
	choices: q1Choices,
	correctChoiceId: pickCorrectChoiceId(q1Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q1TrueValue, Math.max(1, Math.abs(q1TrueValue))),
	),
	checksUnitIndex: 0,
	source: '単元「微分係数と接線」: f\'(x) = lim(h→0) (f(x+h)−f(x))/h。f(x)=x² では f\'(x)=2x。',
	rationale:
		'lib/math/derivativeFunction.ts の toDifferentiableFunction([0,0,1]) を lib/math/derivative.ts の ' +
		'derivativeAt に渡し、x=3 での値(=6)を検算する。',
};

// ---- Q2 (checksUnitIndex=1, 導関数): f(x)=x³ の導関数の式はどれか ----
// 学習設計指摘(2026-07-24): 旧版は「f(x)=x³, x=2 の微分係数はいくつか」という、Q1
// (f(x)=x², x=3 の微分係数)と実質同型の設問だった(単元「導関数」固有の内容——微分係数
// という1点の数値ではなく、それを集めた「関数」として導関数を捉える考え方——を確認できて
// いなかった)。「式そのもの」を問う設問へ変更する。
//
// 正誤判定はハードコードした式比較(choice.id === 'a' 等)ではなく、各選択肢を実際の関数
// (JS の (x:number)=>number)として、複数の標本点で lib/math の係数規則
// (derivativeAt、cubeFn = x³ の真の導関数)による値と突き合わせる(C-7: 自己確認的な検証を
// 禁止——1点だけの一致は偶然の可能性が排除できないため、5つの相異なる標本点すべてで
// 一致することを要求する。真の導関数・全候補式はいずれも次数3以下の多項式であり、
// 「次数n以下の相異なる2つの多項式は高々n個の点でしか一致しない」という代数学の基本定理の
// 帰結により、5点全てで一致する候補は真の導関数と恒等的に等しいことが数学的に保証される)。
const q2SamplePoints: readonly number[] = [-2, -1, 0.5, 1.5, 2.5]; // 0 と 1 は複数の候補式が
// 偶然一致しうる退化点(x=0: 全候補が0、x=1: 3x²と3xが3で一致)のため意図的に外す
// (退化点だけで判定すると誤って複数正解扱いになりうるため——実際に候補設計時に検出し、
// 標本点から除外する対処を選んだ)。

type Q2CandidateId = 'a' | 'b' | 'c' | 'd';

// 候補式(いずれも「指数を1つ下げて係数を掛ける」係数規則の適用を誤ったよくある間違いを
// 再現する): b=係数3を掛け忘れ、c=指数をさらに1つ余計に下げている、d=微分ではなく
// 積分の公式(xⁿ⁺¹/(n+1))と混同している。
const q2Candidates: Readonly<Record<Q2CandidateId, (x: number) => number>> = {
	a: (x) => 3 * x * x, // 3x²(正解)
	b: (x) => x * x, // x²
	c: (x) => 3 * x, // 3x
	d: (x) => (x * x * x) / 3, // x³/3
};

function matchesTrueDerivativeOfCube(candidate: (x: number) => number): boolean {
	return q2SamplePoints.every((x) => {
		const trueValue = derivativeAt(cubeFn, x);
		return approximatelyZero(candidate(x) - trueValue, Math.max(1, Math.abs(trueValue)));
	});
}

const Q2_LABELS: Readonly<Record<Q2CandidateId, string>> = {
	a: '3x²',
	b: 'x²',
	c: '3x',
	d: 'x³/3',
};

// 正答の位置バイアス対策: 正答('a')を表示順3番目に置く。
const q2ChoiceOrder: readonly Q2CandidateId[] = ['b', 'd', 'a', 'c'];
const q2Choices: readonly { id: string; label: string }[] = q2ChoiceOrder.map((id) => ({
	id,
	label: Q2_LABELS[id],
}));

const q2: CourseDiagnosticQuestion = {
	id: 'course-deriv-2',
	prompt: 'f(x) = x³ の導関数 f\'(x) の式として正しいものはどれですか。',
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(q2Choices, (choice) =>
		matchesTrueDerivativeOfCube(q2Candidates[choice.id as Q2CandidateId]),
	),
	checksUnitIndex: 1,
	source:
		'単元「導関数」: 各点の微分係数(接線の傾き)を集めると、元の関数 f(x) とは別の関数(導関数 f\'(x))になる。' +
		'係数の規則(xⁿ の導関数は n·xⁿ⁻¹)から f(x)=x³ の f\'(x)=3x²。',
	rationale:
		'各選択肢を関数として、5つの相異なる標本点(-2, -1, 0.5, 1.5, 2.5)すべてで ' +
		'lib/math/derivative.ts の derivativeAt(cubeFn, x)(coefficient rule による真の導関数)と' +
		'一致するかを検証する(次数3以下の多項式の一致定理により、5点一致は恒等的な一致を保証する)。',
};

// ---- Q3 (checksUnitIndex=2, 定積分と面積): f(x)=x² の [0,3] での定積分 ----
const q3TrueValue = exactIntegralPoly(SQUARE, 0, 3); // = [x³/3] from 0 to 3 = 9

const q3Choices: readonly { id: string; label: string }[] = [
	{ id: 'a', label: '9' }, // 正解(表示順1番目)
	{ id: 'b', label: '6' },
	{ id: 'c', label: '27' },
	{ id: 'd', label: '3' },
];

const q3: CourseDiagnosticQuestion = {
	id: 'course-deriv-3',
	prompt: 'f(x) = x² を区間 [0, 3] で定積分すると、いくつですか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q3TrueValue, Math.max(1, Math.abs(q3TrueValue))),
	),
	checksUnitIndex: 2,
	source: '単元「定積分と面積」: 係数規則 aₙ/(n+1)·x^(n+1) による厳密な定積分。',
	rationale: 'lib/math/riemannSum.ts の exactIntegralPoly([0,0,1], 0, 3) を検算し、9 に一致する選択肢を正解とする。',
};

export const derivativeCalculusDiagnostic: CourseDiagnosticData = {
	questions: [q1, q2, q3],
};
