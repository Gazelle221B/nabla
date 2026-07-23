// 「導関数 — 微分係数から関数へ」冒頭の前提チェック(ADR-006 M9b パイロット)。
// 前提単元: calculus/derivative-tangent-line(微分係数と接線、MVP 1 の代表単元)。
// この単元は「1点での微分係数」を「点を動かして集めた新しい関数」へ一般化するため、
// 前提知識は「微分係数 f'(a) = 割線の傾きの極限」「接線の式 y=f'(a)(x-a)+f(a)」そのもの。
// 対象関数 f(x)=x², f'(x)=2x は derivative-tangent-line.mdx の実験・転用問題
// (a=-1, a=0 の具体例)と完全に同じものを再利用し、新しい主張を作らない(C-5 の慎重さ)。
import {
	derivativeAt,
	differenceQuotient,
	tangentLine,
	type DifferentiableFunction,
} from '../math/derivative.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type PrerequisiteCheckData, type PrerequisiteQuestion } from './types.js';

// derivative-tangent-line.mdx / DerivativeExperiment.tsx と同一の対象関数(f(x) = x²)。
const CURVE: DifferentiableFunction = {
	evaluate: (x) => x * x,
	derivative: (x) => 2 * x,
};

const q1Value = derivativeAt(CURVE, 3); // = 6

const q1Choices = [
	{ id: 'a', value: 6 },
	{ id: 'b', value: 9 },
	{ id: 'c', value: 3 },
	{ id: 'd', value: 2 },
];

const q1: PrerequisiteQuestion = {
	id: 'derivfn-prereq-1',
	prompt: 'f(x) = x² のとき、x = 3 における微分係数(接線の傾き)f\'(3) はいくつですか。',
	choices: q1Choices.map(({ id, value }) => ({ id, label: String(value) })),
	correctChoiceId: pickCorrectChoiceId(
		q1Choices.map(({ id, value }) => ({ id, label: String(value) })),
		(choice) => approximatelyZero(Number(choice.label) - q1Value, Math.max(1, Math.abs(q1Value))),
	),
	source: '前提単元「微分係数と接線」: 微分係数 f\'(a) の定義(この記事では f(x)=x² を使う)。',
	rationale:
		'lib/math/derivative.ts の derivativeAt(CURVE, 3) を検算に使う(= 6)。' +
		'derivative フィールドは係数規則による厳密な導関数(2x)であり、数値微分の近似ではない。',
};

// derivative-tangent-line.mdx の転用問題がまさに a=-1 での微分係数を扱っているため、
// ここでは「割線の傾き(差分商)が h→0 でその値に収束する」という前提知識を、
// 十分小さい h の差分商と真の微分係数の両方を検算して確認する。
const q2A = -1;
const q2TrueSlope = derivativeAt(CURVE, q2A); // = -2
const q2ApproxSlope = differenceQuotient(CURVE, q2A, 0.0001); // h→0 に十分近い割線の傾き

const q2Choices = [
	{ id: 'a', value: -2 },
	{ id: 'b', value: 2 },
	{ id: 'c', value: -1 },
	{ id: 'd', value: 0 },
];

const q2: PrerequisiteQuestion = {
	id: 'derivfn-prereq-2',
	prompt:
		'f(x) = x² で a = -1 のとき、割線の傾き (f(a+h) − f(a)) / h の h をどんどん0に近づけていくと、' +
		'どんな値に近づきますか。',
	choices: q2Choices.map(({ id, value }) => ({ id, label: String(value) })),
	correctChoiceId: pickCorrectChoiceId(
		q2Choices.map(({ id, value }) => ({ id, label: String(value) })),
		(choice) =>
			approximatelyZero(Number(choice.label) - q2TrueSlope, Math.max(1, Math.abs(q2TrueSlope))),
	),
	source: '前提単元「微分係数と接線」: 割線の傾きが h→0 の極限として微分係数に収束する(a=-1の転用問題と同一)。',
	rationale:
		'lib/math/derivative.ts の differenceQuotient(CURVE, -1, 0.0001) ≈ -2 と ' +
		'derivativeAt(CURVE, -1) = -2 の両方を独立に計算し、一致することを検算する' +
		'(2つの独立した関数の突き合わせであり、同じ式に戻すだけの自己確認ではない)。',
};

// 割線の傾き (h=0.0001) と真の微分係数の差は数学的に厳密には h 自体(=0.0001)に等しく、
// compare.ts の approximatelyZero が想定する機械精度(1e-9)の不変条件とは性質が異なる
// (これは「丸め誤差」ではなく「有限の h を使ったことによる意図的な近似誤差」)。
// ここでは「割線近似が正しく解析的微分係数へ収束する方向にあるか」を緩い許容誤差で
// 検算する(C-7: サイレントな誤答混入を防ぐための終了条件付きガード)。
const CONVERGENCE_TOLERANCE = 0.01; // h=0.0001 に対して十分緩い(理論上の誤差は h=0.0001)
if (Math.abs(q2ApproxSlope - q2TrueSlope) > CONVERGENCE_TOLERANCE) {
	throw new Error(
		`derivativeFunction prerequisite check: differenceQuotient(${q2ApproxSlope}) と ` +
			`derivativeAt(${q2TrueSlope}) の差が許容誤差(${CONVERGENCE_TOLERANCE})を超えています。`,
	);
}

const q3 = tangentLine(CURVE, 0); // slope=0, intercept=0 → y = 0

const q3Choices = [
	{ id: 'a', label: 'y = 0' },
	{ id: 'b', label: 'y = 2x' },
	{ id: 'c', label: 'y = x' },
	{ id: 'd', label: 'y = 1' },
];

const q3Question: PrerequisiteQuestion = {
	id: 'derivfn-prereq-3',
	prompt: 'f(x) = x² の x = 0 における接線の式はどれですか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) => {
		if (choice.id === 'a') return q3.slope === 0 && q3.intercept === 0;
		if (choice.id === 'b') return q3.slope === 2 && q3.intercept === 0;
		if (choice.id === 'c') return q3.slope === 1 && q3.intercept === 0;
		return q3.slope === 0 && q3.intercept === 1;
	}),
	source: '前提単元「微分係数と接線」: 接線の式 y = f\'(a)(x−a) + f(a)(この記事のa=0の転用問題と同一)。',
	rationale: 'lib/math/derivative.ts の tangentLine(CURVE, 0) を検算に使う(slope=0, intercept=0)。',
};

export const derivativeFunctionPrerequisiteCheck: PrerequisiteCheckData = {
	prerequisiteHref: '../derivative-tangent-line/',
	prerequisiteTitle: '微分係数と接線',
	questions: [q1, q2, q3Question],
};
