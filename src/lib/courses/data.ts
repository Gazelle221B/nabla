// 既定学習経路(コース、ADR-006 M9d「流通の種まき」)のメタデータ。React/描画ライブラリを
// 一切 import しない純粋 TypeScript(AGENTS.md §5)。
//
// 選定手順(実エッジの確認): 2026-07-24 時点で公開されている全32単元の content collection
// frontmatter(`prerequisites`)を実走査し、実際に前提エッジが連なっている(孤立していない)
// 3〜5単元の経路を3本選んだ(タスク仕様: 2〜3本+パイロット単元を自然に含める)。
// 各コースの単元順序は content.config.ts の実 prerequisites と一致することをビルド時に
// `validateCourseOrder`(src/lib/courses/validateOrder.ts)で検証する
// (src/pages/courses/[course].astro が getCollection の結果と突き合わせて呼び出す)。
//
// パイロット3単元(M9b/M9c と同一、trigonometric-ratios / derivative-function /
// permutation-combination)を各コースに1本ずつ含めた——入口診断・演習・前提チェックの
// 蓄積がある単元をコースの中核に据えることで、M9d の URL プリセット機能(パイロット限定
// スコープ)ともコース単位で自然に整合する。
//
// 各コースの実エッジ(content collection の prerequisites、2026-07-24 実走査):
//   geometry/trigonometric-ratios.prerequisites   = [geometry/pythagorean-theorem]
//   geometry/law-of-sines-cosines.prerequisites    = [geometry/trigonometric-ratios]
//   linear-algebra/dot-product.prerequisites       = [geometry/trigonometric-ratios]
//   calculus/derivative-function.prerequisites     = [calculus/derivative-tangent-line]
//   calculus/definite-integral-area.prerequisites  = [calculus/derivative-function]
//   calculus/surface-partial-derivative.prerequisites = [calculus/derivative-function]
//   probability/permutation-combination.prerequisites = [probability/simple-probability]
//   probability/probability-distribution.prerequisites = [probability/simple-probability]
//   probability/normal-distribution-clt.prerequisites  = [probability/probability-distribution]

import { geometryTrigonometryDiagnostic } from '../courseDiagnostics/geometryTrigonometry.js';
import { derivativeCalculusDiagnostic } from '../courseDiagnostics/derivativeCalculus.js';
import { probabilityCombinatoricsDiagnostic } from '../courseDiagnostics/probabilityCombinatorics.js';
import type { CourseDiagnosticData } from '../courseDiagnostics/types.js';

export interface CourseUnitEntry {
	/** content collection の entry.id と同じ形("subject/slug")。 */
	readonly lessonId: string;
	/** この単元の到達目標(1行)。単元自身の learningGoals とは別に、コースの文脈で要約する。 */
	readonly reachGoal: string;
}

export interface CourseDefinition {
	readonly slug: string;
	readonly title: string;
	readonly summary: string;
	/** 「この順で進む理由」(前提関係の明示)。 */
	readonly orderRationale: string;
	readonly units: readonly CourseUnitEntry[];
	/** 入口診断(3問、units.length-1問がcheckUnitIndex 0..units.length-2をカバーする)。 */
	readonly diagnostic: CourseDiagnosticData;
}

export const COURSES: readonly CourseDefinition[] = [
	{
		slug: 'geometry-and-trigonometry',
		title: '図形と三角比',
		summary:
			'直角三角形の基本定理から出発し、角度による一般化(三角比)、任意の三角形への拡張' +
			'(正弦定理・余弦定理)、そして線形代数の内積へつながる、図形分野の主要な経路です。',
		orderRationale:
			'三平方の定理(直角三角形の3辺の関係)を土台に、三角比と単位円がそれを角度の関数へ' +
			'一般化します(trigonometric-ratios の前提は pythagorean-theorem)。三角比が定まると、' +
			'直角三角形に限らない任意の三角形へ正弦定理・余弦定理で拡張でき(law-of-sines-cosines の' +
			'前提は trigonometric-ratios)、同じ三角比(cosθ)は内積の図形的な意味(2ベクトルのなす角)' +
			'の理解にも直結します(dot-product の前提も trigonometric-ratios)。後半2単元は' +
			'三角比という共通の前提から枝分かれする関係で、コースでは正弦定理・余弦定理を先に' +
			'置いています(角度→辺の計量という自然な流れを保つため)。',
		units: [
			{
				lessonId: 'geometry/pythagorean-theorem',
				reachGoal: '直角三角形の3辺の関係 a²+b²=c² を、面積の関係として自分の言葉で説明できる。',
			},
			{
				lessonId: 'geometry/trigonometric-ratios',
				reachGoal: '単位円上の点の座標として sinθ・cosθ・tanθ を、角度を一般化して説明できる。',
			},
			{
				lessonId: 'geometry/law-of-sines-cosines',
				reachGoal: '直角とは限らない任意の三角形で、正弦定理・余弦定理を使って辺や角を求められる。',
			},
			{
				lessonId: 'linear-algebra/dot-product',
				reachGoal: '2つのベクトルの内積が、なす角の cos とそれぞれの大きさの積であることを説明できる。',
			},
		],
		diagnostic: geometryTrigonometryDiagnostic,
	},
	{
		slug: 'derivatives-and-integration',
		title: '微分と積分の考え方',
		summary:
			'接線の傾きという1点の情報(微分係数)から出発し、それを関数として集める(導関数)、' +
			'そして積分・偏微分へ広げる、解析(微積分)分野の主要な経路です。',
		orderRationale:
			'微分係数と接線(1点 a における接線の傾き f\'(a) という「数」)が土台にあり、a を' +
			'動かしながらこの値を集めると導関数(a の関数としての f\'(x))になります' +
			'(derivative-function の前提は derivative-tangent-line)。導関数が定義できると、' +
			'その逆操作にあたる定積分(面積として微小な和の極限を考える)と、変数を1つ増やした' +
			'偏微分(多変数関数の片方の変数だけを動かす微分)の両方へ進めます' +
			'(definite-integral-area・surface-partial-derivative はいずれも導関数を前提とする' +
			'兄弟単元)。コースでは、同じ多項式の枠組みで理解しやすい定積分を先に置いています。',
		units: [
			{
				lessonId: 'calculus/derivative-tangent-line',
				reachGoal: '微分係数 f\'(a) が「点 a における接線の傾き」であることを、割線の極限として説明できる。',
			},
			{
				lessonId: 'calculus/derivative-function',
				reachGoal: '各点の接線の傾きを集めると、それ自体が別の関数(導関数)のグラフになることを説明できる。',
			},
			{
				lessonId: 'calculus/definite-integral-area',
				reachGoal: '区分求積(長方形近似)の和が、分割を細かくすると定積分の値へ収束することを説明できる。',
			},
			{
				lessonId: 'calculus/surface-partial-derivative',
				reachGoal: '2変数関数の偏微分が、片方の変数だけを動かしたときの傾きであることを説明できる。',
			},
		],
		diagnostic: derivativeCalculusDiagnostic,
	},
	{
		slug: 'probability-and-combinatorics',
		title: '場合の数と確率',
		summary:
			'単純な試行の確率から出発し、数え上げの技法(順列・組合せ)、確率分布、そして' +
			'中心極限定理へつながる、確率統計分野の主要な経路です。',
		orderRationale:
			'確率(単純な試行と相対度数、理論確率の考え方)が土台にあり、そこから2方向に' +
			'進めます: 数え上げの技法を磨く順列・組合せと、確率をより体系的に扱う確率分布' +
			'(いずれの前提も simple-probability)。コースでは、確率分布で必要になる' +
			'「場合の数を正しく数える」感覚を先に養うため、順列・組合せを先に置いています。' +
			'確率分布が定まると、標本を重ねたときの分布の形(中心極限定理)へ進めます' +
			'(normal-distribution-clt の前提は probability-distribution)。',
		units: [
			{
				lessonId: 'probability/simple-probability',
				reachGoal: '理論確率(有利な場合の数÷すべての場合の数)と、試行を重ねた相対度数の関係を説明できる。',
			},
			{
				lessonId: 'probability/permutation-combination',
				reachGoal: '「選んで並べる」(順列)と「選ぶだけ」(組合せ)の場合の数の違いを、列挙して区別できる。',
			},
			{
				lessonId: 'probability/probability-distribution',
				reachGoal: '確率変数のとりうる値と確率の対応(確率分布)から、期待値を計算して説明できる。',
			},
			{
				lessonId: 'probability/normal-distribution-clt',
				reachGoal: '標本を重ねた平均の分布が、元の分布によらず正規分布に近づく(中心極限定理)ことを説明できる。',
			},
		],
		diagnostic: probabilityCombinatoricsDiagnostic,
	},
];
