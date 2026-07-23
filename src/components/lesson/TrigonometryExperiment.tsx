import { useEffect, useRef, useState } from 'react';
import { unitCirclePoint, sine, cosine, tangent, pythagoreanIdentityResidual } from '../../lib/math/trigonometry.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { getPresetSearchParams, readNumberPreset } from '../../lib/urlPreset.js';
import { UnitCircleScene } from '../scenes/mafs/UnitCircleScene.js';
import styles from './TrigonometryExperiment.module.css';

// 三角比・単位円のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// QuadraticFunctionExperiment / LinearFunctionExperiment / EigenvectorExperiment と同じ設計:
// 予想 (Prediction) → 操作 (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を
// 1つの島に収め、状態 (theta, prediction) をここに一元管理する。数学の計算は
// lib/math/trigonometry.ts の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。
//
// 角度の単位(設計判断): 内部の角度は θ (度、UI 表示用) を SSOT の state として持ち、
// lib/math を呼ぶ直前にラジアンへ変換する。lib/math/trigonometry.ts の内部標準はラジアン
// (MATH_CONVENTIONS §5) だが、変換 (DEG_TO_RAD/RAD_TO_DEG) は UI 層であるこのファイルに置く
// —— EigenvectorExperiment.tsx が同じ理由で DEG_TO_RAD/RAD_TO_DEG をここに持つのと同じ設計。

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// 359 度を上限にする (360 ではない): スライダーの End キーで value=360 にすると
// normalizeAngleDeg が 0 へ折り返し、見た目がスライダー最大操作の直後に最小へ戻る
// (EigenvectorExperiment.tsx の angle-slider と同じ配慮)。
const MIN_THETA_DEG = 0;
const MAX_THETA_DEG = 359;
const INITIAL_THETA_DEG = 0;
const THETA_STEP = 1;

// URL パラメータでの初期状態固定 (ADR-006 M9d、一斉提示モード、パイロット3単元の1つ)。
// ?theta=<度> で角度 θ の初期値だけを差し替えられる (教師が「全員同じ初期状態」で提示する
// 用途)。不正値・範囲外は lib/urlPreset.ts が黙って INITIAL_THETA_DEG へフォールバックする
// (console エラーなし)。予想 (prediction)・確定 (submitted) 状態はこのパラメータの対象外
// ——予想ゲートは迂回できない (下の useState の初期値計算にのみ影響する)。
const THETA_PRESET_PARAM = 'theta';

type Prediction = 'decreases' | 'increases' | 'constant';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'decreases', label: 'cos θ は 1 から 0 へ向かって減っていく' },
	{ value: 'increases', label: 'cos θ は 0 から 1 へ向かって増えていく' },
	{ value: 'constant', label: 'cos θ は変わらず 1 のままである' },
];

function normalizeThetaDeg(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_THETA_DEG;
	const wrapped = value % 360;
	return wrapped < 0 ? wrapped + 360 : wrapped;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function TrigonometryExperiment() {
	// 初期値は既定値 (INITIAL_THETA_DEG) だが、?theta=<度> があればそちらを優先する
	// (readNumberPreset が [MIN_THETA_DEG, MAX_THETA_DEG] へクランプ済みの値を返す)。
	const [thetaDeg, setThetaDeg] = useState(() =>
		normalizeThetaDeg(
			readNumberPreset(getPresetSearchParams(), THETA_PRESET_PARAM, {
				min: MIN_THETA_DEG,
				max: MAX_THETA_DEG,
				fallback: INITIAL_THETA_DEG,
			}),
		),
	);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (QuadraticFunctionExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp/正規化して数値 state へ反映し、入力途中の破壊を防ぐ)。
	// 初期表示は上で解決済みの thetaDeg (プリセット反映後) に合わせる。
	const [inputTheta, setInputTheta] = useState(() => String(round2(thetaDeg)));

	// 状態の正規化 (360 度で折り返す) はここに集約する。ドラッグ・スライダー・数値入力すべてが
	// このハンドラを通るため、入力経路によらず単一の真実の状態になる。
	const handleThetaChange = (value: number) => setThetaDeg(normalizeThetaDeg(value));

	const commitInputTheta = () => {
		const parsed = Number(inputTheta);
		// スライダーの step (THETA_STEP=1度刻み) と数値入力の精度を揃える (Eigenvector と同じ配慮)。
		const next =
			Number.isFinite(parsed) && inputTheta.trim() !== ''
				? normalizeThetaDeg(Math.round(parsed / THETA_STEP) * THETA_STEP)
				: thetaDeg;
		setThetaDeg(next);
		setInputTheta(String(round2(next)));
	};

	// theta が外部要因 (ドラッグ・スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputTheta(String(round2(thetaDeg)));
	}, [thetaDeg]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (θ のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const thetaSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) thetaSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setThetaDeg(INITIAL_THETA_DEG);
	};

	// 数学モデル (lib/math/trigonometry.ts) による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。角度はここで初めてラジアンへ変換する。
	const thetaRad = thetaDeg * DEG_TO_RAD;
	const point = unitCirclePoint(thetaRad);
	const sinValue = sine(thetaRad);
	const cosValue = cosine(thetaRad);
	const identityResidual = pythagoreanIdentityResidual(thetaRad);
	const identityHolds = approximatelyZero(identityResidual, 1);

	// tan θ は cos θ ≈ 0 (θ=90°, 270° 付近) で定義されない。例外を投げる tangent() を
	// 呼ぶ前に安全に判定し、UI ではクラッシュさせずに専用の文言で表示する(C-3 の
	// fail-with-message の精神、DoD「cos≈0でtanが定義されない旨を安全に表示」)。
	const tanUndefined = approximatelyZero(cosValue, 1);
	const tanValue = tanUndefined ? null : tangent(thetaRad);

	const predictionCorrect = prediction === 'decreases';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="trigonometry-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="trigonometry-exp-title">実験: 単位円上の角度 θ を動かす</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、単位円
					(原点を中心とする半径 1 の円)上の点を角度 θ で動かしながら、
					<strong>
						cos θ(点の x 座標)・sin θ(点の y 座標)・tan θ(= sin θ / cos θ)が θ に応じて
						どう変化するか
					</strong>
					を確かめられます。JavaScript が無効でも関係そのものは次の通りです:
					単位円上の角度 θ に対応する点の座標は (cos θ, sin θ) であり、常に
					sin²θ + cos²θ = 1 が成り立ちます(ピタゴラスの定理を単位円へ適用した関係)。
					tan θ は cos θ = 0 となる角度(θ = 90°, 270° など)では定義されません。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図では、単位円上の点を角度 θ で自由に動かせます。
					<strong>操作する前に予想してください:</strong> θ を 0° から 90° へ動かすと、
					cos θ はどのように変化するでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="trigonometry-prediction"
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
				<UnitCircleScene
					theta={thetaRad}
					point={point}
					interactive={submitted}
					onPointChange={([px, py]) => handleThetaChange(Math.atan2(py, px) * RAD_TO_DEG)}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、θ を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="theta-number">角度 θ(度)</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="theta-slider"
								ref={thetaSliderRef}
								type="range"
								min={MIN_THETA_DEG}
								max={MAX_THETA_DEG}
								step={THETA_STEP}
								value={thetaDeg}
								aria-label="角度 θ(スライダー)"
								onChange={(e) => handleThetaChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に正規化で担保する。 */}
							<input
								id="theta-number"
								type="text"
								inputMode="decimal"
								aria-describedby="theta-range-hint"
								value={inputTheta}
								onChange={(e) => setInputTheta(e.target.value)}
								onBlur={commitInputTheta}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputTheta();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="theta-range-hint" className={styles.rangeHint}>
							θ は {MIN_THETA_DEG}〜{MAX_THETA_DEG} 度の範囲で指定できます(360 度で1周)。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">角度 θ(度)</th>
									<td>{round2(thetaDeg)}</td>
								</tr>
								<tr>
									<th scope="row">角度 θ(ラジアン)</th>
									<td>{round2(thetaRad)}</td>
								</tr>
								<tr>
									<th scope="row">単位円上の点 (cos θ, sin θ)</th>
									<td>
										({round2(point[0])}, {round2(point[1])})
									</td>
								</tr>
								<tr>
									<th scope="row">sin θ</th>
									<td>{round2(sinValue)}</td>
								</tr>
								<tr>
									<th scope="row">cos θ</th>
									<td>{round2(cosValue)}</td>
								</tr>
								<tr>
									<th scope="row">tan θ</th>
									<td>{tanUndefined ? '定義されません (cos θ ≈ 0)' : round2(tanValue as number)}</td>
								</tr>
								<tr>
									<th scope="row">sin²θ + cos²θ</th>
									<td>{round2(identityResidual + 1)}</td>
								</tr>
							</tbody>
						</table>
						<p className={identityHolds ? styles.statusHeld : styles.statusBroken}>
							{identityHolds
								? 'sin²θ + cos²θ は常に 1 になります(ピタゴラス恒等式)。'
								: 'この状態では sin²θ + cos²θ が 1 と一致していません。'}
						</p>
						{tanUndefined && (
							<p className={styles.statusBroken}>
								現在 θ は 90° または 270° に近く、cos θ ≈ 0 のため tan θ は定義されません
								(この角度では単位円上の点を通る直線が y 軸と平行になります)。
							</p>
						)}
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
								? '実際、θ を 0° から 90° へ動かすと、単位円上の点の x 座標(cos θ)は 1 から 0 へ向かって減っていきます——一方で y 座標(sin θ)は 0 から 1 へ向かって増えていきます。'
								: '実際に θ を 0° から 90° へ動かしてみると、単位円上の点の x 座標(cos θ)は 1 から 0 へ向かって減っていきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: cos θ は単位円上の点の x 座標そのものです。θ=0° では点は
							(1, 0) にあり、x 座標は最大の 1 です。θ が増えて反時計回りに進むと、点は
							円周に沿って上へ移動していき、x 座標(横方向の位置)は次第に 0 へ近づいていきます。
							θ=90° でちょうど点が (0, 1) に達し、cos θ = 0 になります。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default TrigonometryExperiment;
