import { useEffect, useMemo, useRef, useState } from 'react';
import {
	exactSumDistribution,
	sumMeanVariance,
	meanVarianceFromDistribution,
	simulateDiceSums,
	sumFrequencies,
	sampleMeanOfSums,
	maxAbsDeviationFromNormal,
	rationalEquals,
} from '../../lib/math/centralLimit.js';
import { createRng } from '../../lib/math/probability.js';
import { CltScene } from '../scenes/pixi/CltScene.js';
import { computeTrialsPerDot } from '../scenes/pixi/dotDensity.js';
import styles from './CltExperiment.module.css';

// 「大量試行 — 大数の法則と中心極限定理」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。ProbabilityDistributionExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(k・n・seed・prediction)
// をここに一元管理する(SSOT)。数学の計算は lib/math/centralLimit.ts の純粋関数へ委譲し、
// この層は描画・入力同期・実行時検証(期待値の2経路一致)・提示に徹する。
//
// この単元の中核体験:
//   (1) 大数の法則: 試行回数 n を増やすと、標本平均が期待値 3.5k へ吸い付いていく。
//   (2) 中心極限定理: サイコロの個数 k を増やすと、和の分布の形が「平ら(k=1)→三角形(k=2)→
//       釣鐘(k が大きい)」に変形し、正規分布へ近づいていく——正規近似との最大偏差
//       (maxAbsDeviationFromNormal)が k を増やすほど縮んでいくことでも確かめられる。
//
// プロジェクト初の Tier 2(Pixi.js)単元(ADR-004): 描画は CltScene(Pixi)へ委譲し、
// この Island 自身は Pixi を import しない。a11y の主担保は本コンポーネントの観察表
// (DOM・aria-live)であり、Pixi の canvas は装飾的な視覚表現に徹する(ADR-004 §5)。
//
// 乱数の再現性(タスク厳守事項): Math.random() は使わず、lib/math/probability.ts の
// createRng(シード付き決定的 mulberry32)を simulateDiceSums 経由で使う。初期シードは
// 固定定数(SSR/初期表示の決定性)とし、「振り直す」ボタンでのみシードを変える。

type Prediction = 'flat' | 'mountain' | 'random';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'flat', label: '平らのまま(どの和も同じくらいの起こりやすさ)になる' },
	{ value: 'mountain', label: '真ん中が高い山形(釣鐘のような形)になる' },
	{ value: 'random', label: 'でこぼこで、特に規則性はない' },
];

// サイコロの個数 k(1〜12、step 1)。lib/math/centralLimit.ts の許容範囲と一致させる。
const K_MIN = 1;
const K_MAX = 12;
const INITIAL_K = 1; // 導入(サイコロ1個=一様分布)に合わせ、予想確定前はk=1を表示する。

// 試行回数 n(100〜50,000、対数スケール、probability.ts/probabilityDistribution.tsの前例)。
const N_MIN = 100;
const N_MAX = 50000;
const INITIAL_N = 100;
const SLIDER_MAX = 1000;
const LOG_N_MIN = Math.log10(N_MIN);
const LOG_N_MAX = Math.log10(N_MAX);

const INITIAL_SEED = 42;

function clampK(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_K;
	return Math.min(K_MAX, Math.max(K_MIN, Math.round(value)));
}

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	return Math.min(N_MAX, Math.max(N_MIN, Math.round(value)));
}

/** 現在の n を、対数スケールのスライダー位置 [0, SLIDER_MAX] に変換する(表示専用)。 */
function nToSliderPosition(n: number): number {
	const clamped = clampN(n);
	const t = (Math.log10(clamped) - LOG_N_MIN) / (LOG_N_MAX - LOG_N_MIN);
	return Math.round(t * SLIDER_MAX);
}

/** スライダー位置 [0, SLIDER_MAX] を n(100〜50,000の整数)に変換する。 */
function sliderPositionToN(position: number): number {
	const t = Math.min(SLIDER_MAX, Math.max(0, position)) / SLIDER_MAX;
	const value = 10 ** (LOG_N_MIN + t * (LOG_N_MAX - LOG_N_MIN));
	return clampN(value);
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

export function CltExperiment() {
	const [k, setK] = useState(INITIAL_K);
	const [n, setN] = useState(INITIAL_N);
	const [seed, setSeed] = useState(INITIAL_SEED);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state(DefiniteIntegralExperiment 等と同じ理由:
	// 確定(blur/Enter)時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputK, setInputK] = useState(String(INITIAL_K));
	const [inputN, setInputN] = useState(String(INITIAL_N));

	useEffect(() => setInputK(String(k)), [k]);
	useEffect(() => setInputN(String(n)), [n]);

	const handleKSliderChange = (value: number) => setK(clampK(value));
	const handleNSliderChange = (position: number) => setN(sliderPositionToN(position));

	const commitInputK = () => {
		const parsed = Number(inputK);
		const next = Number.isFinite(parsed) && inputK.trim() !== '' ? clampK(parsed) : k;
		setK(next);
		setInputK(String(next));
	};

	const commitInputN = () => {
		const parsed = Number(inputN);
		const next = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(next);
		setInputN(String(next));
	};

	const reroll = () => setSeed((s) => s + 1);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (k のスライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const kSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) kSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setK(INITIAL_K);
		setN(INITIAL_N);
		setSeed(INITIAL_SEED);
	};

	// 数学モデルによる計算。lib/math/centralLimit.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。k・n の全域(50,000回の試行を含む)で例外を起こさない。
	// useMemo: n が最大 50,000・k が最大 12 のとき simulateDiceSums は最大60万回サイコロを
	// 振るため、無関係な再レンダー(prediction のラジオ選択等)で毎回再計算しないようにする。
	const dist = useMemo(() => exactSumDistribution(k), [k]);
	const formula = useMemo(() => sumMeanVariance(k), [k]);
	const fromDist = useMemo(() => meanVarianceFromDistribution(dist), [dist]);
	const maxDeviation = useMemo(() => maxAbsDeviationFromNormal(k), [k]);
	const sums = useMemo(() => simulateDiceSums(createRng(seed), k, n), [seed, k, n]);
	const freqs = useMemo(() => sumFrequencies(sums, k), [sums, k]);
	const sampleMean = useMemo(() => sampleMeanOfSums(sums), [sums]);
	const exactProbabilities = useMemo(() => dist.counts.map((c) => c / dist.total), [dist]);
	const sigma = Math.sqrt(formula.variance);
	const trialsPerDot = computeTrialsPerDot(freqs);

	// 実行時交差検証: 期待値・分散の2経路(公式 sumMeanVariance vs 厳密分布からの計算
	// meanVarianceFromDistribution)が一致するかを厳密有理数として突合する(度数の総和が
	// n と一致するかを見た ProbabilityExperiment と同じ「断言せず実際に確かめる」設計)。
	const meanMatches = rationalEquals(formula.meanExact, fromDist.meanExact);
	const varianceMatches = rationalEquals(formula.varianceExact, fromDist.varianceExact);
	const crossValidationHeld = meanMatches && varianceMatches;

	const diff = sampleMean - formula.mean;
	const predictionCorrect = prediction === 'mountain';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="clt-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="clt-exp-title">実験: サイコロを何個も足して、試行回数と個数を変えてみる</h2>

			{/* JS 無効時のフォールバック (Pixi はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、サイコロ
					k個の和を n 回試行した結果をドットヒストグラムで観察できます。
					<strong>
						試行回数 n を増やすと標本平均は期待値 3.5k の近くに落ち着いていく傾向が強まり(大数の法則——確率的な言明で、1回ごとの実験で必ずではありません)、サイコロの個数 k
						を増やすと和の分布の形は平ら→三角形→釣鐘型へと変わっていきます(中心極限定理)。
					</strong>
					詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					サイコロ1個の出目の分布は、1〜6のどの目も同じ確率 1/6 で、平らな形をしています。
					<strong>操作する前に予想してください:</strong> では、サイコロ2個の和・5個の和のように、
					足すサイコロの個数を増やしていくと、和の分布の形はどうなっていくでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="clt-prediction"
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

			{/* Scene: Tier 2 (Pixi.js) 図解。ドットヒストグラムは予想ゲート前から常時表示するが、
			    厳密分布の輪郭・正規近似曲線(答え)は revealAnswer=submitted のときのみ表示する。 */}
			<div className={styles.scene}>
				<CltScene
					frequencies={freqs}
					k={k}
					exactProbabilities={exactProbabilities}
					mean={formula.mean}
					sigma={sigma}
					revealAnswer={submitted}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、サイコロの個数 k・試行回数 n
					を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: k のスライダー(線形)+ n のスライダー(対数)+ 数値入力 + 矢印キー +
					    リセット + 振り直す (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="k-number">サイコロの個数 k</label>
							<input
								id="k-slider"
								ref={kSliderRef}
								type="range"
								min={K_MIN}
								max={K_MAX}
								step={1}
								value={k}
								aria-label="サイコロの個数 k(スライダー)"
								onChange={(e) => handleKSliderChange(Number(e.target.value))}
							/>
							<input
								id="k-number"
								type="text"
								inputMode="numeric"
								aria-describedby="k-range-hint"
								value={inputK}
								onChange={(e) => setInputK(e.target.value)}
								onBlur={commitInputK}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputK();
								}}
							/>
							<p id="k-range-hint" className={styles.rangeHint}>
								{K_MIN}〜{K_MAX}個の範囲で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="n-number">試行回数 n</label>
							<input
								id="n-slider"
								type="range"
								min={0}
								max={SLIDER_MAX}
								step={1}
								value={nToSliderPosition(n)}
								aria-label="試行回数 n(スライダー、対数目盛り)"
								aria-valuetext={`${n} 回`}
								onChange={(e) => handleNSliderChange(Number(e.target.value))}
							/>
							<input
								id="n-number"
								type="text"
								inputMode="numeric"
								aria-describedby="n-range-hint"
								value={inputN}
								onChange={(e) => setInputN(e.target.value)}
								onBlur={commitInputN}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputN();
								}}
							/>
							<p id="n-range-hint" className={styles.rangeHint}>
								試行回数 n は {N_MIN}〜{N_MAX} の範囲で指定できます(対数目盛り)。
							</p>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reroll}>
							振り直す
						</button>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: DOM 側の観察表(a11y の主担保、ADR-004)。値の列は常に実値を表示し
					    (検証フラグは下のステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察: 標本平均と正規近似</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">標本平均(n={n}回、k={k}個の和)</th>
									<td>{round4(sampleMean)}</td>
								</tr>
								<tr>
									<th scope="row">期待値 3.5k</th>
									<td>{round4(formula.mean)}</td>
								</tr>
								<tr>
									<th scope="row">|差|(標本平均−期待値)</th>
									<td>{round4(Math.abs(diff))}</td>
								</tr>
								<tr>
									<th scope="row">和 S の理論標準偏差 σ(k のみに依存)</th>
									<td>{round4(sigma)}</td>
								</tr>
								{/* QA 指摘の反映: 転用問題3(√n 法則)が「n を動かして縮み方を確かめる」
								    と誘導するのに対し、σ は n に依存しない。n に反応して縮む
								    「標本平均の理論標準偏差 σ/√n」を別行で示し、体感の受け皿にする。 */}
								<tr>
									<th scope="row">σ/√n(標本平均の理論上のばらつき、n に反応)</th>
									<td>{round4(sigma / Math.sqrt(n))}</td>
								</tr>
								<tr>
									<th scope="row">厳密分布と正規分布の最大偏差(k のみに依存)</th>
									<td>{round4(maxDeviation)}</td>
								</tr>
								<tr>
									<th scope="row">1ドットが表す試行回数(端数は切り上げ)</th>
									<td>約{trialsPerDot}</td>
								</tr>
							</tbody>
						</table>
						<p className={crossValidationHeld ? styles.statusHeld : styles.statusBroken}>
							{crossValidationHeld
								? '期待値・分散の2つの計算経路(公式 3.5k・35k/12 と、厳密分布から直接計算した値)は一致しています。'
								: '期待値・分散の2つの計算経路が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
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
								: '実は、サイコロの個数 k を増やしていくと、和の分布の形は真ん中が高い山形(釣鐘型)へ近づいていきます。予想と見比べてみましょう。'}{' '}
							k を1から12まで動かして、上の図の形が平ら→三角形→釣鐘型へ変わっていく様子と、
							「正規近似との最大偏差」の値が k を増やすほど小さくなっていく様子を確かめてみましょう。
						</p>
						<p className={styles.narration}>
							なぜそうなるのか(大数の法則): 試行回数 n が小さいうちは、標本平均はたまたま
							期待値から離れた値になることが珍しくありません。しかし n を大きくしていくと、
							偶然の偏りは全体の中でだんだん薄まっていき、標本平均は期待値 3.5k
							に近い値へ落ち着いていきます。ただしこれは「n を大きくすれば必ずぴったり一致する」
							という意味ではなく、「近づいていく確率が高くなる」という確率的な言明である点に
							注意してください——1回の実験で偶然大きくずれることは、n
							がどれだけ大きくても理論上ありえます。
						</p>
						<p className={styles.narration}>
							なぜそうなるのか(中心極限定理): サイコロ1個の和(k=1)は平らな一様分布ですが、
							2個の和(k=2)になると、和が7になる組み合わせ((1,6)(2,5)…など6通り)が
							和が2になる組み合わせ((1,1)の1通り)よりずっと多いため、真ん中が高い三角形の
							形になります。足すサイコロの個数を増やすほど、真ん中の和になる組み合わせの数が
							両端に比べて相対的にさらに多くなり、分布の形は釣鐘型(正規分布)へ近づいていきます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「元になる分布が平ら(一様)なら、いくつ足しても平らなままのはずだ」
							と考えたくなるかもしれません。しかし上で確かめた通り、k=2 の時点ですでに三角形に
							変わり、k=5 では釣鐘型に近づきます——<strong>足すという操作そのものが、分布の形を
							変えてしまう</strong>のです。これが中心極限定理の核心です。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default CltExperiment;
