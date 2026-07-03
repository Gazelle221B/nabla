import { useEffect, useRef, useState } from 'react';
import {
	differenceQuotient,
	derivativeAt,
	type DifferentiableFunction,
} from '../../lib/math/derivative.js';
import { DerivativeScene } from '../scenes/mafs/DerivativeScene.js';
import styles from './DerivativeExperiment.module.css';

// 微分係数と接線のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// InteractiveExperiment (三平方の定理, T3-1) と同じ設計: 予想 (Prediction) → 操作 (Scene +
// Controls) → 観察 (Observation) → 確認 (Checkpoint) を1つの島に収め、状態 (a, h, prediction)
// をここに一元管理する。数学の計算は lib/math/derivative.ts の純粋関数へ委譲する。
//
// この記事の対象関数は f(x) = x^2 に固定する (rule of three, DESIGN.md: 1記事1具体例)。
// evaluate/derivative の閉じた式はここで唯一定義し、Scene 層には渡さない
// (Scene は描画のためだけに独立して同じ式を持つ。PythagorasScene と同じ分離方針)。
const CURVE: DifferentiableFunction = {
	evaluate: (x) => x * x,
	derivative: (x) => 2 * x,
};

const A_MIN = -2;
const A_MAX = 2;
const INITIAL_A = 1;
const STEP_A = 0.1;

const H_MIN = 0.05;
const H_MAX = 2;
const INITIAL_H = 1;
const STEP_H = 0.01;

type Prediction = 'converges-to-derivative' | 'converges-to-zero' | 'no-fixed-limit';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'converges-to-derivative', label: '微分係数(接線の傾き)に近づく' },
	{ value: 'converges-to-zero', label: '0 に近づく' },
	{ value: 'no-fixed-limit', label: 'a の値によって変わり、決まった値には近づかない' },
];

function clampA(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_A;
	return Math.min(A_MAX, Math.max(A_MIN, value));
}

function clampH(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_H;
	return Math.min(H_MAX, Math.max(H_MIN, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function DerivativeExperiment() {
	const [a, setA] = useState(INITIAL_A);
	const [h, setH] = useState(INITIAL_H);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (InteractiveExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(INITIAL_A));
	const [inputH, setInputH] = useState(String(INITIAL_H));

	const handleAChange = (value: number) => setA(clampA(value));
	const handleHChange = (value: number) => setH(clampH(value));

	const commitInputA = () => {
		const parsed = Number(inputA);
		const next = Number.isFinite(parsed) && inputA.trim() !== '' ? clampA(parsed) : a;
		setA(next);
		setInputA(String(round2(next)));
	};
	const commitInputH = () => {
		const parsed = Number(inputH);
		const next = Number.isFinite(parsed) && inputH.trim() !== '' ? clampH(parsed) : h;
		setH(next);
		setInputH(String(round2(next)));
	};

	// a/h が外部要因 (ドラッグ・スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputA(String(round2(a)));
	}, [a]);
	useEffect(() => {
		setInputH(String(round2(h)));
	}, [h]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const aSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) aSliderRef.current?.focus();
	}, [submitted]);

	const reset = () => {
		setA(INITIAL_A);
		setH(INITIAL_H);
	};

	// 数学モデル (lib/math/derivative.ts) による計算。丸めない内部値で誤差を判定する
	// (MATH_CONVENTIONS §1)。
	const fa = CURVE.evaluate(a);
	const fah = CURVE.evaluate(a + h);
	const secantSlope = differenceQuotient(CURVE, a, h);
	const tangentSlope = derivativeAt(CURVE, a);
	const gap = secantSlope - tangentSlope;
	// h が十分小さいかどうかの表示上の目安 (MATH_CONVENTIONS の数学的な ε 判定ではなく、
	// 「体感として割線が接線に近づいたと言えるか」を示す UI 上の閾値)。
	const isCloseToTangent = Math.abs(h) < 0.15;

	const predictionCorrect = prediction === 'converges-to-derivative';

	return (
		<section className={styles.experiment} aria-labelledby="derivative-exp-title">
			<h2 id="derivative-exp-title">実験: 割線を接線に近づける</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、放物線
					f(x) = x² 上の点 a と、もう一つの点 a + h を動かしながら、
					<strong>
						2 点を結ぶ割線の傾き(平均変化率)が、h を 0 に近づけるにつれて a
						における接線の傾き(微分係数)に近づいていく
					</strong>
					様子を確かめられます。JavaScript が無効でも定義そのものは次の通りです:
					関数 f(x) の x = a における微分係数 f&apos;(a) は、
					f&apos;(a) = lim(h→0) (f(a+h) − f(a)) / h という極限で定義されます。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は放物線 f(x) = x² 上の点 a と、そこから少し離れた点 a + h を結ぶ
					<strong>割線</strong>(2 点を通る直線)です。
					<strong>操作する前に予想してください:</strong> h をどんどん 0 に近づけていくと、
					割線の傾き(平均変化率)はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="derivative-prediction"
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

			{/* Scene: Tier 1 図解。予想確定前はドラッグ不可 (interactive=false) */}
			<div className={styles.scene}>
				<DerivativeScene
					a={a}
					h={h}
					minA={A_MIN}
					maxA={A_MAX}
					maxH={H_MAX}
					tangentSlope={tangentSlope}
					interactive={submitted}
					onAChange={handleAChange}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、点 a・h を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label id="a-label" htmlFor="a-number">
								接点 a の位置
							</label>
							<input
								id="a-slider"
								ref={aSliderRef}
								type="range"
								min={A_MIN}
								max={A_MAX}
								step={STEP_A}
								value={a}
								aria-labelledby="a-label"
								onChange={(e) => handleAChange(Number(e.target.value))}
							/>
							<input
								id="a-number"
								type="text"
								inputMode="decimal"
								aria-describedby="a-range-hint"
								value={inputA}
								onChange={(e) => setInputA(e.target.value)}
								onBlur={commitInputA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputA();
								}}
							/>
						</div>
						<div className={styles.control}>
							<label id="h-label" htmlFor="h-number">
								h(a からの距離)
							</label>
							<input
								id="h-slider"
								type="range"
								min={H_MIN}
								max={H_MAX}
								step={STEP_H}
								value={h}
								aria-labelledby="h-label"
								onChange={(e) => handleHChange(Number(e.target.value))}
							/>
							<input
								id="h-number"
								type="text"
								inputMode="decimal"
								aria-describedby="h-range-hint"
								value={inputH}
								onChange={(e) => setInputH(e.target.value)}
								onBlur={commitInputH}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputH();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="a-range-hint" className={styles.rangeHint}>
							a は {A_MIN}〜{A_MAX} の範囲で指定できます。
						</p>
						<p id="h-range-hint" className={styles.rangeHint}>
							h は {H_MIN}〜{H_MAX} の範囲で指定できます(0 には近づけられますが、
							ちょうど 0 にはできません)。
						</p>
					</div>

					{/* Observation: 割線の傾き・微分係数・誤差のライブ表示。丸め前の内部値で
					    判定し、表示のみ丸める (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">a</th>
									<td>{round2(a)}</td>
								</tr>
								<tr>
									<th scope="row">f(a)</th>
									<td>{round2(fa)}</td>
								</tr>
								<tr>
									<th scope="row">h</th>
									<td>{round2(h)}</td>
								</tr>
								<tr>
									<th scope="row">a + h</th>
									<td>{round2(a + h)}</td>
								</tr>
								<tr>
									<th scope="row">f(a + h)</th>
									<td>{round2(fah)}</td>
								</tr>
								<tr>
									<th scope="row">割線の傾き (平均変化率)</th>
									<td>{round2(secantSlope)}</td>
								</tr>
								<tr>
									<th scope="row">微分係数 f&apos;(a)(接線の傾き)</th>
									<td>{round2(tangentSlope)}</td>
								</tr>
								<tr>
									<th scope="row">差(割線の傾き − 微分係数)</th>
									<td>{round2(gap)}</td>
								</tr>
							</tbody>
						</table>
						<p className={isCloseToTangent ? styles.statusHeld : styles.statusBroken}>
							{isCloseToTangent
								? 'h が十分小さいので、割線の傾きはほぼ微分係数と同じになっています。'
								: 'まだ h が大きいため、割線の傾きと微分係数には差があります。h を小さくしてみましょう。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想:{' '}
							<strong>
								{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}
							</strong>
						</p>
						<p>
							{predictionCorrect
								? '実際、h を 0 に近づけていくと、割線の傾きは a における微分係数(接線の傾き)にどんどん近づきます。'
								: '実際に h を小さくしてみると、割線の傾きは a における微分係数(接線の傾き)にどんどん近づきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 割線の傾きは「a から a+h までの平均の変化率」、微分係数は
							「a における瞬間の変化率」です。h を 0 に近づけるほど、2 点 a と a+h は
							近づき、平均の変化率は瞬間の変化率に近づいていきます。ただし
							<strong>h = 0 を直接代入すると 0/0 になり定義できません</strong>
							——だからこそ「極限」という考え方が必要になります。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DerivativeExperiment;
