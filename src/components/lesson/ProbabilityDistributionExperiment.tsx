import { useEffect, useRef, useState } from 'react';
import { expectedValue, distributionFromCounts, simulateDraws } from '../../lib/math/probabilityDistribution.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { ProbabilityDistributionScene } from '../scenes/mafs/ProbabilityDistributionScene.js';
import styles from './ProbabilityDistributionExperiment.module.css';

// 「確率分布と期待値」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。DataAnalysisExperiment / ProbabilityExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(賞金額・本数・
// シミュレーションのn・seed・prediction)をここに一元管理する(SSOT)。数学の計算は
// lib/math/probabilityDistribution.ts の純粋関数へ委譲し、この層は描画・入力同期・実行時検証
// (期待値の2経路一致)・提示に徹する。
//
// この単元の中核体験:
//   (1) くじ(賞金額×本数)の期待値 E[X]=Σx·p が「札の合計÷本数」という直感と一致すること。
//   (2) シード付きシミュレーションで n 回引いた標本平均が、n を増やすと E[X] へ落ち着くこと
//       (simple-probability で扱った「相対度数→理論確率」の発見の続き)。
//
// 乱数の再現性(タスク厳守事項): Math.random() は使わず、lib/math/probabilityDistribution.ts の
// simulateDraws(内部で probability.ts の createRng を再利用、再実装しない)を使う。初期シードは
// 固定定数(SSR/初期表示の決定性)とし、「引き直す」ボタンでのみシードを変える。

type Prediction = 'convergesToBiggestPrize' | 'convergesToWeightedValue' | 'staysRandom';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'convergesToBiggestPrize', label: '回数を増やすと、いちばん大きい賞金額に近づいていく' },
	{
		value: 'convergesToWeightedValue',
		label: '回数を増やすと、賞金額と本数の割合で決まる、ある特定の値に近づいていく',
	},
	{ value: 'staysRandom', label: '回数を増やしても、そのつど大きくばらつき続け、特定の値には近づかない' },
];

// くじの構成: 1等・2等・はずれ(0円)の3区分。賞金額(1等・2等)と本数(1等・2等・はずれ)は
// スライダー・数値入力で操作できる。はずれの賞金は常に0円(固定、変えても学習上の意味がない)。
const PRIZE1_MIN = 0;
const PRIZE1_MAX = 999;
const PRIZE2_MIN = 0;
const PRIZE2_MAX = 999;
const COUNT1_MIN = 0;
const COUNT1_MAX = 10;
const COUNT2_MIN = 0;
const COUNT2_MAX = 10;
// はずれの本数は最小1を要求する(1等・2等の本数がともに0でも、くじの総本数が必ず正になり、
// distributionFromCounts の「総本数0はRangeError」に UI からは到達しない設計)。
const COUNT3_MIN = 1;
const COUNT3_MAX = 20;

const INITIAL_PRIZE1 = 300;
const INITIAL_PRIZE2 = 100;
const INITIAL_COUNT1 = 1;
const INITIAL_COUNT2 = 2;
const INITIAL_COUNT3 = 3;

// 試行回数 n の範囲(ProbabilityExperiment と同じ 10〜6000、対数スケール)。
const N_MIN = 10;
const N_MAX = 6000;
const INITIAL_N = 10;
const SLIDER_MAX = 1000;
const LOG_N_MIN = Math.log10(N_MIN);
const LOG_N_MAX = Math.log10(N_MAX);

const INITIAL_SEED = 42;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return clamp(Math.round(value), min, max);
}

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	return clamp(Math.round(value), N_MIN, N_MAX);
}

/** 現在の n を、対数スケールのスライダー位置 [0, SLIDER_MAX] に変換する(表示専用)。 */
function nToSliderPosition(n: number): number {
	const clamped = clampN(n);
	const t = (Math.log10(clamped) - LOG_N_MIN) / (LOG_N_MAX - LOG_N_MIN);
	return Math.round(t * SLIDER_MAX);
}

/** スライダー位置 [0, SLIDER_MAX] を n(10〜6000の整数)に変換する。 */
function sliderPositionToN(position: number): number {
	const t = Math.min(SLIDER_MAX, Math.max(0, position)) / SLIDER_MAX;
	const value = 10 ** (LOG_N_MIN + t * (LOG_N_MAX - LOG_N_MIN));
	return clampN(value);
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

// 期待値を lib/math/probabilityDistribution.ts の distributionFromCounts→expectedValue を
// 経由せず、この層で独立に (Σ 値×本数) / 総本数 として計算する(C-7: 自己確認的な検証に
// しない。同じ式へ戻すだけの確認ではなく、別のコードパス(割り算してから内積を取るか、
// 先に積を合計してから最後に1回だけ割るか)で計算した値を突合する)。
function independentExpectedValue(values: readonly number[], counts: readonly number[]): number {
	let weightedSum = 0;
	let total = 0;
	for (let i = 0; i < values.length; i++) {
		weightedSum += values[i] * counts[i];
		total += counts[i];
	}
	return weightedSum / total;
}

// 初期状態(INITIAL_*)の期待値。checkpoint で「動かした結果、どれだけ変化したか」を示す
// 参照値として使う定数(状態に依存しないため、モジュールスコープで一度だけ求める)。
const INITIAL_VALUES = [INITIAL_PRIZE1, INITIAL_PRIZE2, 0];
const INITIAL_COUNTS = [INITIAL_COUNT1, INITIAL_COUNT2, INITIAL_COUNT3];
const INITIAL_EXPECTED = expectedValue(INITIAL_VALUES, distributionFromCounts(INITIAL_VALUES, INITIAL_COUNTS));

export function ProbabilityDistributionExperiment() {
	const [prize1, setPrize1] = useState(INITIAL_PRIZE1);
	const [prize2, setPrize2] = useState(INITIAL_PRIZE2);
	const [count1, setCount1] = useState(INITIAL_COUNT1);
	const [count2, setCount2] = useState(INITIAL_COUNT2);
	const [count3, setCount3] = useState(INITIAL_COUNT3);
	const [n, setN] = useState(INITIAL_N);
	const [seed, setSeed] = useState(INITIAL_SEED);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DataAnalysisExperiment と同じ理由:
	// 確定(blur/Enter)時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputPrize1, setInputPrize1] = useState(String(INITIAL_PRIZE1));
	const [inputPrize2, setInputPrize2] = useState(String(INITIAL_PRIZE2));
	const [inputCount1, setInputCount1] = useState(String(INITIAL_COUNT1));
	const [inputCount2, setInputCount2] = useState(String(INITIAL_COUNT2));
	const [inputCount3, setInputCount3] = useState(String(INITIAL_COUNT3));
	const [inputN, setInputN] = useState(String(INITIAL_N));

	useEffect(() => setInputPrize1(String(prize1)), [prize1]);
	useEffect(() => setInputPrize2(String(prize2)), [prize2]);
	useEffect(() => setInputCount1(String(count1)), [count1]);
	useEffect(() => setInputCount2(String(count2)), [count2]);
	useEffect(() => setInputCount3(String(count3)), [count3]);
	useEffect(() => setInputN(String(n)), [n]);

	const handlePrize1Change = (value: number) => setPrize1(clampInt(value, PRIZE1_MIN, PRIZE1_MAX, prize1));
	const handlePrize2Change = (value: number) => setPrize2(clampInt(value, PRIZE2_MIN, PRIZE2_MAX, prize2));
	const handleCount1Change = (value: number) => setCount1(clampInt(value, COUNT1_MIN, COUNT1_MAX, count1));
	const handleCount2Change = (value: number) => setCount2(clampInt(value, COUNT2_MIN, COUNT2_MAX, count2));
	const handleCount3Change = (value: number) => setCount3(clampInt(value, COUNT3_MIN, COUNT3_MAX, count3));
	const handleNSliderChange = (position: number) => setN(sliderPositionToN(position));

	function commitTextInput(
		text: string,
		setValue: (v: number) => void,
		setText: (s: string) => void,
		fallback: number,
		min: number,
		max: number,
	) {
		const parsed = Number(text);
		const next = Number.isFinite(parsed) && text.trim() !== '' ? clampInt(parsed, min, max, fallback) : fallback;
		setValue(next);
		setText(String(next));
	}

	const commitInputPrize1 = () =>
		commitTextInput(inputPrize1, setPrize1, setInputPrize1, prize1, PRIZE1_MIN, PRIZE1_MAX);
	const commitInputPrize2 = () =>
		commitTextInput(inputPrize2, setPrize2, setInputPrize2, prize2, PRIZE2_MIN, PRIZE2_MAX);
	const commitInputCount1 = () =>
		commitTextInput(inputCount1, setCount1, setInputCount1, count1, COUNT1_MIN, COUNT1_MAX);
	const commitInputCount2 = () =>
		commitTextInput(inputCount2, setCount2, setInputCount2, count2, COUNT2_MIN, COUNT2_MAX);
	const commitInputCount3 = () =>
		commitTextInput(inputCount3, setCount3, setInputCount3, count3, COUNT3_MIN, COUNT3_MAX);
	const commitInputN = () => {
		const parsed = Number(inputN);
		const next = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(next);
		setInputN(String(next));
	};

	const reroll = () => setSeed((s) => s + 1);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (1等の賞金額スライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const prize1SliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) prize1SliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setPrize1(INITIAL_PRIZE1);
		setPrize2(INITIAL_PRIZE2);
		setCount1(INITIAL_COUNT1);
		setCount2(INITIAL_COUNT2);
		setCount3(INITIAL_COUNT3);
		setN(INITIAL_N);
		setSeed(INITIAL_SEED);
	};

	// 数学モデルによる計算。lib/math/probabilityDistribution.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。はずれの本数下限が1のため、総本数は常に正であり
	// UI からは distributionFromCounts / simulateDraws の RangeError 経路に到達しない。
	const values = [prize1, prize2, 0];
	const counts = [count1, count2, count3];
	const total = count1 + count2 + count3;
	const probs = distributionFromCounts(values, counts);
	const ex = expectedValue(values, probs); // 経路A: Σ x·(c/N)(distributionFromCounts→expectedValue)
	const exIndependent = independentExpectedValue(values, counts); // 経路B: (Σ x·c) / N(このファイルの独立実装)
	const simulation = simulateDraws(seed, n, values, counts);

	// 実行時検証: 期待値の2つの計算経路(割り算してから内積を取る vs 先に合計してから割る)が
	// 一致するかを突合する(MATH_CONVENTIONS §1: 丸めない内部値で判定し、表示のみ丸める)。
	const scaleEx = Math.max(1, Math.abs(ex), Math.abs(exIndependent));
	const expectedValueDefinitionsMatch = approximatelyZero(ex - exIndependent, scaleEx);

	// よくある誤解の検証用: 「期待値は最も本数が多い値(最頻値)と一致する」という誤解を、
	// 実際の分布で確かめる(現在の設定でモード=期待値かどうかを動的に判定する)。
	const maxCount = Math.max(count1, count2, count3);
	const modeIndex = counts.findIndex((c) => c === maxCount);
	const modeValue = values[modeIndex];
	const modeEqualsExpected = approximatelyZero(ex - modeValue, Math.max(1, Math.abs(ex)));

	const predictionCorrect = prediction === 'convergesToWeightedValue';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="probability-distribution-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="probability-distribution-exp-title">実験: くじの賞金額・本数を変えて期待値と標本平均の関係を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、くじの
					賞金額・本数を変えながら、確率分布(棒グラフ)と期待値(重心のマーカー)の関係、
					および多数回引いたときの標本平均が期待値に近づく様子を観察できます。JavaScript
					が無効でも定義そのものは次の通りです: 期待値 E[X] = Σ(値 × 確率)。詳しくは下の
					「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の実験には、1等・2等・はずれの3種類からなるくじがあります。賞金額と本数はあとで
					自由に変えられます。<strong>操作する前に予想してください:</strong>{' '}
					このくじを何度も引いて標本平均(引いた金額の平均)を計算し、引く回数をどんどん
					増やしていくと、その標本平均はどうなっていくでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="probability-distribution-prediction"
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

			{/* Scene は予想ゲートの前から常時表示する(ProbabilityScene / ScatterScene と同じ方針:
			    本文が「下の実験には...くじがあります」と図を参照するため、矛盾を避ける)。 */}
			<div className={styles.scene}>
				<ProbabilityDistributionScene values={values} probs={probs} expectedValue={ex} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、賞金額・本数・試行回数を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 賞金額・本数のスライダー+数値入力+矢印キー、シミュレーションの n
					    スライダー+「引き直す」+リセット (docs/DESIGN.md §非機能要件)。 */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="prize1-number">1等の賞金額(円)</label>
							<input
								id="prize1-slider"
								ref={prize1SliderRef}
								type="range"
								min={PRIZE1_MIN}
								max={PRIZE1_MAX}
								step={1}
								value={prize1}
								aria-label="1等の賞金額(スライダー)"
								onChange={(e) => handlePrize1Change(Number(e.target.value))}
							/>
							<input
								id="prize1-number"
								type="text"
								inputMode="numeric"
								aria-describedby="prize1-range-hint"
								value={inputPrize1}
								onChange={(e) => setInputPrize1(e.target.value)}
								onBlur={commitInputPrize1}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputPrize1();
								}}
							/>
							<p id="prize1-range-hint" className={styles.rangeHint}>
								{PRIZE1_MIN}〜{PRIZE1_MAX}円の範囲で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="prize2-number">2等の賞金額(円)</label>
							<input
								id="prize2-slider"
								type="range"
								min={PRIZE2_MIN}
								max={PRIZE2_MAX}
								step={1}
								value={prize2}
								aria-label="2等の賞金額(スライダー)"
								onChange={(e) => handlePrize2Change(Number(e.target.value))}
							/>
							<input
								id="prize2-number"
								type="text"
								inputMode="numeric"
								aria-describedby="prize2-range-hint"
								value={inputPrize2}
								onChange={(e) => setInputPrize2(e.target.value)}
								onBlur={commitInputPrize2}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputPrize2();
								}}
							/>
							<p id="prize2-range-hint" className={styles.rangeHint}>
								{PRIZE2_MIN}〜{PRIZE2_MAX}円の範囲で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="count1-number">1等の本数</label>
							<input
								id="count1-slider"
								type="range"
								min={COUNT1_MIN}
								max={COUNT1_MAX}
								step={1}
								value={count1}
								aria-label="1等の本数(スライダー)"
								onChange={(e) => handleCount1Change(Number(e.target.value))}
							/>
							<input
								id="count1-number"
								type="text"
								inputMode="numeric"
								aria-describedby="count1-range-hint"
								value={inputCount1}
								onChange={(e) => setInputCount1(e.target.value)}
								onBlur={commitInputCount1}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputCount1();
								}}
							/>
							<p id="count1-range-hint" className={styles.rangeHint}>
								{COUNT1_MIN}〜{COUNT1_MAX}本の範囲で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="count2-number">2等の本数</label>
							<input
								id="count2-slider"
								type="range"
								min={COUNT2_MIN}
								max={COUNT2_MAX}
								step={1}
								value={count2}
								aria-label="2等の本数(スライダー)"
								onChange={(e) => handleCount2Change(Number(e.target.value))}
							/>
							<input
								id="count2-number"
								type="text"
								inputMode="numeric"
								aria-describedby="count2-range-hint"
								value={inputCount2}
								onChange={(e) => setInputCount2(e.target.value)}
								onBlur={commitInputCount2}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputCount2();
								}}
							/>
							<p id="count2-range-hint" className={styles.rangeHint}>
								{COUNT2_MIN}〜{COUNT2_MAX}本の範囲で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="count3-number">はずれ(0円)の本数</label>
							<input
								id="count3-slider"
								type="range"
								min={COUNT3_MIN}
								max={COUNT3_MAX}
								step={1}
								value={count3}
								aria-label="はずれの本数(スライダー)"
								onChange={(e) => handleCount3Change(Number(e.target.value))}
							/>
							<input
								id="count3-number"
								type="text"
								inputMode="numeric"
								aria-describedby="count3-range-hint"
								value={inputCount3}
								onChange={(e) => setInputCount3(e.target.value)}
								onBlur={commitInputCount3}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputCount3();
								}}
							/>
							<p id="count3-range-hint" className={styles.rangeHint}>
								{COUNT3_MIN}〜{COUNT3_MAX}本の範囲で指定できます(はずれは最低1本)。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="n-number">試行回数 n(何回引くか)</label>
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
							引き直す
						</button>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察: 確率分布表</h3>
						<table className={styles.valueTable}>
							<thead>
								<tr>
									<th scope="col">区分</th>
									<th scope="col">賞金額(円)</th>
									<th scope="col">本数</th>
									<th scope="col">確率</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<th scope="row">1等</th>
									<td>{prize1}</td>
									<td>{count1}</td>
									<td>{round2(probs[0])}</td>
								</tr>
								<tr>
									<th scope="row">2等</th>
									<td>{prize2}</td>
									<td>{count2}</td>
									<td>{round2(probs[1])}</td>
								</tr>
								<tr>
									<th scope="row">はずれ</th>
									<td>0</td>
									<td>{count3}</td>
									<td>{round2(probs[2])}</td>
								</tr>
								<tr>
									<th scope="row">合計</th>
									<td>—</td>
									<td>{total}</td>
									<td>{round2(probs[0] + probs[1] + probs[2])}</td>
								</tr>
							</tbody>
						</table>

						<h3>観察: 期待値とシミュレーション</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">期待値 E[X]</th>
									<td>{round2(ex)}</td>
								</tr>
								<tr>
									<th scope="row">標本平均(n={n}回)</th>
									<td>{round2(simulation.sampleMean)}</td>
								</tr>
								<tr>
									<th scope="row">差(標本平均−期待値)</th>
									<td>{round2(simulation.sampleMean - ex)}</td>
								</tr>
							</tbody>
						</table>
						<p className={expectedValueDefinitionsMatch ? styles.statusHeld : styles.statusBroken}>
							{expectedValueDefinitionsMatch
								? `期待値の2つの計算経路(Σx·(c/N) と (Σx·c)/N)は一致しています。`
								: '期待値の2つの計算経路が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						<p className={styles.statusNeutral}>
							{modeEqualsExpected
								? `現在、最も本数が多いのは${modeValue}円で、たまたま期待値と一致しています。`
								: `現在、最も本数が多いのは${modeValue}円ですが、期待値は${round2(ex)}円です。期待値は分布表のどの賞金額とも一致しないことがあります。`}
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
								: '実は、引く回数を増やしていくと、標本平均は期待値に近づいていきます。予想と見比べてみましょう。'}{' '}
							初期状態(1等{INITIAL_PRIZE1}円×{INITIAL_COUNT1}本・2等{INITIAL_PRIZE2}円×{INITIAL_COUNT2}
							本・はずれ0円×{INITIAL_COUNT3}本)では期待値は{round2(INITIAL_EXPECTED)}円でした。今、
							設定を変えた結果、期待値は{round2(ex)}円になっています。n={n}回引いた標本平均は
							{round2(simulation.sampleMean)}円です。
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 期待値 E[X]=Σ(賞金額×確率)は、「くじ全部の賞金の合計を本数で割った値」
							と同じ計算です——賞金額や本数を変えれば、この合計・本数の両方が変わるので、期待値も
							必ず変わります。試行回数 n を大きくスライダーで動かして、標本平均が期待値へ近づいて
							いく様子を確かめてみましょう。「引き直す」を押すと、同じ n のままシード(乱数の種)だけ
							変えた別の試行結果も確認できます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「期待値は、一番起こりやすい値(最頻値)と同じはずだ」と考えてしまうことが
							あります。しかし上の観察表で確かめた通り、期待値は分布表に並んだどの賞金額とも一致しない
							ことがあります——期待値は「実際に起こりうる結果の一つ」ではなく、多数回引いたときの
							標本平均が近づいていく先を表す統計的な要約値だからです。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default ProbabilityDistributionExperiment;
