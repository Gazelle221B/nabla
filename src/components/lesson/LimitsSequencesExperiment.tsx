import { useEffect, useRef, useState } from 'react';
import {
	classifyGeometricLimit,
	geometricPartialSum,
	geometricSeriesSum,
	type GeometricLimitClass,
} from '../../lib/math/sequenceLimits.js';
import { geometricTerm } from '../../lib/math/sequences.js';
import { SequenceLimitScene } from '../scenes/mafs/SequenceLimitScene.js';
import styles from './LimitsSequencesExperiment.module.css';

// 「数列の極限」のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース
// 境界)。SequenceExperiment / ProbabilityDistributionExperiment と同じ設計: 予想 → 操作
// (Scene + Controls) → 観察 → 確認 を1つの島に収め、状態(公比 r・表示モード・prediction)を
// ここに一元管理する(SSOT)。数学の計算は lib/math/sequenceLimits.ts と sequences.ts
// (geometricTerm、タスク厳守事項: 再利用・再実装しない)の純粋関数へ委譲し、この層は
// 描画・入力同期・実行時検証(分類と実測値の整合)・提示に徹する。
//
// この単元の中核体験: 公比 r のスライダーで等比数列 aₙ=r^(n−1) の点列の行き先が劇的に
// 変わる——|r|<1 で 0 へ収束・r=1 で一定・r>1 で発散・r≤−1 で振動(収束しない)。あわせて
// 無限等比級数 Σr^(n-1)=1/(1−r)(|r|<1)の部分和が一定値へ落ち着く体験を、表示切替
// (点列/部分和)で確かめる。

type DisplayMode = 'terms' | 'partialSums';
type Prediction = 'toZero' | 'toNonZero' | 'infinity' | 'oscillate';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'toZero', label: '0 に近づいていく' },
	{ value: 'toNonZero', label: '0 ではない、ある一定の値に近づいていく' },
	{ value: 'infinity', label: 'どこまでも大きくなっていく(発散する)' },
	{ value: 'oscillate', label: '符号を変えながら暴れ続け、特定の値には近づかない' },
];

// 公比 r の可動域: 4分類すべて(0へ収束・一定・発散・振動)に到達可能で、境界 r=±1 も
// ちょうど踏める(step=0.1 で -1.5 から積み上げると 1.0 / -1.0 に厳密に到達する)。
const R_MIN = -1.5;
const R_MAX = 1.5;
const R_STEP = 0.1;
const INITIAL_R = 0.8;

// プロットする項数・部分和の項数(n=1〜TERMS_COUNT)。r の可動域上限(|r|=1.5)でも
// geometricPartialSum(1.5, 15) = (1-1.5^15)/(1-1.5) ≈ 876 は有限で安全に計算できる
// (RangeError は発生しない)。表示レンジの安全設計は SequenceLimitScene 側の RANGE_CAP を参照。
const TERMS_COUNT = 15;

const CLASSIFICATION_LABEL: Record<GeometricLimitClass, string> = {
	'converges-to-zero': '0 へ収束',
	constant: '一定(収束、極限は1)',
	diverges: '発散',
	oscillates: '振動(収束しない)',
};

function clamp(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

// 表示専用の丸め(MATH_CONVENTIONS.md §1: 内部値は丸めず、表示のみ丸める)。
function round2(value: number): number {
	const rounded = Math.round(value * 100) / 100;
	return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 分類(classifyGeometricLimit、r のみから決まる)と、実際に計算した項の列(geometricTerm を
 * n=1..TERMS_COUNT でそれぞれ独立に評価した実測値)の傾向が整合しているかを検証する。
 * C-7: classifyGeometricLimit と geometricTerm は sequenceLimits.ts / sequences.ts の別々の
 * 独立した公開関数であり、この関数は「分類が主張する運命」と「実測された項の並び」という
 * 2つの独立した情報源を突き合わせる(同じ式へ戻すだけの自己確認ではない)。
 */
function classificationMatchesObservedTerms(classification: GeometricLimitClass, terms: readonly number[]): boolean {
	const first = terms[0];
	const last = terms[terms.length - 1];
	const secondLast = terms[terms.length - 2];
	switch (classification) {
		case 'converges-to-zero':
			return Math.abs(last) <= Math.abs(first);
		case 'constant':
			return terms.every((t) => t === first);
		case 'diverges':
			return last > secondLast && last > first;
		case 'oscillates':
			return Math.sign(last) !== Math.sign(secondLast);
		default:
			return false;
	}
}

export function LimitsSequencesExperiment() {
	const [r, setR] = useState(INITIAL_R);
	const [mode, setMode] = useState<DisplayMode>('terms');
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (SequenceExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputR, setInputR] = useState(String(INITIAL_R));
	useEffect(() => setInputR(String(r)), [r]);

	const handleRChange = (value: number) => setR(clamp(value, R_MIN, R_MAX, r));
	const commitInputR = () => {
		const parsed = Number(inputR);
		const next = Number.isFinite(parsed) && inputR.trim() !== '' ? clamp(parsed, R_MIN, R_MAX, r) : r;
		setR(next);
		setInputR(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (公比 r のスライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const rSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) rSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setR(INITIAL_R);
		setMode('terms');
	};

	// 数学モデルによる計算。lib/math の純粋関数をそのまま再利用する(重複実装しない、
	// タスク厳守事項)。r の可動域全域(境界 r=1 ちょうど・r=−1 ちょうど・|r|>1 の発散・振動を
	// 含む)で例外を起こさない設計であることは sequenceLimits.test.ts の不変条件テストと
	// このコンポーネントの結合テストの両方で担保する。
	const classification = classifyGeometricLimit(r);

	const terms: number[] = [];
	const partialSums: number[] = [];
	for (let n = 1; n <= TERMS_COUNT; n++) {
		terms.push(geometricTerm(1, r, n));
		partialSums.push(geometricPartialSum(r, n));
	}

	const seriesConverges = classification === 'converges-to-zero';
	// |r|>=1 では geometricSeriesSum が RangeError を投げる設計(収束しないことの明示)なので、
	// 収束するときだけ呼ぶ(UI からは非収束域で決して呼ばれない、根拠コメント)。
	const seriesSum = seriesConverges ? geometricSeriesSum(r) : null;
	const lastPartialSum = partialSums[partialSums.length - 1];
	const diffFromSeriesSum = seriesSum !== null ? lastPartialSum - seriesSum : null;

	// 実行時検証(1): 分類 classifyGeometricLimit(r) と、実際に計算した項の列の傾向が
	// 整合しているか(2つの独立した経路の突合、C-7)。
	const classificationConsistent = classificationMatchesObservedTerms(classification, terms);

	// 実行時検証(2): |r|<1 のとき、部分和と 1/(1−r) の差は n を大きくすると単調に縮む
	// (厳密には |Sₙ−S|=|r|^n・|S| という等比数列特有の性質、sequenceLimits.test.ts の
	// 不変条件テストで既に固定済み)。ここでは n=1 時点の差と n=TERMS_COUNT 時点の差を
	// 比較する、実測値どうしの独立した突合を行う。
	const partialSumApproachesLimit =
		seriesSum !== null ? Math.abs(lastPartialSum - seriesSum) <= Math.abs(partialSums[0] - seriesSum) : null;

	const predictionCorrect = prediction === 'toZero';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="limits-sequences-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="limits-sequences-exp-title">実験: 公比 r を動かして等比数列の行き先を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、公比 r を
					変えながら等比数列 aₙ=r^(n−1) の点列 (n, aₙ) の行き先(極限)を観察できます。
					JavaScript が無効でも要点は次の通りです: |r|&lt;1 なら 0 に収束し、r=1 なら一定値
					1 のまま、r&gt;1 ならどこまでも大きくなり(発散)、r≤−1 なら符号を変えながら
					特定の値に近づかない(振動)、という4つに分かれます。詳しくは下の「形式的な定義」を
					参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					公比 r=0.8 の等比数列 aₙ=r^(n−1)(a₁=1, a₂=0.8, a₃=0.64, …)を考えます。
					<strong>操作する前に予想してください:</strong> n をどこまでも大きくしていくと、
					点 (n, aₙ) はどこへ向かうでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="limits-sequences-prediction"
								value={opt.value}
								checked={prediction === opt.value}
								onChange={() => setPrediction(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</fieldset>
				{!submitted && (
					<button
						type="button"
						className={styles.primaryButton}
						disabled={prediction === null}
						onClick={() => setSubmitted(true)}
					>
						予想を確定して実験する
					</button>
				)}
			</div>

			{/* Scene は予想ゲートの前から常時表示する(ProbabilityDistributionScene / SequenceScene
			    と同じ方針: 本文が「公比r=0.8の等比数列を考えます」と図を参照するため矛盾を避ける)。
			    ただし極限値の破線と lim の数式ラベルはこの単元の「答え」なので、予想確定まで隠す。 */}
			<div className={styles.scene}>
				<SequenceLimitScene r={r} termsCount={TERMS_COUNT} mode={mode} showLimit={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、公比 r を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 表示切替(点列/部分和)+ r のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<fieldset className={styles.modeFieldset}>
						<legend>グラフの表示</legend>
						<label className={styles.modeOption}>
							<input
								type="radio"
								name="limits-sequences-mode-select"
								value="terms"
								checked={mode === 'terms'}
								onChange={() => setMode('terms')}
							/>
							点列 (n, aₙ)
						</label>
						<label className={styles.modeOption}>
							<input
								type="radio"
								name="limits-sequences-mode-select"
								value="partialSums"
								checked={mode === 'partialSums'}
								onChange={() => setMode('partialSums')}
							/>
							部分和 (n, Sₙ)
						</label>
					</fieldset>

					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="r-number">公比 r</label>
							<input
								id="r-slider"
								ref={rSliderRef}
								type="range"
								min={R_MIN}
								max={R_MAX}
								step={R_STEP}
								value={r}
								aria-label="公比 r(スライダー)"
								onChange={(e) => handleRChange(Number(e.target.value))}
							/>
							<input
								id="r-number"
								type="text"
								inputMode="decimal"
								aria-describedby="r-range-hint"
								value={inputR}
								onChange={(e) => setInputR(e.target.value)}
								onBlur={commitInputR}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputR();
								}}
							/>
							<p id="r-range-hint" className={styles.rangeHint}>
								r は {R_MIN}〜{R_MAX} の範囲で指定できます(境界 r=1・r=−1 もちょうど指定できます)。
							</p>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">公比 r</th>
									<td>{round2(r)}</td>
								</tr>
								<tr>
									<th scope="row">分類</th>
									<td>{CLASSIFICATION_LABEL[classification]}</td>
								</tr>
								<tr>
									<th scope="row">a{TERMS_COUNT}(第{TERMS_COUNT}項)の実値</th>
									<td>{round2(terms[terms.length - 1])}</td>
								</tr>
								<tr>
									<th scope="row">S{TERMS_COUNT}(部分和)の実値</th>
									<td>{round2(lastPartialSum)}</td>
								</tr>
								<tr>
									<th scope="row">1/(1−r)(無限級数の和)</th>
									<td>{seriesSum === null ? '級数は収束しません' : round2(seriesSum)}</td>
								</tr>
								<tr>
									<th scope="row">差(S{TERMS_COUNT}−1/(1−r))</th>
									<td>{diffFromSeriesSum === null ? '定義されません' : round2(diffFromSeriesSum)}</td>
								</tr>
							</tbody>
						</table>

						<p className={classificationConsistent ? styles.statusHeld : styles.statusBroken}>
							{classificationConsistent
								? `分類(${CLASSIFICATION_LABEL[classification]})と実際に計算した項の並びは整合しています。`
								: '分類と実際に計算した項の並びが整合しません。数学モデルに問題がある可能性があります。'}
						</p>
						{partialSumApproachesLimit !== null && (
							<p className={styles.statusNeutral}>
								{partialSumApproachesLimit
									? `部分和と1/(1−r)の差は、n=1のとき${round2(Math.abs(partialSums[0] - (seriesSum ?? 0)))}でしたが、n=${TERMS_COUNT}では${round2(Math.abs(diffFromSeriesSum ?? 0))}に縮んでいます。`
									: '部分和が1/(1−r)へ近づいていません。数学モデルに問題がある可能性があります。'}
							</p>
						)}
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。'
								: '実は、r=0.8 のように |r|<1 のとき、点 aₙ=r^(n−1) は n を大きくすると 0 に近づいていきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: |r|&lt;1 のとき、n を1増やすごとに aₙ の絶対値は「1未満の比率 |r| 倍」に
							なり続けるため、どこまでも小さくなっていき 0 に近づきます(r=0 で第2項からちょうど 0 に
							なる場合を除けば 0 にちょうど到達することはありませんが、いくらでも 0 に近づけます)。
							r を動かして4つの運命を確かめてみましょう: r=1 ではすべての項がちょうど1のまま一定に、
							r&gt;1 では |r|&gt;1 倍で増え続けるためどこまでも大きくなり(発散)、r=−1 では絶対値1のまま
							符号だけが交互に反転し、r&lt;−1 では符号が反転しながら絶対値もどこまでも大きくなるため、
							どちらも特定の値に近づかず暴れ続けます(振動)。上の表示切替で「部分和」に切り替えると、
							|r|&lt;1 のときだけ Sₙ が一定値 1/(1−r) へ近づいていく様子も確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「振動する数列も、行ったり来たりする2つの値のどちらかに収束している」と
							考えたくなるかもしれません。しかし振動は「特定の1つの値に近づいていく」という収束の
							定義を満たさないため、収束とは呼びません(r=−1 の点列 aₙ は 1 と −1 の間を往復し
							続けます——「1に収束」でも「−1に収束」でもなく、上の表の分類はこれを「振動
							(収束しない)」と正しく区別します)。r をスライダーで −1 ちょうど・1 ちょうどに
							動かして、境界での挙動の違いを確かめてみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default LimitsSequencesExperiment;
