import { useEffect, useMemo, useRef, useState } from 'react';
import {
	squareWave,
	squareWaveCoefficient,
	fourierPartialSum,
	computeCoefficientByQuadrature,
} from '../../lib/math/fourierSquareWave.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { FourierScene } from '../scenes/mafs/FourierScene.js';
import styles from './FourierSeriesExperiment.module.css';

// 「フーリエ級数」のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース
// 境界)。LimitsSequencesExperiment / ProbabilityDistributionExperiment と同じ設計: 予想 → 操作
// (Scene + Controls) → 観察 → 確認 を1つの島に収め、状態(項数 N・時刻 t・prediction)を
// ここに一元管理する(SSOT)。数学の計算は lib/math/fourierSquareWave.ts の純粋関数へ委譲し、
// この層は描画・入力同期・実行時検証(求積 vs 閉形式の突合)・提示に徹する。
//
// この単元の中核体験: 滑らかなサイン波(奇数次高調波)だけを足し重ねていくと、角ばった方形波に
// どこまで近づけるか。N を増やすと波形は方形波へ寄っていく一方、不連続点のそばに残る「ツノ」
// (ギブス現象。ピーク≈1.18、1からのはみ出し≈0.18=ジャンプ幅2の約9%)は N を増やしても消えない——
// 「各点の収束」と「一様収束」の違いを発見する。

type Prediction = 'can-fully' | 'cannot-round' | 'almost-but-corner';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'can-fully', label: 'できる(いくらでも近づき、角もそのまま再現できる)' },
	{ value: 'cannot-round', label: 'できない(どこまでいっても丸みが残る)' },
	{ value: 'almost-but-corner', label: 'ほぼできるが、角のそばだけどうしても帳尻が合わない' },
];

const N_MIN = 1;
const N_MAX = 50;
const N_STEP = 1;
const INITIAL_N = 5;

const T_MIN = 0;
const T_MAX = 2 * Math.PI;
// t の刻みは π/60 ≒ 0.0524。0.05 のような10進の刻みだと π/2 や π(不連続点)が格子に
// 乗らず、「表示は 1π なのに実値は π を超えていて square が −1」という偽表示が起きる
// (QA 指摘)。π の有理数倍を格子にすることで、代表点 π/2・π・3π/2・2π に厳密に到達できる。
const T_STEP = Math.PI / 60;
const INITIAL_T = Math.PI / 2;

// 最大値の数値走査の分割数。fourierSquareWave.test.ts のギブス現象golden値と同じ分割数を
// 使うことで、テストで固定した実測値(N=10で約1.1798等)とこのUIの表示値が一致する
// (2000点で200000点走査と同一の最大値へ収束することを node で確認済み、テストのコメント参照)。
const MAX_SCAN_SAMPLES = 2000;

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
 * t をπの倍数として表示するための整形(表示専用)。小数2桁だと t=3.15(>π)が「1π」に
 * 丸まって実値(square=−1)と矛盾する偽表示になるため(QA 指摘)、3桁+「≈」で表示する。
 * 格子点(π/60 の倍数)がちょうど π の見やすい倍数のときだけ「≈」を外す。
 */
function formatAsPiMultiple(t: number): string {
	const ratio = t / Math.PI;
	const rounded3 = Math.round(ratio * 1000) / 1000;
	const isExactish = Math.abs(ratio - rounded3) < 1e-12;
	const shown = Object.is(rounded3, -0) ? 0 : rounded3;
	return `${isExactish ? '' : '≈'}${shown}π`;
}

/**
 * S_N の最大値を [0, 2π] 全体で数値走査する(ギブス現象の観察: N を増やしても最大値が1へ
 * 戻らないことを、実際に計算した値の列から確認する)。fourierPartialSum(N, t) をそのまま
 * 再利用する(重複実装しない、タスク厳守事項)。
 * 走査区間は [0, π]: S_N は S_N(t+π) = −S_N(t) を満たすため正の最大値は [0, π] 側に必ず
 * 現れ、テスト(maxOfPartialSum、[0,π]×2000点)と区間・分割数が一致する(GrokBuild
 * レビュー指摘の反映——以前は [0,2π]×2000点で、テストとの同一性主張が不正確だった)。
 */
function scanMaxPartialSum(nTerms: number, samples: number): number {
	let maxVal = -Infinity;
	for (let i = 1; i <= samples; i++) {
		const t = (Math.PI * i) / samples;
		const v = fourierPartialSum(nTerms, t);
		if (v > maxVal) maxVal = v;
	}
	return maxVal;
}

export function FourierSeriesExperiment() {
	const [n, setN] = useState(INITIAL_N);
	const [t, setT] = useState(INITIAL_T);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state(LimitsSequencesExperiment と同じ理由:
	// 確定(blur/Enter)時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputN, setInputN] = useState(String(INITIAL_N));
	const [inputT, setInputT] = useState(String(INITIAL_T));
	useEffect(() => setInputN(String(n)), [n]);
	useEffect(() => setInputT(String(t)), [t]);

	const handleNChange = (value: number) => setN(Math.round(clamp(value, N_MIN, N_MAX, n)));
	const commitInputN = () => {
		const parsed = Number(inputN);
		const next =
			Number.isFinite(parsed) && inputN.trim() !== '' ? Math.round(clamp(parsed, N_MIN, N_MAX, n)) : n;
		setN(next);
		setInputN(String(next));
	};

	const handleTChange = (value: number) => setT(clamp(value, T_MIN, T_MAX, t));
	const commitInputT = () => {
		const parsed = Number(inputT);
		const next = Number.isFinite(parsed) && inputT.trim() !== '' ? clamp(parsed, T_MIN, T_MAX, t) : t;
		setT(next);
		setInputT(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作UI(Nのスライダー)
	// へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const nSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) nSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setN(INITIAL_N);
		setT(INITIAL_T);
	};

	// 数学モデルによる計算。lib/math の純粋関数をそのまま再利用する(重複実装しない、
	// タスク厳守事項)。
	const sNt = fourierPartialSum(n, t);
	const squareAtT = squareWave(t);
	const diffFromSquare = Math.abs(sNt - squareAtT);

	// N のみに依存する重い走査は N が変わったときだけ再計算する。
	const maxOfSN = useMemo(() => scanMaxPartialSum(n, MAX_SCAN_SAMPLES), [n]);

	// 実行時交差検証(C-7): b_1 の値を、閉形式(squareWaveCoefficient、代数的に導いた公式)と
	// 求積(computeCoefficientByQuadrature、積分の定義を数値積分する独立した経路)の両方で
	// 求め、突き合わせる。2つの独立した公開関数の一致であり、自己確認的な検証ではない。
	const b1Closed = useMemo(() => squareWaveCoefficient(1), []);
	const b1Quadrature = useMemo(() => computeCoefficientByQuadrature(1), []);
	const crossValidationHeld = approximatelyZero(b1Closed - b1Quadrature, Math.abs(b1Closed));

	const predictionCorrect = prediction === 'almost-but-corner';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="fourier-series-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="fourier-series-exp-title">実験: 回転する円をいくつも足し重ねて、角ばった波を作る</h2>

			{/* JS 無効時のフォールバック(Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、なめらかな
					サイン波(奇数次の高調波)を項数 N 個まで足し重ねた S_N(t) が、角ばった方形波に
					どこまで近づけるかを観察できます。JavaScript が無効でも要点は次の通りです: N を
					増やすほど波形は方形波に近づきますが、不連続点のすぐそばには先端が約1.18に達する「ツノ」(1からのはみ出し約0.18はジャンプ幅2の約9%)が残り続け、N をどれだけ増やしても消えません(ギブス
					現象)。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の実験では、滑らかなサイン波(奇数次の高調波 sin t, sin 3t, sin 5t, …)を項数 N 個まで
					足し重ねた S_N(t) の様子を、回転する円の鎖(エピサイクル)と波形の両方で観察できます。
					<strong>操作する前に予想してください:</strong> N をどこまでも増やしていくと、S_N(t) は
					角ばった方形波を完全に再現できると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="fourier-series-prediction"
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

			{/* Scene は予想ゲートの前から常時表示する(本文が「回転する円の鎖と波形の両方で観察
			    できます」と図を参照するため)。ただし y=1 の参照線(ギブス現象の答え)は
			    予想確定まで隠す。 */}
			<div className={styles.scene}>
				<FourierScene n={n} t={t} showJumpReference={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、項数 N と時刻 t を操作して結果を観察
					できます。
				</p>
			) : (
				<>
					{/* Controls: N・t のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="n-number">項数 N</label>
							<input
								id="n-slider"
								ref={nSliderRef}
								type="range"
								min={N_MIN}
								max={N_MAX}
								step={N_STEP}
								value={n}
								aria-label="項数 N(スライダー)"
								onChange={(e) => handleNChange(Number(e.target.value))}
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
								N は {N_MIN}〜{N_MAX} の整数で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="t-number">時刻 t(ラジアン)</label>
							<input
								id="t-slider"
								type="range"
								min={T_MIN}
								max={T_MAX}
								step={T_STEP}
								value={t}
								aria-label="時刻 t(スライダー)"
								onChange={(e) => handleTChange(Number(e.target.value))}
							/>
							<input
								id="t-number"
								type="text"
								inputMode="decimal"
								aria-describedby="t-range-hint"
								value={inputT}
								onChange={(e) => setInputT(e.target.value)}
								onBlur={commitInputT}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputT();
								}}
							/>
							<p id="t-range-hint" className={styles.rangeHint}>
								t は 0〜2π(0〜{round2(T_MAX)})の範囲で指定できます(現在 {formatAsPiMultiple(t)})。
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
									<th scope="row">項数 N</th>
									<td>{n}</td>
								</tr>
								<tr>
									<th scope="row">時刻 t</th>
									<td>
										{round2(t)}({formatAsPiMultiple(t)})
									</td>
								</tr>
								<tr>
									<th scope="row">S{n}(t) の実値</th>
									<td>{round2(sNt)}</td>
								</tr>
								<tr>
									<th scope="row">|S{n}(t) − 方形波(t)|</th>
									<td>{round2(diffFromSquare)}</td>
								</tr>
								<tr>
									<th scope="row">S{n} の最大値(数値走査)</th>
									<td>{round2(maxOfSN)}</td>
								</tr>
							</tbody>
						</table>

						<p className={crossValidationHeld ? styles.statusHeld : styles.statusBroken}>
							{crossValidationHeld
								? `係数 b₁ の求積(数値積分)と閉形式(4/π)は一致しています(求積=${b1Quadrature.toFixed(6)}、閉形式=${b1Closed.toFixed(6)})。`
								: '係数 b₁ の求積と閉形式が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						<p className={styles.statusNeutral}>
							N を大きくしていくと、S{n} の最大値は約1.18付近に留まり、1へは戻りません(ギブス現象。上の表の実測値で確かめられます——小さい N ではさらに大きく、たとえば N=1 では 4/π≈1.27 です)。
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ(理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。'
								: '実は、N をどれだけ増やしても、不連続点のそばには先端が約1.18に達する「ツノ」(1からのはみ出し約0.18はジャンプ幅2の約9%)が残り続け、消えません。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: N を大きくすると、不連続点から離れた点では S_N(t) は方形波の値に
							どんどん近づいていきます(各点での収束。不連続点そのものでは左右の値の平均へ
							収束します)。しかし不連続点のすぐそばでは事情が違います——N を増やすほど「ツノ」の
							幅は狭くなっていきますが、その先端は1へは戻らず、わずかに減りながら約1.179(ギブス定数)に近づきます。1からのはみ出し約0.179はジャンプ幅2の約8.95%にあたります。これを<strong>ギブス現象</strong>と
							呼びます。上の観察表の「S{n}の最大値」を、Nスライダーを1→10→25→50と動かしながら
							確かめてみましょう——数値はわずかに動きますが、1.15を大きく下回ることはありません。
						</p>
						<p className={styles.narration}>
							よくある誤解:「各点で方形波の値に収束するのだから、波形全体もいずれ方形波と
							完全に一致するはずだ」と考えたくなるかもしれません。しかしこれは誤りです——
							「各点で収束する」ことと「波形全体が一様に(隙間なく)近づく」ことは別の話です。
							ツノの幅はNを増やすと0に近づきますが、先端の高さは1へ戻らず約1.18付近に残るため、
							どれだけNを大きくしても「波形全体が方形波にぴったり重なる」状態にはなりません。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default FourierSeriesExperiment;
