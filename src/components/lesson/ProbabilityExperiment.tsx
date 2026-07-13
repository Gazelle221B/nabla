import { useEffect, useRef, useState } from 'react';
import { simulateDice, relativeFrequencies, theoreticalProbability } from '../../lib/math/probability.js';
import { ProbabilityScene } from '../scenes/mafs/ProbabilityScene.js';
import styles from './ProbabilityExperiment.module.css';

// 「確率 — 単純な試行と相対度数」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。SequenceExperiment / DefiniteIntegralExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(seed, n, prediction)を
// ここに一元管理する(SSOT)。数学の計算は lib/math/probability.ts の純粋関数へ委譲し、
// この層は描画・入力同期・実行時検証(度数の総和=n)・提示に徹する。
//
// この単元の中核体験: サイコロを振る回数 n を増やしていくと、各目の相対度数がばらつきながら
// 理論確率 1/6 へ近づいていく。少数回では大きくばらつくのに、回数を増やすと安定する——
// 「確率とは、多数回の試行で現れる割合の落ち着き先である」という感覚をつかむ。
//
// 乱数の再現性(タスク厳守事項): Math.random() は使わず、lib/math/probability.ts の
// createRng(シード付き決定的 PRNG)を simulateDice 経由で使う。同じシードなら必ず同じ試行列に
// なる。初期シードは固定定数(SSR/初期表示の決定性)とし、「振り直す」ボタンでのみシードを
// 変える(これが唯一の「再現不能」の入口であり、意図的にそう設計している)。

type Prediction = 'biased' | 'converges' | 'random';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'biased', label: 'どれか1つの目に偏っていく' },
	{ value: 'converges', label: 'どの目もほぼ同じ割合に落ち着く' },
	{ value: 'random', label: 'ばらばらのまま、傾向は見えない' },
];

const FACES = [1, 2, 3, 4, 5, 6] as const;

// 初期シードは固定定数(SSR/初期表示の決定性、タスク厳守事項)。「振り直す」を押すたびに
// 1ずつ増やす(暗号用途ではなく教材内シミュレーションのシード変更のため、単純増分で十分。
// Math.random() は lib/math は元より UI 層でも使わない——シードの由来を常に追跡可能にする)。
const INITIAL_SEED = 42;

// 試行回数 n の範囲(タスク仕様: 10〜6000)。
const N_MIN = 10;
const N_MAX = 6000;
const INITIAL_N = 10;

// スライダーは対数的なステップにする: n=10,100,1000,6000 のような桁違いの値を
// 均等な操作幅で行き来できるようにする(線形だと 10→100 のような小さい桁の変化が
// スライダーのほんの一部分に押し込められ、操作しにくくなるため)。
// スライダー自体の内部値は [0, SLIDER_MAX] の整数(HTML range の都合)で、
// 対数空間 [log10(N_MIN), log10(N_MAX)] へ線形にマッピングする。
const SLIDER_MAX = 1000;
const LOG_N_MIN = Math.log10(N_MIN);
const LOG_N_MAX = Math.log10(N_MAX);

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	const rounded = Math.round(value);
	return Math.min(N_MAX, Math.max(N_MIN, rounded));
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

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

export function ProbabilityExperiment() {
	const [seed, setSeed] = useState(INITIAL_SEED);
	const [n, setN] = useState(INITIAL_N);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DefiniteIntegralExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputN, setInputN] = useState(String(INITIAL_N));

	useEffect(() => {
		setInputN(String(n));
	}, [n]);

	const handleSliderChange = (position: number) => setN(sliderPositionToN(position));

	const commitInputN = () => {
		const parsed = Number(inputN);
		const next = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(next);
		setInputN(String(next));
	};

	const reroll = () => setSeed((s) => s + 1);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (n のスライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const nSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) nSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setSeed(INITIAL_SEED);
		setN(INITIAL_N);
	};

	// 数学モデルによる計算。lib/math/probability.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。n の全域(10〜6000)・振り直し・シード変更の
	// いずれでも例外を起こさない。
	const counts = simulateDice(seed, n);
	const relFreqs = relativeFrequencies(counts);
	const theoretical = theoreticalProbability(1, 6);
	const diffs = relFreqs.map((value) => value - theoretical);

	// 実行時検証: 度数の総和は必ず試行回数 n と一致する(simulateDice の出力を、この層でも
	// 独立に合算して確かめる。断言せず、実際に一致しているかを見てからステータス文を出す。
	// レビュー学習: 値列は常に実値を表示し、検証はステータス文専用にする)。
	const sumCounts = counts.reduce((a, b) => a + b, 0);
	const sumVerified = sumCounts === n;

	const predictionCorrect = prediction === 'converges';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="probability-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="probability-exp-title">実験: サイコロを振る回数を増やして相対度数の変化を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、サイコロを
					振る回数 n を変えながら、出目1〜6それぞれの相対度数(出た回数 ÷ 試行回数)を
					棒グラフで観察できます。
					<strong>回数を増やしていくと、各目の相対度数は理論確率 1/6 に近づいていきます。</strong>
					JavaScript が無効でも定義そのものは次の通りです: 相対度数 = その目が出た回数 ÷
					試行回数、理論確率(同様に確からしい場合)= 条件に合う場合の数 ÷ すべての場合の数。
					詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、サイコロを n 回振ったときの出目1〜6それぞれの相対度数(棒の高さ)と、
					理論確率 1/6(破線)を示しています。<strong>操作する前に予想してください:</strong>{' '}
					サイコロを振る回数を増やしていくと、各目の出る割合はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="probability-prediction"
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

			{/* Scene: Tier 1 図解 (出目1〜6の相対度数の棒グラフ + 理論確率 1/6 の基準線)。 */}
			<div className={styles.scene}>
				<ProbabilityScene counts={counts} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、試行回数 n を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: n のスライダー(対数スケール)+ 数値入力 + 矢印キー + リセット + 振り直し
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="n-number">試行回数 n</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。
							    スライダーの内部値は対数スケール上の位置であり、n そのものではない。 */}
							<input
								id="n-slider"
								ref={nSliderRef}
								type="range"
								min={0}
								max={SLIDER_MAX}
								step={1}
								value={nToSliderPosition(n)}
								aria-label="試行回数 n(スライダー、対数目盛り)"
								onChange={(e) => handleSliderChange(Number(e.target.value))}
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
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reroll}>
							振り直す
						</button>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>

						<p id="n-range-hint" className={styles.rangeHint}>
							試行回数 n は {N_MIN}〜{N_MAX} の範囲で指定できます(スライダーは桁の変化が
							見やすいよう対数目盛りにしています)。「振り直す」を押すと、同じ n
							のままサイコロを振り直した別の結果を観察できます。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<thead>
								<tr>
									<th scope="col">目</th>
									{FACES.map((face) => (
										<th scope="col" key={face}>
											{face}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								<tr>
									<th scope="row">度数</th>
									{counts.map((count, i) => (
										<td key={i}>{count}</td>
									))}
								</tr>
								<tr>
									<th scope="row">相対度数</th>
									{relFreqs.map((value, i) => (
										<td key={i}>{round4(value)}</td>
									))}
								</tr>
								<tr>
									<th scope="row">理論確率との差</th>
									{diffs.map((diff, i) => (
										<td key={i}>{round4(diff)}</td>
									))}
								</tr>
							</tbody>
						</table>
						<p className={sumVerified ? styles.statusHeld : styles.statusBroken}>
							{sumVerified
								? `度数の総和(${sumCounts})は試行回数 n(${n})と一致しています。`
								: '度数の総和が試行回数と一致しません。数学モデルに問題がある可能性があります。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想:{' '}
							<strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。試行回数を増やしていくと、各目の相対度数は理論確率 1/6 に近づいていきます。'
								: '実は、試行回数を増やしていくと、各目の相対度数は理論確率 1/6 に近づいていきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 試行回数 n が小さいうちは、たまたま1つの目が続けて出る・
							ある目が1回も出ない、ということが珍しくありません。しかし n
							を大きくしていくと、そうした偶然の偏りは全体の中でだんだん薄まっていき、
							各目の相対度数は理論確率 1/6 に近い値へ落ち着いていきます。n
							のスライダーを大きい値(例えば数千)まで動かして、上の「理論確率との差」の列が
							だんだん小さくなっていく様子を確かめてみましょう。
						</p>
						<p className={styles.narration}>
							よくある誤解:「振り直す」を押して、たまたま同じ目が何度か続けて出たとき、
							「これだけ偏ったのだから、次はそろそろ別の目が出やすいはずだ」と考えたくなる
							かもしれません(ギャンブラーの誤謬と呼ばれる考え方)。しかしサイコロの
							各回の試行は独立していて、前の結果が次の結果に影響を与えることはありません
							——1回1回の確率は常に 1/6 のままです。「振り直す」を何度か押して、n
							が小さいときは毎回かなり違う結果(ばらつき)になる一方、n
							を大きくすると振り直すたびの結果の違いが小さくなっていくことを確かめれば、
							「偏りは回数を重ねるうちに薄まっていくだけで、次の1回が特別に調整される
							わけではない」ことが観察できます。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default ProbabilityExperiment;
