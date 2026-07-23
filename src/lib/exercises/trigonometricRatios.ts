// 「三角比と単位円」単元末尾の演習(ADR-006 M9c パイロット)。5問固定。
// この単元自身の内容(単位円上の点 (cosθ, sinθ)・ピタゴラス恒等式・tanθ の非定義角度・
// sinθ/cosθ の値域・θ を動かしたときの変化)の理解を確認する。前提単元(三平方の定理)の
// 復習ではない点が prerequisiteChecks/trigonometricRatios.ts との違い。
import { unitCirclePoint, sine, cosine, tangent } from '../math/trigonometry.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type ExerciseChoice, type ExerciseSectionData, type ExerciseQuestion } from './types.js';

// 角度の内部単位はラジアン(trigonometry.ts の規約)。度からラジアンへの変換は呼び出し側
// (このデータファイル)の責務にする——TrigonometryExperiment.tsx / prerequisiteChecks 側と
// 同じ設計判断(角度変換を lib/math に持ち込まない)。
const DEG_TO_RAD = Math.PI / 180;

// ---- Q1: θ=270° の単位円上の点 ----
// 正答の位置バイアス対策: 正答(id='a')を選択肢の先頭(1番目、表示順)に置く。
const q1TruePoint = unitCirclePoint(270 * DEG_TO_RAD); // ≈ (0, -1)

const q1Candidates = [
	{ id: 'a', x: 0, y: -1 }, // 正解: 270°は単位円の真下の点
	{ id: 'b', x: 0, y: 1 }, // 90°との符号取り違え
	{ id: 'c', x: -1, y: 0 }, // 180°との混同
	{ id: 'd', x: 1, y: 0 }, // 0°/360°との混同
];

const q1: ExerciseQuestion = {
	id: 'trigex-1',
	prompt: 'θ = 270° のとき、単位円上の点 (cos θ, sin θ) はどれですか。',
	choices: q1Candidates.map(({ id, x, y }) => ({
		id,
		label: `(${x}, ${y})`,
		misconception:
			id === 'b'
				? '90°と270°の符号を取り違えている(下向きの点と上向きの点を混同している)。'
				: id === 'c'
					? '270°を180°(x軸負方向の点)と混同している。'
					: id === 'd'
						? '270°を0°/360°(x軸正方向の点)と混同している。'
						: null,
	})),
	correctChoiceId: pickCorrectChoiceId(
		q1Candidates.map(({ id, x, y }) => ({ id, label: `(${x}, ${y})`, misconception: null })),
		(choice) => {
			const found = q1Candidates.find((c) => c.id === choice.id)!;
			return (
				approximatelyZero(found.x - q1TruePoint[0], 1) && approximatelyZero(found.y - q1TruePoint[1], 1)
			);
		},
	),
	source: '本文「形式的な定義」: 単位円上で角度θに対応する点は (cosθ, sinθ)。',
	rationale: 'lib/math/trigonometry.ts の unitCirclePoint(270°をラジアン変換) で検算する(≈ (0, -1))。',
};

// ---- Q2: cosθ=0(tanθ が定義できない)角度はどれか ----
// 正答の位置バイアス対策: 正答(id='a')を2番目(表示順)に置く。
function isTanUndefinedAtDegrees(deg: number): boolean {
	try {
		tangent(deg * DEG_TO_RAD);
		return false;
	} catch {
		return true;
	}
}

const q2Candidates = [
	{ id: 'b', deg: 0 },
	{ id: 'a', deg: 90 }, // 正解: cosθ=0 になる唯一の角度(0/180/360とは異なりcos≠0でない)
	{ id: 'c', deg: 180 },
	{ id: 'd', deg: 360 },
];

const q2: ExerciseQuestion = {
	id: 'trigex-2',
	prompt: '次の角度のうち、tan θ が定義できない(値を持たない)のはどれですか。',
	choices: q2Candidates.map(({ id, deg }) => ({
		id,
		label: `${deg}°`,
		misconception:
			id === 'b'
				? 'cosθ=0ではなくsinθ=0になる角度と混同している(0°では cos0°=1≠0 なので tan0°=0 と定義できる)。'
				: id === 'c'
					? 'cos180°=−1(≠0)であることを見落としている(tan180°=0 と定義できる)。'
					: id === 'd'
						? '360°は0°と同じ点(cos360°=1)であることを踏まえず、cosθ=0だと勘違いしている。'
						: null,
	})),
	correctChoiceId: pickCorrectChoiceId(
		q2Candidates.map(({ id, deg }) => ({ id, label: `${deg}°`, misconception: null })),
		(choice) => isTanUndefinedAtDegrees(q2Candidates.find((c) => c.id === choice.id)!.deg),
	),
	source: '本文「よくある誤解」: tanθ = sinθ/cosθ は cosθ=0 となる角度(θ=90°, 270°など)で定義できない。',
	rationale:
		'lib/math/trigonometry.ts の tangent() を各候補角度(ラジアン変換後)に適用し、' +
		'RangeError(cosθ≈0)を投げる候補のみを正解とする(実際に例外を発生させて検算する)。',
};

// ---- Q3: sin²θ + cos²θ の値(θ=40°) ----
// 正答の位置バイアス対策: 正答(id='a', "1")を3番目(表示順)に置く。
const q3Theta = 40 * DEG_TO_RAD;
const q3TrueSin = sine(q3Theta);
const q3TrueCos = cosine(q3Theta);
const q3TrueValue = q3TrueSin * q3TrueSin + q3TrueCos * q3TrueCos; // ≈ 1(ピタゴラス恒等式)

const q3Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '0',
		misconception:
			'ピタゴラスの恒等式の残差(sin²θ+cos²θ−1)が0であることと、sin²θ+cos²θ自体の値を取り違えている。',
	},
	{
		id: 'c',
		label: 'θの値によって変わる(一定ではない)',
		misconception: 'sin²θ+cos²θ=1がどんなθでも成り立つ恒等式であることを見落としている。',
	},
	{ id: 'a', label: '1', misconception: null }, // 正解
	{ id: 'd', label: '-1', misconception: '符号を取り違えている。' },
];

const q3: ExerciseQuestion = {
	id: 'trigex-3',
	prompt: 'θ = 40° のとき、sin²θ + cos²θ の値はいくつですか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(q3Choices, (choice) => {
		// テキストの選択肢(例: 「θの値によって変わる」)は数値化できないため自動的に不一致になる
		// (Number() が NaN を返し比較が false になる)。ハードコードした分岐を用意しない。
		const numeric = Number(choice.label);
		if (Number.isNaN(numeric)) return false;
		return approximatelyZero(numeric - q3TrueValue, 1);
	}),
	source: '本文「形式的な定義」: sin²θ + cos²θ = 1 は任意のθで成り立つ(ピタゴラスの恒等式)。',
	rationale:
		'lib/math/trigonometry.ts の sine(40°)・cosine(40°) を独立に計算し、sin²+cos² を実際に' +
		'合計して 1 に一致することを検算する(恒等式の残差計算 pythagoreanIdentityResidual とは別に、' +
		'sin/cos の値そのものから2乗和を組み立てる独立経路)。',
};

// ---- Q4: sinθ の最大値 ----
// 正答の位置バイアス対策: 正答(id='a', "1")を4番目(表示順、末尾)に置く。
const Q4_SAMPLE_DEGREES = Array.from({ length: 361 }, (_, i) => i); // 0°〜360°(1°刻み)
const q4MaxSine = Math.max(...Q4_SAMPLE_DEGREES.map((d) => sine(d * DEG_TO_RAD)));

const q4Choices: readonly ExerciseChoice[] = [
	{
		id: 'b',
		label: '0',
		misconception: 'sinθ=0になる角度(θ=0°, 180°など)と、sinθの最大値を混同している。',
	},
	{ id: 'c', label: '-1', misconception: '符号を取り違えている(sinθの最小値と最大値を混同している)。' },
	{
		id: 'd',
		label: '上限はない(いくらでも大きくなる)',
		misconception: '単位円上の点のy座標であるという制約(半径1の円を超えられない)を見落としている。',
	},
	{ id: 'a', label: '1', misconception: null }, // 正解
];

const q4: ExerciseQuestion = {
	id: 'trigex-4',
	prompt: 'sin θ が取りうる値のうち、最大値はいくつですか。',
	choices: q4Choices,
	correctChoiceId: pickCorrectChoiceId(q4Choices, (choice) => {
		const numeric = Number(choice.label);
		if (Number.isNaN(numeric)) return false;
		return approximatelyZero(numeric - q4MaxSine, 1);
	}),
	source:
		'本文「よくある誤解」: sinθ・cosθ はどんな角度に対しても定義され、値は常に-1以上1以下(単位円の半径1を超えない)。',
	rationale:
		'lib/math/trigonometry.ts の sine() を0°〜360°(1°刻み)の361点でサンプリングし、実測の最大値が' +
		'1に一致することを検算する(理論的な上限を主張するだけでなく、実際に多数の値を計算して確認する)。',
};

// ---- Q5: θ を 0°→90° へ動かすと cosθ はどう変化するか ----
// 正答の位置バイアス対策: 正答(id='a')を先頭(1番目、表示順)に置く。
// 記事本文の「まず予想してみよう」で問われた予想そのものを、実験後の理解確認として再度問う
// (実験で確かめたはずの結果を、単元末尾で定着したか検証する)。
const Q5_SAMPLE_DEGREES = [0, 15, 30, 45, 60, 75, 90];
const q5Samples = Q5_SAMPLE_DEGREES.map((d) => cosine(d * DEG_TO_RAD));

function isNonIncreasing(values: readonly number[]): boolean {
	return values.every((v, i) => i === 0 || v <= values[i - 1]! + 1e-9);
}
function isNonDecreasing(values: readonly number[]): boolean {
	return values.every((v, i) => i === 0 || v >= values[i - 1]! - 1e-9);
}
function isConstant(values: readonly number[]): boolean {
	return values.every((v) => approximatelyZero(v - values[0]!, 1));
}

const q5StartsNearOne = approximatelyZero(q5Samples[0]! - 1, 1);
const q5EndsNearZero = approximatelyZero(q5Samples[q5Samples.length - 1]! - 0, 1);
// 実測: cosθ は 0°→90° の範囲で単調に減少し、1(θ=0°)から0(θ=90°)へ至る。
const q5IsDecreasingFromOneToZero = isNonIncreasing(q5Samples) && q5StartsNearOne && q5EndsNearZero;
if (!q5IsDecreasingFromOneToZero) {
	// C-7: サイレントな誤答混入を防ぐ終了条件。lib/math の実測がこの単元の主張(本文「まず予想
	// してみよう」の解説)と食い違う場合はビルド時に例外にする(自己確認ではなく実測ベースの検証)。
	throw new Error(
		'trigonometricRatios exercise: cosine samples over 0°..90° are not monotonically ' +
			`decreasing from ~1 to ~0 (samples: ${q5Samples.join(', ')}). Check trigonometry.ts or the article claim.`,
	);
}

const q5Choices: readonly ExerciseChoice[] = [
	{ id: 'a', label: '1から0へ減少する', misconception: null }, // 正解(実測で確認済み)
	{
		id: 'b',
		label: '0から1へ増加する',
		misconception: 'cosθではなくsinθの変化(0°→90°でsinθは0から1へ増加する)と取り違えている。',
	},
	{
		id: 'c',
		label: '変化しない(常に一定)',
		misconception: 'cosθが定数であるかのように誤解している(実測ではcosθは単調に変化する)。',
	},
	{
		id: 'd',
		label: '0から1へ増加した後、また0へ戻る',
		misconception:
			'0°〜90°の範囲でcosθの増減が入れ替わると誤解している(実測では単調に減少するのみで折り返しはない)。',
	},
];

const q5: ExerciseQuestion = {
	id: 'trigex-5',
	prompt: 'θ を 0° から 90° まで動かすと、cos θ はどのように変化しますか。',
	choices: q5Choices,
	correctChoiceId: pickCorrectChoiceId(q5Choices, (choice) => {
		if (choice.id === 'a') return q5IsDecreasingFromOneToZero;
		if (choice.id === 'b') return isNonDecreasing(q5Samples) && !q5IsDecreasingFromOneToZero;
		if (choice.id === 'c') return isConstant(q5Samples);
		// 'd': 0°〜90°の範囲で単調減少であることが既に確定しているため(上のガードで検証済み)、
		// 「増加した後に減少する」形状は数学的に両立しない。
		return false;
	}),
	source: '本文「まず予想してみよう」「形式的な定義」: θ=0°でcosθ=1、θ=90°でcosθ=0。',
	rationale:
		'lib/math/trigonometry.ts の cosine() を0°〜90°(15°刻み)の7点でサンプリングし、値が単調に' +
		'減少し1から0へ至ることを実測で検算する(理論値の言明だけでなく、実際に複数の点を計算して確認する)。',
};

export const trigonometricRatiosExercise: ExerciseSectionData = {
	questions: [q1, q2, q3, q4, q5],
};
