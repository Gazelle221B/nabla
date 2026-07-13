import styles from './CallCountScene.module.css';

// Tier 1 の描画層 (AGENTS.md §5, docs/DESIGN.md §レンダリング戦略)。
//
// 設計判断(タスク厳守事項): この単元の本質は座標平面上の図形ではなく「2つの計算方法の
// 手間の桁違いの差」なので、Mafs を無理に使わず、CombinatoricsEnumerationScene と同じ
// 方針でアクセシブルな HTML/CSS の棒グラフとして可視化する。数学の値そのものは
// lib/math/recurrence.ts の純粋関数(親 Island 側)から渡されたものをそのまま表示するだけで、
// この層で計算はしない(DESIGN.md の「数学モデルと描画の分離」)。
//
// 対数スケールの根拠: 素朴な再帰の呼び出し回数(n=30 で 2,692,537 回)とメモ化の計算回数
// (n=30 で 31 回)は桁が5桁近く違う。線形スケールで両方を同じ棒グラフに描くと、
// メモ化の棒は幅0(実質不可視)になり比較そのものが成立しない。そのため棒の長さは
// log10(値) に比例させ、値の大小ではなく「桁数の違い」を視覚化する(値そのものは
// 別途テキストラベルとして常に併記するので、対数スケールでも実数値は失われない)。
//
// 予想ゲートとの整合(PR #31 で確立した規範: 答えを構成する描画要素はゲートで隠す):
// 「メモ化の棒」とその実数値ラベルは、この単元の予想ゲートの「答え」そのもの
// (素朴再帰の呼び出し回数がどれだけ膨大か、メモ化と比べてどれだけ違うか)を構成する
// ため、revealed=false の間は隠す。ただし軸・グラフ枠・素朴再帰の棒は常時表示する
// (revealed=false でも本文が図を参照するため)。スケールの計算(scaleMax)には
// revealed の真偽に関わらず memoizedCalls を含めておくことで、予想確定の瞬間に
// 軸の目盛りが跳ねて見えるのを防ぐ(SequenceLimitScene の viewBox と同じ考え方)。

export interface CallCountSceneProps {
	/** 素朴な再帰の呼び出し回数(naiveCallCount(n) の戻り値をそのまま渡す)。 */
	naiveCalls: number;
	/** メモ化の計算回数(memoizedComputationCount(n) の戻り値をそのまま渡す)。 */
	memoizedCalls: number;
	/**
	 * メモ化の棒と実数値ラベルを表示するか(既定 true)。予想ゲートの前は false にする。
	 */
	revealed?: boolean;
}

function formatCount(value: number): string {
	return value.toLocaleString('ja-JP');
}

export function CallCountScene({ naiveCalls, memoizedCalls, revealed = true }: CallCountSceneProps) {
	// 対数目盛の上限: 両方の値(非表示中の memoizedCalls も含む、上記コメント参照)のうち
	// 大きい方を基準に、10 のべき乗へ切り上げる。10 未満(n=0,1 付近。素朴=1回、メモ化=n+1 回)の
	// 退化ケースでも目盛りが最低1段(10^0〜10^1)は出るようにフロアを 10 にする。
	const scaleMax = Math.max(naiveCalls, memoizedCalls, 10);
	const maxExponent = Math.max(1, Math.ceil(Math.log10(scaleMax)));

	function widthPercent(value: number): number {
		if (value <= 1) return 0;
		const ratio = Math.log10(value) / maxExponent;
		return Math.min(100, Math.max(0, ratio * 100));
	}

	const ticks = Array.from({ length: maxExponent + 1 }, (_, exponent) => ({
		exponent,
		leftPercent: (exponent / maxExponent) * 100,
		value: 10 ** exponent,
	}));

	return (
		<div className={styles.scene}>
			<p className={styles.sceneCaption}>fib(n) を求めるのに必要な計算の回数(対数スケール)</p>
			<p className={styles.sceneNote}>
				横軸は対数目盛(10のべき乗ごとに1目盛り)です。桁が大きく違う2つの回数を同じ図で
				比べるため、値そのものではなく桁数の違いを長さにしています(実際の回数は右側の
				数値ラベルを参照してください)。
			</p>
			<div className={styles.plot} role="group" aria-label="素朴な再帰とメモ化の計算回数の比較(対数スケール)">
				<div className={styles.axis} aria-hidden="true">
					{ticks.map(({ exponent, leftPercent, value }) => (
						<div key={exponent} className={styles.tick} style={{ left: `${leftPercent}%` }}>
							<span className={styles.tickLabel}>{formatCount(value)}</span>
						</div>
					))}
				</div>

				<div className={styles.barRow}>
					<span className={styles.barRowLabel}>素朴な再帰</span>
					<div className={styles.barTrack}>
						<div className={styles.barFillNaive} style={{ width: `${widthPercent(naiveCalls)}%` }} />
					</div>
					<span className={styles.barRowValue}>{formatCount(naiveCalls)} 回</span>
				</div>

				<div className={styles.barRow}>
					<span className={styles.barRowLabel}>メモ化</span>
					<div className={styles.barTrack}>
						{revealed && (
							<div className={styles.barFillMemo} style={{ width: `${widthPercent(memoizedCalls)}%` }} />
						)}
					</div>
					<span className={revealed ? styles.barRowValue : `${styles.barRowValue} ${styles.barRowValuePending}`}>
						{revealed ? `${formatCount(memoizedCalls)} 回` : '予想確定後に表示されます'}
					</span>
				</div>
			</div>
		</div>
	);
}

export default CallCountScene;
