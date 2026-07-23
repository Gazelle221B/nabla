// コース「図形と三角比」(ADR-006 M9d)の入口診断。
// コースの単元順: [三平方の定理, 三角比と単位円, 正弦定理・余弦定理, 内積](実 DAG のエッジ
// pythagorean-theorem → trigonometric-ratios → law-of-sines-cosines / dot-product に沿う。
// 詳細な選定根拠は src/lib/courses/data.ts のコメントを参照)。
//
// 3問で単元0〜2の内容を確認し(checksUnitIndex)、単元3(内積)への到達可否は「単元2まで
// 全問正解」から推論する(CourseEntryDiagnostic.tsx の recommendedUnitIndex を参照)。
// 各問の数値例は prerequisiteChecks/trigonometricRatios.ts が使う具体例(脚3・4)とは別の
// 数値を用い、暗記による通過を避ける。
import { squaredDistance, type Point2 } from '../math/pythagoras.js';
import { cosine } from '../math/trigonometry.js';
import { lawOfCosinesSide } from '../math/lawOfSinesCosines.js';
import { approximatelyZero } from '../math/compare.js';
import {
	pickCorrectChoiceId,
	nearestChoiceId,
	type CourseDiagnosticData,
	type CourseDiagnosticQuestion,
} from './types.js';

const DEG_TO_RAD = Math.PI / 180;

// ---- Q1 (checksUnitIndex=0, 三平方の定理): 脚9・12の斜辺 ----
const q1Hypotenuse = Math.sqrt(squaredDistance([9, 0] as Point2, [0, 12] as Point2)); // = 15 (9-12-15、3-4-5の3倍)

const q1Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '18' },
	{ id: 'a', label: '15' }, // 正解(表示順2番目)
	{ id: 'c', label: '21' },
	{ id: 'd', label: '13' },
];

const q1: CourseDiagnosticQuestion = {
	id: 'course-geo-trig-1',
	prompt: '直角三角形で、直角をはさむ2つの脚の長さが 9 と 12 のとき、斜辺の長さはいくつですか。',
	choices: q1Choices,
	correctChoiceId: pickCorrectChoiceId(q1Choices, (choice) =>
		approximatelyZero(Number(choice.label) - q1Hypotenuse, q1Hypotenuse),
	),
	checksUnitIndex: 0,
	source: '単元「三平方の定理」: a² + b² = c²。',
	rationale:
		'lib/math/pythagoras.ts の squaredDistance で、原点を直角の頂点、脚9・12をx軸・y軸上に' +
		'置いたときの2点間距離(=真の斜辺)を検算し、15 に一致する選択肢のみを正解とする。',
};

// ---- Q2 (checksUnitIndex=1, 三角比と単位円): θ=60° のときの cosθ ----
const q2CosValue = cosine(60 * DEG_TO_RAD); // = 0.5

const q2Choices: readonly { id: string; label: string }[] = [
	{ id: 'a', label: '0.5' }, // 正解(表示順1番目)
	{ id: 'b', label: '0.87' }, // sin60°との混同
	{ id: 'c', label: '1' },
	{ id: 'd', label: '0' },
];

const q2: CourseDiagnosticQuestion = {
	id: 'course-geo-trig-2',
	prompt: '単位円上で角度 θ = 60° のとき、cos θ に最も近い値はどれですか。',
	choices: q2Choices,
	correctChoiceId: pickCorrectChoiceId(
		q2Choices,
		(choice) => choice.id === nearestChoiceId(q2Choices, q2CosValue),
	),
	checksUnitIndex: 1,
	source: '単元「三角比と単位円」: 単位円上の角度θに対応する点の座標は (cosθ, sinθ)。',
	rationale: 'lib/math/trigonometry.ts の cosine(60°→ラジアン変換後)を検算し、0.5 に最も近い選択肢を正解とする。',
};

// ---- Q3 (checksUnitIndex=2, 正弦定理・余弦定理): 2辺7・8と挟角60°から対辺を余弦定理で求める ----
const q3Side = lawOfCosinesSide(7, 8, 60 * DEG_TO_RAD); // = √(49+64-56) = √57 ≈ 7.55

const q3Choices: readonly { id: string; label: string }[] = [
	{ id: 'b', label: '5.0' },
	{ id: 'c', label: '9.0' },
	{ id: 'd', label: '15.0' }, // 単純に7+8-挟角度数のような誤った合成を狙った誤答
	{ id: 'a', label: '7.6' }, // 正解(表示順4番目、√57≈7.55の小数第1位丸め)
];

const q3: CourseDiagnosticQuestion = {
	id: 'course-geo-trig-3',
	prompt: '三角形で、頂点Aに隣接する2辺の長さが 7 と 8、その間の角(頂点Aの内角)が 60° のとき、余弦定理で求めた対辺の長さに最も近いものはどれですか。',
	choices: q3Choices,
	correctChoiceId: pickCorrectChoiceId(
		q3Choices,
		(choice) => choice.id === nearestChoiceId(q3Choices, q3Side),
	),
	checksUnitIndex: 2,
	source: '単元「正弦定理・余弦定理」: 余弦定理 a = √(b² + c² − 2bc·cosA)。',
	rationale:
		'lib/math/lawOfSinesCosines.ts の lawOfCosinesSide(7, 8, 60°→ラジアン変換後) を検算し、' +
		'√57(≈7.55)に最も近い選択肢を正解とする。',
};

export const geometryTrigonometryDiagnostic: CourseDiagnosticData = {
	questions: [q1, q2, q3],
};
