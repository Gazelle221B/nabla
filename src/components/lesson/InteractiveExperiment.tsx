import { useEffect, useRef, useState } from 'react';
import { squaredDistance, pythagoreanResidual, type Point2 } from '../../lib/math/pythagoras.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { PythagorasScene } from '../scenes/mafs/PythagorasScene.js';
import styles from './InteractiveExperiment.module.css';

// 三平方の定理のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// 予想 (Prediction) → 操作 (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を
// 1 つの島に収め、状態 (legA, legB, prediction) をここに一元管理する。
// 数学の計算は lib/math の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。

const MIN_LEG = 1;
const MAX_LEG = 5;
const INITIAL_A = 3;
const INITIAL_B = 4;
const STEP = 0.1;

type Prediction = 'held' | 'broken' | 'depends';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'held', label: '常に成り立つ (関係は保たれる)' },
	{ value: 'broken', label: '成り立たなくなる (関係は崩れる)' },
	{ value: 'depends', label: '三角形の形によって変わる' },
];

function clampLeg(value: number): number {
	if (!Number.isFinite(value)) return MIN_LEG;
	return Math.min(MAX_LEG, Math.max(MIN_LEG, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function InteractiveExperiment() {
	const [legA, setLegA] = useState(INITIAL_A);
	const [legB, setLegB] = useState(INITIAL_B);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列 (例: "1." や "" )を保持する表示用 state。数値 (SSOT) とは分離し、
	// 確定時 (blur / Enter) にのみ clamp して数値 state へ反映する。これにより入力途中の破壊
	// (空文字が即 1 に戻る等) を防ぐ。ドラッグ・スライダー・リセットで legA/legB が外部から
	// 変わったときは下の useEffect で表示文字列を同期する。
	const [inputA, setInputA] = useState(String(INITIAL_A));
	const [inputB, setInputB] = useState(String(INITIAL_B));

	// 状態の正規化 (clamp) はここに集約する。ドラッグ・スライダーはこのハンドラを通るため、
	// 入力経路によらず単一の真実の状態になる。
	const handleLegA = (value: number) => setLegA(clampLeg(value));
	const handleLegB = (value: number) => setLegB(clampLeg(value));

	// 数値入力の確定: 有限値なら clamp して反映、非有限 (空・"." 等) なら現在値へ戻す。
	const commitInputA = () => {
		const parsed = Number(inputA);
		const next = Number.isFinite(parsed) && inputA.trim() !== '' ? clampLeg(parsed) : legA;
		setLegA(next);
		setInputA(String(round2(next)));
	};
	const commitInputB = () => {
		const parsed = Number(inputB);
		const next = Number.isFinite(parsed) && inputB.trim() !== '' ? clampLeg(parsed) : legB;
		setLegB(next);
		setInputB(String(round2(next)));
	};

	// legA/legB が外部要因 (ドラッグ・スライダー・リセット) で変わったら表示文字列を同期する。
	// 編集途中 (onChange で inputA だけ変えている間) は legA が変わらないため発火せず、入力は壊れない。
	useEffect(() => {
		setInputA(String(round2(legA)));
	}, [legA]);
	useEffect(() => {
		setInputB(String(round2(legB)));
	}, [legB]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI (a のスライダー)
	// へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const legASliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) legASliderRef.current?.focus();
	}, [submitted]);

	const reset = () => {
		setLegA(INITIAL_A);
		setLegB(INITIAL_B);
	};

	// 数学モデル (lib/math) による計算。丸めない内部値で残差を判定する (MATH_CONVENTIONS §1)。
	const origin: Point2 = [0, 0];
	const pointA: Point2 = [legA, 0];
	const pointB: Point2 = [0, legB];
	const legA2 = squaredDistance(origin, pointA);
	const legB2 = squaredDistance(origin, pointB);
	const hypotenuse2 = squaredDistance(pointA, pointB);
	const residual = pythagoreanResidual(origin, pointA, pointB);
	const holds = approximatelyZero(residual, legA2 + legB2 + hypotenuse2);
	const hypotenuse = Math.sqrt(hypotenuse2);

	const predictionCorrect = prediction === 'held';

	return (
		<section className={styles.experiment} aria-labelledby="pythagoras-exp-title">
			<h2 id="pythagoras-exp-title">実験: 直角三角形の辺を動かす</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript
					を有効にすると、直角三角形の脚 a・b をドラッグまたは数値入力で変え、
					<strong>
						どんな直角三角形でも a² + b² = c²（斜辺 c）が成り立つこと
					</strong>
					を確かめられます。JavaScript が無効でも定理そのものは次の通りです:
					直角三角形において、直角をはさむ 2 辺の長さを a, b、斜辺の長さを c とすると、
					a² + b² = c² が成り立ちます。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の直角三角形は、直角をはさむ 2 辺 a, b を自由に変えられます。
					<strong>操作する前に予想してください:</strong>
					辺の長さをいろいろ変えたとき、a² + b² と斜辺の 2 乗 c² の関係はどうなるでしょう?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="pythagoras-prediction"
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
				<PythagorasScene
					legA={legA}
					legB={legB}
					minLeg={MIN_LEG}
					maxLeg={MAX_LEG}
					interactive={submitted}
					onLegAChange={handleLegA}
					onLegBChange={handleLegB}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、辺を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="leg-a-number">辺 a の長さ</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="leg-a-slider"
								ref={legASliderRef}
								type="range"
								min={MIN_LEG}
								max={MAX_LEG}
								step={STEP}
								value={legA}
								aria-label="辺 a の長さ(スライダー)"
								onChange={(e) => handleLegA(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。
							    矢印キーによる増減はスライダー・可動点が担う。 */}
							<input
								id="leg-a-number"
								type="text"
								inputMode="decimal"
								aria-describedby="leg-range-hint"
								value={inputA}
								onChange={(e) => setInputA(e.target.value)}
								onBlur={commitInputA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputA();
								}}
							/>
						</div>
						<div className={styles.control}>
							<label htmlFor="leg-b-number">辺 b の長さ</label>
							<input
								id="leg-b-slider"
								type="range"
								min={MIN_LEG}
								max={MAX_LEG}
								step={STEP}
								value={legB}
								aria-label="辺 b の長さ(スライダー)"
								onChange={(e) => handleLegB(Number(e.target.value))}
							/>
							<input
								id="leg-b-number"
								type="text"
								inputMode="decimal"
								aria-describedby="leg-range-hint"
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
						<p id="leg-range-hint" className={styles.rangeHint}>
							各辺は 1〜5 の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 残差のライブ表示。丸め前の内部値で判定し、表示のみ丸める */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">a²</th>
									<td>{round2(legA2)}</td>
								</tr>
								<tr>
									<th scope="row">b²</th>
									<td>{round2(legB2)}</td>
								</tr>
								<tr>
									<th scope="row">a² + b²</th>
									<td>{round2(legA2 + legB2)}</td>
								</tr>
								<tr>
									<th scope="row">c² (斜辺の 2 乗)</th>
									<td>{round2(hypotenuse2)}</td>
								</tr>
								<tr>
									<th scope="row">c (斜辺)</th>
									<td>{round2(hypotenuse)}</td>
								</tr>
								<tr>
									<th scope="row">残差 (a² + b² − c²)</th>
									<td>{holds ? '≈ 0' : round2(residual)}</td>
								</tr>
							</tbody>
						</table>
						<p className={holds ? styles.statusHeld : styles.statusBroken}>
							{holds
								? 'a² + b² = c² が成り立っています。'
								: 'この状態では a² + b² = c² が成り立っていません。'}
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
								? '実際、辺 a・b をどう変えても残差は 0 のまま——直角が保たれる限り a² + b² = c² は常に成り立ちます。'
								: '実際に辺を動かしてみると、直角が保たれている限り残差は 0 のまま——a² + b² = c² は常に成り立ちます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜ常に成り立つのか: この三角形は原点で常に直角
							(a 辺は水平、b 辺は垂直) に保たれています。直角三角形であることこそが
							a² + b² = c² を成り立たせている、という点が三平方の定理の核心です。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default InteractiveExperiment;
