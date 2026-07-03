import { useEffect, useMemo, useRef, useState } from 'react';
import {
	applyMatrix,
	crossProduct2,
	dotProduct2,
	unitVectorFromAngle,
	isParallel,
	computeEigenSystem,
	classifyEigenSystem,
	type Matrix2x2,
	type Vector2,
} from '../../lib/math/eigen.js';
import { EigenvectorScene } from '../scenes/mafs/EigenvectorScene.js';
import styles from './InteractiveExperiment.module.css';

// M3: 2x2行列と固有ベクトルのガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。T3-1 の InteractiveExperiment (三平方の定理) と
// 同じ Prompt → Scene + Controls → Observation → Checkpoint の構成・状態管理方針を踏襲する。
// 数学の計算は lib/math/eigen.ts の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。
//
// 中核体験: 単位ベクトル v を回転させ、v と Av (行列 A による像) の向きが揃う瞬間
// (固有ベクトルの方向)を発見する。行列は 2 プリセットから選べる:
// 「伸縮」(相異なる実固有値を持つ対称行列、揃う瞬間が2回ある)と
// 「回転」(実固有ベクトルを持たない90度回転行列、揃う瞬間が一度もない — 誤解例)。

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const ANGLE_STEP = 1;

type PresetKey = 'stretch' | 'rotation';

const MATRIX_PRESETS: Record<PresetKey, { label: string; matrix: Matrix2x2 }> = {
	stretch: { label: '伸縮行列 A = [[2,1],[1,2]]', matrix: [[2, 1], [1, 2]] },
	rotation: { label: '回転行列 A = [[0,−1],[1,0]] (90°回転)', matrix: [[0, -1], [1, 0]] },
};

type Prediction = 'always' | 'never' | 'sometimes';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'always', label: 'v をどの向きにしても、Av は必ず v と同じ(または正反対)の向きになる' },
	{ value: 'never', label: 'v をどの向きにしても、Av が v と同じ向きになることはない' },
	{ value: 'sometimes', label: '特定の向きの v でだけ、Av が v と同じ(または正反対)の向きになる' },
];

function normalizeAngleDeg(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const wrapped = value % 360;
	return wrapped < 0 ? wrapped + 360 : wrapped;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatVector(v: Vector2): string {
	return `(${round2(v[0])}, ${round2(v[1])})`;
}

export function EigenvectorExperiment() {
	const [presetKey, setPresetKey] = useState<PresetKey>('stretch');
	const [angleDeg, setAngleDeg] = useState(20);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (T3-1 InteractiveExperiment と同じ方針:
	// 数値 (SSOT) とは分離し、確定時 (blur/Enter) にのみ反映する)。
	const [inputAngle, setInputAngle] = useState(String(20));

	const handleAngle = (value: number) => setAngleDeg(normalizeAngleDeg(value));

	const commitInputAngle = () => {
		const parsed = Number(inputAngle);
		// スライダーの step (ANGLE_STEP=1度刻み) と数値入力の精度を揃える。丸めないと
		// 「44.7」等の小数入力後にスライダーへ触れた瞬間に整数へスナップし、表示値が
		// 予告なく変わってしまう(2つの入力経路が異なる精度を持つ不整合)。
		const next =
			Number.isFinite(parsed) && inputAngle.trim() !== ''
				? normalizeAngleDeg(Math.round(parsed / ANGLE_STEP) * ANGLE_STEP)
				: angleDeg;
		setAngleDeg(next);
		setInputAngle(String(round2(next)));
	};

	useEffect(() => {
		setInputAngle(String(round2(angleDeg)));
	}, [angleDeg]);

	// 予想確定でボタンが消えてもキーボード操作を継続できるよう、新出現する角度スライダーへ
	// フォーカスを移す(T3-1 と同じ配慮)。
	const angleSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) angleSliderRef.current?.focus();
	}, [submitted]);

	const reset = () => {
		setAngleDeg(20);
	};

	const matrix = MATRIX_PRESETS[presetKey].matrix;

	// 数学モデル (lib/math/eigen.ts) による計算。丸めない内部値で判定する (MATH_CONVENTIONS §1)。
	const v = unitVectorFromAngle(angleDeg * DEG_TO_RAD);
	const av = applyMatrix(matrix, v);
	const cross = crossProduct2(v, av);
	const dot = dotProduct2(v, av);
	const aligned = isParallel(v, av);

	// 行列プリセットが変わったときだけ再計算すればよい(角度には依存しない)。
	const eigenSystem = useMemo(() => computeEigenSystem(matrix), [matrix]);
	const classification = useMemo(() => classifyEigenSystem(eigenSystem), [eigenSystem]);

	const predictionCorrect = prediction === 'sometimes';

	return (
		<section className={styles.experiment} aria-labelledby="eigen-exp-title">
			<h2 id="eigen-exp-title">実験: 単位ベクトルを回して固有ベクトルを見つける</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、単位ベクトル
					v を回転させながら、行列 A による像 Av を観察できます。JavaScript が無効でも
					要点は次の通りです: 行列 A = [[2,1],[1,2]] は、ほとんどの向きの v の向きを変えますが、
					2 つの特別な向き(固有ベクトルの向き)だけは向きが変わらず、大きさだけが変わります
					(それぞれ 3 倍・1 倍)。一方、90° 回転行列は、どの向きの v も必ず 90° 向きを変えて
					しまうため、実数の固有ベクトルを持ちません。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					行列 A = [[2,1],[1,2]] は、平面上のベクトル v を Av という新しいベクトルに写します。
					<strong>操作する前に予想してください:</strong> v の向きをいろいろ変えたとき、Av は v
					と同じ(または正反対の)向きになるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="eigen-prediction"
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
				<EigenvectorScene matrix={matrix} v={v} av={av} aligned={aligned} interactive={submitted} onVChange={([x, y]) => handleAngle(Math.atan2(y, x) * RAD_TO_DEG)} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、v を回転させて結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 角度スライダー + 数値入力 + 矢印キー + 行列プリセット + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label id="angle-label" htmlFor="angle-number">
								v の向き(度)
							</label>
							<input
								id="angle-slider"
								ref={angleSliderRef}
								type="range"
								min={0}
								max={359}
								step={ANGLE_STEP}
								value={angleDeg}
								aria-labelledby="angle-label"
								onChange={(e) => handleAngle(Number(e.target.value))}
							/>
							<input
								id="angle-number"
								type="text"
								inputMode="decimal"
								aria-describedby="angle-range-hint"
								value={inputAngle}
								onChange={(e) => setInputAngle(e.target.value)}
								onBlur={commitInputAngle}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputAngle();
								}}
							/>
						</div>
						<fieldset className={styles.predictionFieldset}>
							<legend>行列を選ぶ</legend>
							{(Object.keys(MATRIX_PRESETS) as PresetKey[]).map((key) => (
								<label key={key} className={styles.predictionOption}>
									<input
										type="radio"
										name="eigen-preset"
										value={key}
										checked={presetKey === key}
										onChange={() => setPresetKey(key)}
									/>
									{MATRIX_PRESETS[key].label}
								</label>
							))}
						</fieldset>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="angle-range-hint" className={styles.rangeHint}>
							向きは 0〜359 度の範囲で指定できます。
						</p>
					</div>

					{/* Observation: v・Av・平行度(残差)のライブ表示。丸め前の内部値で判定し、表示のみ丸める */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">v</th>
									<td>{formatVector(v)}</td>
								</tr>
								<tr>
									<th scope="row">Av</th>
									<td>{formatVector(av)}</td>
								</tr>
								<tr>
									<th scope="row">残差 (v × Av、外積)</th>
									<td>{aligned ? '≈ 0' : round2(cross)}</td>
								</tr>
								<tr>
									<th scope="row">この向きでの伸び率(見かけ、v・Av)</th>
									<td>{round2(dot)}</td>
								</tr>
							</tbody>
						</table>
						<p className={aligned ? styles.statusHeld : styles.statusBroken}>
							{aligned
								? '揃いました! この向きは固有ベクトルの向きです — Av は v の定数倍になっています。'
								: 'この向きでは v と Av の向きはまだ揃っていません。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ + 理論値の開示(理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想:{' '}
							<strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						{presetKey === 'stretch' ? (
							<>
								<p>
									{predictionCorrect
										? '実際、この行列では特定の2つの向きだけで v と Av が揃います。それ以外の向きでは揃いません。'
										: '実際に v を回転させてみると、揃う瞬間は限られた特定の向きだけです。予想と見比べてみましょう。'}
								</p>
								<p className={styles.narration}>
									この行列の固有値は
									{eigenSystem.realEigenvalues
										.map((lambda) => round2(lambda))
										.join(' と ')}
									です。固有ベクトルの向きでは、Av は v をちょうどその固有値倍しただけの
									ベクトルになります — 向きは変わらず、大きさだけが変わるという固有ベクトルの本質を
									表しています。
								</p>
							</>
						) : (
							<>
								<p>
									回転行列に切り替えると様子が変わります: v をどの向きにしても、Av は常に v から
									90° 回転した向きになり、<strong>一度も揃うことがありません</strong>。
								</p>
								<p className={styles.narration}>
									誤解に注意: 「実数の固有ベクトルを持たない({classification === 'complex-conjugate' ? '複素共役固有値' : '例外的な状態'})」
									ことと「特異である(行列式が0で逆行列を持たない)」ことは別の性質です。
									この回転行列の行列式は {round2(eigenSystem.determinant)} で、正則(逆行列を持つ)
									です。回転行列は「向きを変える」という性質のために実固有ベクトルを持たないだけで、
									特異行列ではありません。
								</p>
							</>
						)}
					</div>
				</>
			)}
		</section>
	);
}

export default EigenvectorExperiment;
