import { useEffect, useRef, useState } from 'react';
import { evaluate, slopeBetween, xRoot, type Point2 } from '../../lib/math/linearFunction.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { LinearFunctionScene } from '../scenes/mafs/LinearFunctionScene.js';
import styles from './LinearFunctionExperiment.module.css';

// 一次関数 y=ax+b のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// InteractiveExperiment (三平方の定理) / DerivativeExperiment (微分係数) と同じ設計:
// 予想 (Prediction) → 操作 (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を
// 1つの島に収め、状態 (a, b, prediction) をここに一元管理する。数学の計算は
// lib/math/linearFunction.ts の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。

const MIN_A = -3;
const MAX_A = 3;
const INITIAL_A = 2;
const STEP_A = 0.1;

const MIN_B = -5;
const MAX_B = 5;
const INITIAL_B = 1;
const STEP_B = 0.1;

// 「2点から傾きを求める」観察行に使う固定サンプル x (a・b スライダーとは独立)。
// どの2点を選んでも slopeBetween は同じ a を返すことを示す (傾き不変性の生きた確認)。
const SAMPLE_X1 = -2;
const SAMPLE_X2 = 3;

type Prediction = 'flips-direction' | 'shifts-position' | 'changes-intercept';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'flips-direction', label: '右上がりの直線から右下がりの直線に変わる' },
	{ value: 'shifts-position', label: '直線の傾き方は変わらず、位置だけが横にずれる' },
	{ value: 'changes-intercept', label: 'y 軸との交点(切片)が変わる' },
];

function clampA(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_A;
	return Math.min(MAX_A, Math.max(MIN_A, value));
}

function clampB(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_B;
	return Math.min(MAX_B, Math.max(MIN_B, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function LinearFunctionExperiment() {
	const [a, setA] = useState(INITIAL_A);
	const [b, setB] = useState(INITIAL_B);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (InteractiveExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(INITIAL_A));
	const [inputB, setInputB] = useState(String(INITIAL_B));

	// 状態の正規化 (clamp) はここに集約する。ドラッグ・スライダーはこのハンドラを通るため、
	// 入力経路によらず単一の真実の状態になる。
	const handleAChange = (value: number) => setA(clampA(value));
	const handleBChange = (value: number) => setB(clampB(value));

	const commitInputA = () => {
		const parsed = Number(inputA);
		const next = Number.isFinite(parsed) && inputA.trim() !== '' ? clampA(parsed) : a;
		setA(next);
		setInputA(String(round2(next)));
	};
	const commitInputB = () => {
		const parsed = Number(inputB);
		const next = Number.isFinite(parsed) && inputB.trim() !== '' ? clampB(parsed) : b;
		setB(next);
		setInputB(String(round2(next)));
	};

	// a/b が外部要因 (ドラッグ・スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputA(String(round2(a)));
	}, [a]);
	useEffect(() => {
		setInputB(String(round2(b)));
	}, [b]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const aSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) aSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setA(INITIAL_A);
		setB(INITIAL_B);
	};

	// 数学モデル (lib/math/linearFunction.ts) による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。
	const yAt0 = evaluate(a, b, 0);
	// 「2点から傾きを求める」観察: サンプル2点 (a・b スライダーとは無関係な固定 x) で
	// slopeBetween を呼び、evaluate とは独立した経路で a を再確認する (傾き不変性)。
	const p1: Point2 = [SAMPLE_X1, evaluate(a, b, SAMPLE_X1)];
	const p2: Point2 = [SAMPLE_X2, evaluate(a, b, SAMPLE_X2)];
	const observedSlope = slopeBetween(p1, p2);
	const slopeMatches = approximatelyZero(observedSlope - a, Math.max(1, Math.abs(a)));

	// xRoot は a≈0 (水平線) で RangeError を投げる (lib/math/linearFunction.ts の a=0 方針)。
	// スライダーは a=0 を選べてしまうため、呼び出し前に確認して退化ケースを文言で表示する。
	const isHorizontal = approximatelyZero(a, 1);
	let xInterceptText: string;
	if (isHorizontal) {
		xInterceptText = approximatelyZero(b, 1)
			? 'すべての x (x 軸そのもの)'
			: '存在しない (x 軸と交わらない)';
	} else {
		xInterceptText = String(round2(xRoot(a, b)));
	}

	const predictionCorrect = prediction === 'flips-direction';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="linear-function-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="linear-function-exp-title">実験: 傾き a と切片 b を動かす</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、一次関数
					y = ax + b の傾き a と切片 b を動かしながら、
					<strong>
						a が直線の傾き方(右上がり・右下がり・水平)を、b が直線と y 軸の交点を
						それぞれ独立に決めること
					</strong>
					を確かめられます。JavaScript が無効でも関係そのものは次の通りです:
					一次関数 y = ax + b のグラフは、傾き a、y 切片 (0, b) を通る直線です。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の直線は y = ax + b の形で表され、傾き a と切片 b を自由に変えられます。
					<strong>操作する前に予想してください:</strong> 切片 b は変えずに、傾き a を正の値から
					負の値に変えると、直線はどう変わるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="linear-function-prediction"
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
				<LinearFunctionScene
					a={a}
					b={b}
					minA={MIN_A}
					maxA={MAX_A}
					minB={MIN_B}
					maxB={MAX_B}
					interactive={submitted}
					onAChange={handleAChange}
					onBChange={handleBChange}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、a・b を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="a-number">傾き a</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="a-slider"
								ref={aSliderRef}
								type="range"
								min={MIN_A}
								max={MAX_A}
								step={STEP_A}
								value={a}
								aria-label="傾き a(スライダー)"
								onChange={(e) => handleAChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。 */}
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
							<label htmlFor="b-number">切片 b</label>
							<input
								id="b-slider"
								type="range"
								min={MIN_B}
								max={MAX_B}
								step={STEP_B}
								value={b}
								aria-label="切片 b(スライダー)"
								onChange={(e) => handleBChange(Number(e.target.value))}
							/>
							<input
								id="b-number"
								type="text"
								inputMode="decimal"
								aria-describedby="b-range-hint"
								value={inputB}
								onChange={(e) => setInputB(e.target.value)}
								onBlur={commitInputB}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputB();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="a-range-hint" className={styles.rangeHint}>
							a は {MIN_A}〜{MAX_A} の範囲で指定できます。
						</p>
						<p id="b-range-hint" className={styles.rangeHint}>
							b は {MIN_B}〜{MAX_B} の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 現在値と、独立した計算経路 (slopeBetween) による傾き確認の
					    ライブ表示。丸め前の内部値で判定し、表示のみ丸める (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">傾き a</th>
									<td>{round2(a)}</td>
								</tr>
								<tr>
									<th scope="row">切片 b</th>
									<td>{round2(b)}</td>
								</tr>
								<tr>
									<th scope="row">y 切片の座標</th>
									<td>(0, {round2(yAt0)})</td>
								</tr>
								<tr>
									<th scope="row">
										2点 (x={SAMPLE_X1}, x={SAMPLE_X2}) から求めた傾き
									</th>
									<td>{round2(observedSlope)}</td>
								</tr>
								<tr>
									<th scope="row">x 切片(x軸との交点)</th>
									<td>{xInterceptText}</td>
								</tr>
							</tbody>
						</table>
						<p className={slopeMatches ? styles.statusHeld : styles.statusBroken}>
							{slopeMatches
								? 'どの2点を選んでも、そこから計算した傾きは a と一致します。'
								: 'この状態では2点から計算した傾きが a と一致していません。'}
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
								? '実際、傾き a の符号を正から負に変えると、直線は右上がりから右下がりに変わります——切片 b(y 軸との交点)は a を変えても動きません。'
								: '実際に a の符号を変えてみると、直線は右上がりから右下がりに変わります。切片 b(y 軸との交点)は a を変えても動きません。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: y = ax + b で x = 0 を代入すると常に y = b になるため、
							y 切片は a の値に関係なく (0, b) のまま変わりません。一方 a は「x が 1
							増えたときに y がどれだけ変わるか」を表す量なので、a の符号が変わると
							x が増えたときの y の増減の向きそのものが反転します。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default LinearFunctionExperiment;
