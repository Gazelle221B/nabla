// 「三角比と単位円」冒頭の前提チェック(ADR-006 M9b パイロット)。
// 前提単元: geometry/pythagorean-theorem(三平方の定理、MVP 1 の代表単元)。
// この単元は単位円上の点 (cosθ, sinθ) が原点から半径1の距離にあることを三平方の定理で
// 導く(ピタゴラスの恒等式 sin²θ+cos²θ=1)ため、前提知識は「直角三角形の3辺の関係
// a²+b²=c²」そのもの。設問はすべて pythagorean-theorem.mdx 本文中の具体例
// (脚3・4→斜辺5、脚5・12→斜辺13)を再利用し、新しい主張を作らない(C-5 の慎重さ)。
import { squaredDistance, type Point2 } from '../math/pythagoras.js';
import { approximatelyZero } from '../math/compare.js';
import { pickCorrectChoiceId, type PrerequisiteCheckData, type PrerequisiteQuestion } from './types.js';

// 直角三角形の2脚 a, b から真の斜辺 c を検算するヘルパー。pythagoras.ts の squaredDistance を
// 「原点 (0,0) を直角の頂点とし、2脚を x 軸・y 軸上に置く」という構成で再利用する
// (この構成では原点と2脚の先端を結ぶ角が幾何学的に必ず90°になるため、2点間の距離が
// そのまま「真の斜辺」になる——ハードコードした5・13ではなく、実際に計算した値)。
function trueHypotenuse(legA: number, legB: number): number {
	// legA・legB を x 軸・y 軸上に置く(原点が直角の頂点になる配置)。この配置では
	// pointA-pointB 間の距離が、原点を経由した2脚の長さから幾何学的に必ず斜辺と一致する。
	const pointA: Point2 = [legA, 0];
	const pointB: Point2 = [0, legB];
	return Math.sqrt(squaredDistance(pointA, pointB));
}

// 候補の三つ組 (a, b, c) が a²+b²=c² を満たすかどうかを検算するヘルパー。
// squaredDistance(origin, ·) で a², b² を独立に求め、候補 c² との残差を
// approximatelyZero(compare.ts, MATH_CONVENTIONS §2 のスケール相対誤差)で判定する
// (pythagoreanResidual と同じ「legA2+legB2-hypotenuse2」の形を、候補cの検証用に手で組む——
// pythagoreanResidual 自体は3点の実測から残差を出す関数であり、任意の候補cを検証する
// この用途にはそのままは使えないため squaredDistance を直接使う)。
function satisfiesPythagoras(a: number, b: number, c: number): boolean {
	const origin: Point2 = [0, 0];
	const legA2 = squaredDistance(origin, [a, 0]);
	const legB2 = squaredDistance(origin, [0, b]);
	const residual = legA2 + legB2 - c * c;
	return approximatelyZero(residual, Math.max(1, legA2 + legB2));
}

const q1Hypotenuse = trueHypotenuse(3, 4); // = 5 (pythagorean-theorem.mdx の具体例と一致)

const q1: PrerequisiteQuestion = {
	id: 'trig-prereq-1',
	prompt: '直角三角形で、直角をはさむ2つの脚の長さが 3 と 4 のとき、斜辺の長さはいくつですか。',
	choices: [
		{ id: 'a', label: '5' },
		{ id: 'b', label: '6' },
		{ id: 'c', label: '7' },
		{ id: 'd', label: '12' }, // 5-12-13 の斜辺13との混同を狙った誤答選択肢(数値そのものは誤答)
	],
	correctChoiceId: pickCorrectChoiceId(
		[
			{ id: 'a', label: '5' },
			{ id: 'b', label: '6' },
			{ id: 'c', label: '7' },
			{ id: 'd', label: '12' },
		],
		(choice) => approximatelyZero(Number(choice.label) - q1Hypotenuse, q1Hypotenuse),
	),
	source: '前提単元「三平方の定理」: a² + b² = c²(脚3・4→斜辺5の具体例と同一)。',
	rationale:
		'lib/math/pythagoras.ts の squaredDistance で、原点を直角の頂点、脚3・4をx軸・y軸上に' +
		'置いたときの2点間距離(=真の斜辺)を検算し、5 に一致する選択肢のみを正解とする。',
};

const q2Choices: readonly { id: string; a: number; b: number; c: number }[] = [
	{ id: 'a', a: 5, b: 12, c: 13 }, // pythagorean-theorem.mdx の具体例そのもの(正解)
	{ id: 'b', a: 5, b: 12, c: 14 }, // 斜辺だけをわずかにずらした誤答
	{ id: 'c', a: 6, b: 8, c: 11 }, // 6-8-10 の派生に見せかけた誤答(11は不成立)
	{ id: 'd', a: 2, b: 3, c: 4 }, // 小さい数字の非直角三角形
];

const q2: PrerequisiteQuestion = {
	id: 'trig-prereq-2',
	prompt: '次の3辺の組 (a, b, c) のうち、三平方の定理 a² + b² = c² を満たすのはどれですか。',
	choices: q2Choices.map(({ id, a, b, c }) => ({ id, label: `(${a}, ${b}, ${c})` })),
	correctChoiceId: pickCorrectChoiceId(
		q2Choices.map(({ id, a, b, c }) => ({ id, label: `(${a}, ${b}, ${c})` })),
		(choice) => {
			const found = q2Choices.find((cand) => cand.id === choice.id)!;
			return satisfiesPythagoras(found.a, found.b, found.c);
		},
	),
	source: '前提単元「三平方の定理」: a² + b² = c² が成り立つのは直角三角形のときだけ。',
	rationale:
		'lib/math/pythagoras.ts の squaredDistance で各候補の a², b² を独立に求め、候補 c² との' +
		'残差を lib/math/compare.ts の approximatelyZero で判定する(残差≈0の候補のみ正解)。',
};

const q3Candidates: readonly { id: string; b: number }[] = [
	{ id: 'a', b: 12 }, // 5-12-13(正解、pythagorean-theorem.mdx の具体例)
	{ id: 'b', b: 8 },
	{ id: 'c', b: 18 },
	{ id: 'd', b: 6 },
];

const q3: PrerequisiteQuestion = {
	id: 'trig-prereq-3',
	prompt: '直角三角形で斜辺が 13、一方の脚が 5 のとき、もう一方の脚の長さはいくつですか。',
	choices: q3Candidates.map(({ id, b }) => ({ id, label: String(b) })),
	correctChoiceId: pickCorrectChoiceId(
		q3Candidates.map(({ id, b }) => ({ id, label: String(b) })),
		(choice) => {
			const found = q3Candidates.find((cand) => cand.id === choice.id)!;
			return satisfiesPythagoras(5, found.b, 13);
		},
	),
	source: '前提単元「三平方の定理」: a² + b² = c² から未知の脚を逆算する(5-12-13の具体例)。',
	rationale:
		'lib/math/pythagoras.ts の squaredDistance で 5² を求め、候補 b² との和が 13² に' +
		'approximatelyZero(compare.ts)で一致する候補のみを正解とする。',
};

export const trigonometricRatiosPrerequisiteCheck: PrerequisiteCheckData = {
	prerequisiteHref: '../pythagorean-theorem/',
	prerequisiteTitle: '三平方の定理',
	questions: [q1, q2, q3],
};
