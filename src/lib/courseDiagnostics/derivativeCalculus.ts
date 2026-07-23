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

// ---- Q2 (checksUnitIndex=1, 導関数): f(x)=x³ の導関数 f'(x) を x=2 で評価 ----
const q2TrueValue = derivativeAt(cubeFn, 2); // = 12 (3x², x=2)

const q2Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '4' },
	{ id: 'c', label: '6' },
	{ id: 'a', label: '12' }, // 正解(表示順3番目)
	{ id: 'd', label: '24' },
];

const q2: CourseDiagnosticQuestion = {
	id: 'course-deriv-2',
	prompt: 'f(x) = x³ の導関数 f\'(x) を x = 2 で評価すると、いくつですか。',
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(q2Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q2TrueValue, Math.max(1, Math.abs(q2TrueValue))),
	),
	checksUnitIndex: 1,
	source: '単元「導関数」: 係数の規則(x^n の導関数は n·x^(n-1))から f(x)=x³ の f\'(x)=3x²。',
	rationale:
		'lib/math/derivativeFunction.ts の toDifferentiableFunction([0,0,0,1]) を derivativeAt に渡し、' +
		'x=2 での値(=12)を検算する。',
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
