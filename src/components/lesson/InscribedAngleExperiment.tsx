import { useEffect, useRef, useState } from 'react';
import { pointOnCircle, angleAtVertex, type Point2 } from '../../lib/math/inscribedAngle.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { InscribedAngleScene } from '../scenes/mafs/InscribedAngleScene.js';
import styles from './InscribedAngleExperiment.module.css';

// 円周角の定理のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// SimilarityExperiment / TrigonometryExperiment と同じ設計: 予想 (Prediction) → 操作
// (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を1つの島に収め、状態
// (thetaPDeg, prediction) をここに一元管理する。数学の計算は lib/math/inscribedAngle.ts の
// 純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。
//
// 角度の単位(設計判断): 内部の角度は θ(度、UI 表示用)を SSOT の state として持ち、
// lib/math を呼ぶ直前にラジアンへ変換する(MATH_CONVENTIONS §5、TrigonometryExperiment.tsx と
// 同じ設計)。
//
// 設計判断(操作範囲を優弧に限定): 円周角の定理「円周角 = 中心角 ÷ 2」および「同じ弧に対する
// 円周角は等しい」が成り立つのは、点 P が弦 AB に対する優弧(中心と反対側の弧)上にあるときに
// 限られる。P が劣弧側へ越えると円周角は別の関係(π − 中心角/2)に切り替わり、
// この実験が検証したい不変条件そのものが崩れて見えてしまう。そのため、点 P の可動範囲
// (MIN_THETA_P_DEG〜MAX_THETA_P_DEG)を弦 AB の両端から余裕を取った優弧の内側だけに
// 固定する(InscribedAngleScene.tsx のコメントも参照)。

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const CENTER: Point2 = [0, 0];
const RADIUS = 3;

// 弦 AB の端点(固定)。中心角 ∠AOB = 210−90 = 120° になるよう選ぶ(手計算しやすい既知値)。
const ALPHA_A_DEG = 90;
const ALPHA_B_DEG = 210;

// 優弧は B(210°) から A(360+90=450°) まで(劣弧 90°→210° の外側)。両端から 5° の余白を取り、
// 数値的な余裕を持たせつつ、点 P が A・B に一致する(角度が定義できない)ことを避ける。
const MIN_THETA_P_DEG = 215;
const MAX_THETA_P_DEG = 445;
const INITIAL_THETA_P_DEG = 330; // 優弧のほぼ中央(単位円に内接する正三角形の第3頂点に相当)
const THETA_STEP = 1;

type Prediction = 'bigger' | 'smaller' | 'same';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'bigger', label: '大きくなる' },
	{ value: 'smaller', label: '小さくなる' },
	{ value: 'same', label: '変わらない' },
];

function clampThetaP(value: number): number {
	if (!Number.isFinite(value)) return MIN_THETA_P_DEG;
	return Math.min(MAX_THETA_P_DEG, Math.max(MIN_THETA_P_DEG, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function InscribedAngleExperiment() {
	const [thetaPDeg, setThetaPDeg] = useState(INITIAL_THETA_P_DEG);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (SimilarityExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputThetaP, setInputThetaP] = useState(String(INITIAL_THETA_P_DEG));

	// 状態の正規化 (clamp) はここに集約する。スライダー・数値入力すべてがこのハンドラを
	// 通るため、入力経路によらず単一の真実の状態になる。
	const handleThetaPChange = (value: number) => setThetaPDeg(clampThetaP(value));

	const commitInputThetaP = () => {
		const parsed = Number(inputThetaP);
		const next =
			Number.isFinite(parsed) && inputThetaP.trim() !== ''
				? clampThetaP(Math.round(parsed / THETA_STEP) * THETA_STEP)
				: thetaPDeg;
		setThetaPDeg(next);
		setInputThetaP(String(round2(next)));
	};

	// thetaPDeg が外部要因 (スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputThetaP(String(round2(thetaPDeg)));
	}, [thetaPDeg]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (θ のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const thetaPSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) thetaPSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setThetaPDeg(INITIAL_THETA_P_DEG);
	};

	// 数学モデル (lib/math/inscribedAngle.ts) による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。角度はここで初めてラジアンへ変換する。
	const A = pointOnCircle(CENTER, RADIUS, ALPHA_A_DEG * DEG_TO_RAD);
	const B = pointOnCircle(CENTER, RADIUS, ALPHA_B_DEG * DEG_TO_RAD);
	const thetaPRad = thetaPDeg * DEG_TO_RAD;
	const P = pointOnCircle(CENTER, RADIUS, thetaPRad);

	const inscribedRad = angleAtVertex(P, A, B);
	const centralRad = angleAtVertex(CENTER, A, B);
	const inscribedDeg = inscribedRad * RAD_TO_DEG;
	const centralDeg = centralRad * RAD_TO_DEG;
	const ratio = inscribedRad / centralRad;

	// 観察ステータスの「一致」を断言せず、実測比が理論値(1/2)と合うかを実行時に検証する
	// (GrokBuild C1: SimilarityExperiment / TrigonometryExperiment が恒等式を判定してから
	// 表示するのと同じ誠実さ)。P は優弧内に限定されているため理論上は常に成立するはずだが、
	// 数学モデルに誤りがあった場合に「一致」と偽って表示しないための安全策。
	const ratioHolds = approximatelyZero(ratio - 0.5, Math.max(1, 0.5));

	const predictionCorrect = prediction === 'same';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="inscribed-angle-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="inscribed-angle-exp-title">実験: 円周上の点 P を動かす</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、円 O
					の弦 AB に対して、円周上の点 P を(弦 AB に対する同じ側の弧である優弧上で)動かし
					ながら、<strong>円周角 ∠APB が変化するかどうか</strong>を確かめられます。
					JavaScript が無効でも関係そのものは次の通りです: 弦 AB に対する中心角 ∠AOB が
					120° のとき、優弧上のどこに点 P を取っても、円周角 ∠APB は常に中心角の半分の
					60° になります(円周角の定理)。同じ弧に対する円周角はどこから見ても等しく、
					特に弦 AB が円の直径であるとき、円周角は常に 90°(タレスの定理)になります。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図では、円 O の弦 AB に対して、円周上の点 P を(弦 AB に対する同じ側の弧である
					優弧上で)自由に動かせます。<strong>操作する前に予想してください:</strong> 点 P を
					円周上で(同じ弧のまま)動かすと、円周角 ∠APB はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="inscribed-angle-prediction"
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

			{/* Scene: Tier 1 図解。P はドラッグ不可、角度スライダーで操作する
			    (InscribedAngleScene.tsx の設計判断コメント参照)。 */}
			<div className={styles.scene}>
				<InscribedAngleScene center={CENTER} radius={RADIUS} a={A} b={B} p={P} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、点 P を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="theta-p-number">点 P の角度 θ(度)</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="theta-p-slider"
								ref={thetaPSliderRef}
								type="range"
								min={MIN_THETA_P_DEG}
								max={MAX_THETA_P_DEG}
								step={THETA_STEP}
								value={thetaPDeg}
								aria-label="点 P の角度 θ(スライダー)"
								onChange={(e) => handleThetaPChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。 */}
							<input
								id="theta-p-number"
								type="text"
								inputMode="decimal"
								aria-describedby="theta-p-range-hint"
								value={inputThetaP}
								onChange={(e) => setInputThetaP(e.target.value)}
								onBlur={commitInputThetaP}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputThetaP();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="theta-p-range-hint" className={styles.rangeHint}>
							点 P の角度 θ は {MIN_THETA_P_DEG}〜{MAX_THETA_P_DEG}
							度の範囲で指定できます(弦 AB に対する優弧上に限定)。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">点 P の角度 θ(度)</th>
									<td>{round2(thetaPDeg)}</td>
								</tr>
								<tr>
									<th scope="row">円周角 ∠APB(度)</th>
									<td>{round2(inscribedDeg)}</td>
								</tr>
								<tr>
									<th scope="row">中心角 ∠AOB(度)</th>
									<td>{round2(centralDeg)}</td>
								</tr>
								<tr>
									<th scope="row">円周角 ÷ 中心角</th>
									<td>{round2(ratio)}</td>
								</tr>
							</tbody>
						</table>
						<p className={ratioHolds ? styles.statusHeld : styles.statusBroken}>
							{ratioHolds
								? `円周角(${round2(inscribedDeg)}°)は中心角(${round2(centralDeg)}°)のちょうど半分です。点 P を優弧上のどこへ動かしても、円周角の大きさ自体は変わりません。`
								: '計算された円周角が中心角の半分と一致しません。数学モデルに問題がある可能性があります。'}
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
								? '実際、点 P を(弦 AB に対する同じ側の弧である優弧上で)どこに動かしても、円周角 ∠APB は変わりません——常に中心角 ∠AOB の半分のままです。'
								: '実際に点 P をいろいろ動かしてみると、円周角 ∠APB は変わらないことがわかります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜ変わらないのか: 円周角の定理により、同じ弧 AB に対する円周角は、
							弧上のどの点から見ても常に中心角 ∠AOB の半分になります。点 P の位置を
							変えても弦 AB(と、それが切り取る弧)自体は変わらないため、円周角
							∠APB もまた変わりません——「同じ弧に対する円周角は等しい」という関係です。
							(特別な場合として、弦 AB が円の直径のとき、中心角は 180° になるため、
							円周角は弧上のどこから見ても常に 90° になります——タレスの定理です。)
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default InscribedAngleExperiment;
