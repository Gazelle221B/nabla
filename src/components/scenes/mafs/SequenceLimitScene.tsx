import { Mafs, Coordinates, Line, Point, LaTeX, Theme } from 'mafs';
import 'mafs/core.css';
import {
	classifyGeometricLimit,
	geometricPartialSum,
	geometricSeriesSum,
} from '../../../lib/math/sequenceLimits.js';
import { geometricTerm } from '../../../lib/math/sequences.js';

// Tier 1 (Mafs/SVG) 図解レイヤ (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。SequenceScene
// (algebra/sequences)と同じ方針: 数学の値そのものは lib/math の純粋関数へ委譲し、この層は
// 点列の座標計算(描画のためだけの評価)と表示に徹する。geometricTerm は sequences.ts から
// そのまま再利用する(タスク厳守事項、重複実装しない)。
//
// この単元の中核体験: 公比 r を動かすと、点列 (n, r^(n−1)) の「行き先」が
// |r|<1(0へ収束)・r=1(一定)・r>1(発散)・r≤−1(振動)の4通りに劇的に分岐する。あわせて
// 部分和モードでは、(n, Sₙ)の点列が(|r|<1のときだけ)水平な極限値 1/(1−r) へ近づいていく
// 様子を、同じ図の枠組みで観察できるようにする。

type DisplayMode = 'terms' | 'partialSums';
type V2 = [number, number];

// MATH_CONVENTIONS.md §9 の意味論トークン。点列 = 読者が公比 r を操作した結果として変化する
// 量 = accent-primary(Theme.blue)。極限値の水平線は「点列全体から導かれる要約量」であり、
// 読者の直接操作対象でも正誤フィードバックでもないため success/warning とは別の中立トークン
// (ProbabilityDistributionScene の期待値マーカーと同じ Theme.orange 系統、「導出量」を表す色)。
const COLORS = {
	point: Theme.blue,
	limit: Theme.orange,
};

// 安全設計(タスク厳守事項): r>1 の発散・|r|>1 の振動では、n を増やすと項(または部分和)の
// 絶対値が急速に大きくなる(例: r=1.5, n=15 で項は 1.5^14≈291)。オートスケールをそのまま
// 適用すると、たった1つの外れ値のために図全体が押し潰され、収束・一定・振動といった他の運命が
// 見分けられなくなる。RANGE_CAP を超える値は「表示レンジのオートスケール計算から除外する」
// ことで安全に扱う(値自体は引き続き有限で正しく、例外も投げない——単に画面の外に出て
// 見えなくなるだけ、というグラフの表示上の制約に過ぎない)。
const RANGE_CAP = 50;

function formatLimit(value: number): string {
	// 表示専用の丸め(MATH_CONVENTIONS.md §1: 内部値は丸めない、表示のみ丸める)。
	// LaTeX ラベルの見た目のための丸めであり、分類や不変条件の判定には使わない。
	const rounded = Math.round(value * 100) / 100;
	return Object.is(rounded, -0) ? '0' : String(rounded);
}

export interface SequenceLimitSceneProps {
	/** 公比 r。*/
	r: number;
	/** プロットする項数(n=1〜termsCount)。*/
	termsCount: number;
	/** 表示モード: 'terms'=点列 (n, aₙ)、'partialSums'=部分和の点列 (n, Sₙ)。*/
	mode: DisplayMode;
	/**
	 * 極限値の水平線と lim/Σ の数式ラベルを表示するか(既定 true)。
	 * 予想ゲートの前は false にする——極限値の表示はこの単元の「答え」そのものであり、
	 * 予想前に見えると発見学習が成立しない。viewBox の計算には非表示中も極限値を
	 * 含めたままにし、予想確定時に図が跳ねないようにする。
	 */
	showLimit?: boolean;
}

export function SequenceLimitScene({ r, termsCount, mode, showLimit = true }: SequenceLimitSceneProps) {
	const classification = classifyGeometricLimit(r);

	const points: V2[] = [];
	for (let n = 1; n <= termsCount; n++) {
		// geometricTerm(1, r, n) = r^(n-1): 初項1に正規化した「基準」等比数列
		// (sequenceLimits.ts の geometricPartialSum/geometricSeriesSum と同じ正規化)。
		const value = mode === 'terms' ? geometricTerm(1, r, n) : geometricPartialSum(r, n);
		points.push([n, value]);
	}

	// 極限値の水平線: 'terms' モードは項 aₙ の極限(0へ収束 or 一定=1のときだけ存在)、
	// 'partialSums' モードは部分和 Sₙ の極限(級数が収束する |r|<1 のときだけ存在)。
	// 発散・振動では極限が存在しないため線を描かない(絶対言明の禁止: 「収束する」という
	// 言明はUIのどの状態でも真であることを確認済みの条件——ここでは classification 分岐で
	// 保証——の下でのみ描く)。
	let limit: number | null = null;
	if (mode === 'terms') {
		if (classification === 'converges-to-zero') limit = 0;
		else if (classification === 'constant') limit = 1;
	} else if (classification === 'converges-to-zero') {
		limit = geometricSeriesSum(r);
	}

	const inRangeValues = points.filter(([, v]) => Math.abs(v) <= RANGE_CAP).map(([, v]) => v);
	const consideredValues = [0, ...inRangeValues, ...(limit !== null ? [limit] : [])];
	const lo = Math.min(...consideredValues);
	const hi = Math.max(...consideredValues);
	const range = Math.max(1, hi - lo);
	const margin = range * 0.15;

	const xLo = 0;
	const xHi = termsCount + 1;

	return (
		<Mafs
			viewBox={{ x: [xLo, xHi], y: [lo - margin, hi + margin] }}
			preserveAspectRatio="contain"
			pan={false}
			zoom={false}
			height={360}
		>
			<Coordinates.Cartesian subdivisions={false} />

			{showLimit && limit !== null && (
				<>
					<Line.Segment
						point1={[xLo, limit]}
						point2={[xHi, limit]}
						color={COLORS.limit}
						weight={2}
						style="dashed"
					/>
					<LaTeX
						at={[xHi - 1.4, limit + (hi - lo + 2 * margin) * 0.07]}
						tex={
							mode === 'terms'
								? `\\lim_{n\\to\\infty} a_n = ${formatLimit(limit)}`
								: `\\sum_{k=0}^{\\infty} r^k = ${formatLimit(limit)}`
						}
						color={COLORS.limit}
					/>
				</>
			)}

			{/* 点列: n=1〜termsCount。ドラッグ不可の表示専用の点(操作は親の r スライダーが担う)。
			    RANGE_CAP を超える点も Mafs へはそのまま渡す(viewBox の外に出て見えなくなるだけで、
			    クラッシュしたり配列から消えたりはしない)。*/}
			{points.map(([x, y], i) => (
				<Point key={i} x={x} y={y} color={COLORS.point} />
			))}
		</Mafs>
	);
}
