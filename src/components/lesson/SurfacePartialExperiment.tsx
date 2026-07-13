import { useEffect, useRef, useState } from 'react';
import {
	evaluateSurface,
	partialX,
	partialY,
	numericalPartialX,
	numericalPartialY,
	directionalDerivative,
	gradientMagnitude,
	gradientDirectionDeg,
	SURFACE_PRESETS,
	type SurfaceFnId,
} from '../../lib/math/surfacePartial.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { SurfacePartialScene } from '../scenes/three/SurfacePartialScene.js';
import styles from './SurfacePartialExperiment.module.css';

// 「2変数関数の曲面と偏微分 — 山の斜面は向きで違う」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。LinearTransform3dExperiment(MVP3 第1波)と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態
// (関数プリセット・注目点 x0,y0・方向 θ・prediction)をここに一元管理する(SSOT)。
// 数学の計算は lib/math/surfacePartial.ts の純粋関数へ委譲し、この層は入力同期・
// 実行時検証(解析解と中心差分の一致)・提示に徹する。
//
// 中核体験: 1変数の微分係数(接線の傾き、1つの数)と違い、2変数関数 z=f(x,y) では
// 「進む向きによって傾きが違う」——同じ点でも x方向・y方向で傾き(偏微分)が異なり、
// 一般の向き θ への傾き(方向微分)は勾配ベクトルとの内積で決まる。

const POINT_MIN = -2;
const POINT_MAX = 2;
const POINT_STEP = 0.1;
// 中心差分の刻み幅(固定値)。surfacePartial.ts のコメント通り、この単元の4プリセットは
// すべて各断面が高々2次の多項式なので理論誤差 C=0(h の大小によらず解析解と一致する)。
// h をあまり小さくしないのは、桁落ちによる浮動小数点誤差の増幅を避けるため(数学モデルの
// テストコメントと同じ理由)。
const NUMERIC_H = 0.001;

type Prediction = 'same' | 'varies' | 'random';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'same', label: 'どの向きでも同じ' },
	{ value: 'varies', label: '向きによって変わる' },
	{ value: 'random', label: '急な向きと緩い向きがあるが規則性はない' },
];

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

function clampPoint(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(POINT_MAX, Math.max(POINT_MIN, Math.round(value / POINT_STEP) * POINT_STEP));
}

export function SurfacePartialExperiment() {
	const [fnId, setFnId] = useState<SurfaceFnId>('paraboloid');
	const [x0, setX0] = useState(1);
	const [y0, setY0] = useState(1);
	const [thetaDeg, setThetaDeg] = useState(45);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (関数プリセット選択)へフォーカスを移す(先行単元と同じ配慮)。
	const presetRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (submitted) presetRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setFnId('paraboloid');
		setX0(1);
		setY0(1);
		setThetaDeg(45);
	};

	// 数学モデル(lib/math/surfacePartial.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。解析解(partialX/Y)と中心差分(numericalPartialX/Y)という
	// 2つの独立な計算経路を突合する——これがこの単元の中核体験の実行時検証。
	const z0 = evaluateSurface(fnId, x0, y0);
	const dxAnalytic = partialX(fnId, x0, y0);
	const dyAnalytic = partialY(fnId, x0, y0);
	const dxNumeric = numericalPartialX(fnId, x0, y0, NUMERIC_H);
	const dyNumeric = numericalPartialY(fnId, x0, y0, NUMERIC_H);

	const scaleX = Math.max(1, Math.abs(dxAnalytic), Math.abs(dxNumeric));
	const scaleY = Math.max(1, Math.abs(dyAnalytic), Math.abs(dyNumeric));
	const xPathsMatch = approximatelyZero(dxAnalytic - dxNumeric, scaleX);
	const yPathsMatch = approximatelyZero(dyAnalytic - dyNumeric, scaleY);

	const directional = directionalDerivative(fnId, x0, y0, thetaDeg);
	const gradMag = gradientMagnitude(fnId, x0, y0);
	const gradDir = gradientDirectionDeg(fnId, x0, y0);

	const predictionCorrect = prediction === 'varies';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="surface-partial-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="surface-partial-exp-title">実験: 曲面の上で向きを変えて傾きを調べる</h2>

			{/* JS 無効時のフォールバック(Three.js はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な3D図解です。JavaScript を有効にすると、
					2変数関数 z=f(x,y) が作る曲面の上で注目点や向きを動かしながら、進む向きによって
					傾き(偏微分・方向微分)がどう変わるかを観察できます。JavaScript が無効でも要点は
					次の通りです: 曲面上の1点でも、x方向に進むときとy方向に進むときで傾き(偏微分)は
					一般に異なり、任意の向き θ への傾き(方向微分)は勾配ベクトルとの内積
					∂f/∂x・cosθ + ∂f/∂y・sinθ で決まります。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、2変数関数が作る曲面と、その上のある1点、そしてその点での接線を表しています。
					<strong>操作する前に予想してください:</strong> 山の斜面の上に立っています。踏み出す向きを
					変えると、足元の傾きはどうなると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="surface-partial-prediction"
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

			{/* Scene: 曲面メッシュ+注目点+x/y方向接線+離散カメラボタン。
			    偏微分の数値ラベルは submitted(予想確定後)のみ表示する(答えを構成する表示)。 */}
			<div className={styles.scene}>
				<SurfacePartialScene fnId={fnId} x0={x0} y0={y0} revealPartialLabels={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、関数・注目点・向きを操作して結果を
					観察できます。
				</p>
			) : (
				<>
					{/* Controls: 関数プリセット + 注目点 (x0,y0) スライダー2本 + 方向 θ スライダー
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設——スライダーはキーボードで
					    操作できる代替入力そのもの)。 */}
					<div className={styles.controls}>
						<fieldset className={styles.presetFieldset}>
							<legend>関数プリセット</legend>
							<div className={styles.presetButtons}>
								{SURFACE_PRESETS.map((preset, idx) => (
									<button
										key={preset.id}
										ref={idx === 0 ? presetRef : undefined}
										type="button"
										className={fnId === preset.id ? styles.presetButtonActive : styles.secondaryButton}
										onClick={() => setFnId(preset.id)}
										aria-pressed={fnId === preset.id}
									>
										{preset.label}({preset.formula})
									</button>
								))}
							</div>
						</fieldset>

						<div className={styles.control}>
							<label htmlFor="surface-x0-slider">注目点 x₀</label>
							<input
								id="surface-x0-slider"
								type="range"
								min={POINT_MIN}
								max={POINT_MAX}
								step={POINT_STEP}
								value={x0}
								onChange={(e) => setX0(clampPoint(Number(e.target.value)))}
							/>
							<span aria-live="polite">x₀ = {round2(x0)}</span>
						</div>

						<div className={styles.control}>
							<label htmlFor="surface-y0-slider">注目点 y₀</label>
							<input
								id="surface-y0-slider"
								type="range"
								min={POINT_MIN}
								max={POINT_MAX}
								step={POINT_STEP}
								value={y0}
								onChange={(e) => setY0(clampPoint(Number(e.target.value)))}
							/>
							<span aria-live="polite">y₀ = {round2(y0)}</span>
						</div>

						<div className={styles.control}>
							<label htmlFor="surface-theta-slider">
								踏み出す向き θ(度、x軸正方向を0°として反時計回り)
							</label>
							<input
								id="surface-theta-slider"
								type="range"
								min={0}
								max={360}
								step={5}
								value={thetaDeg}
								onChange={(e) => {
									const clamped = Math.min(360, Math.max(0, Math.round(Number(e.target.value) / 5) * 5));
									setThetaDeg(clamped);
								}}
							/>
							<span aria-live="polite">θ = {thetaDeg}°</span>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 曲面の高さ・両方向の偏微分(解析解・中心差分・一致ステータス)・
					    方向微分とその最大値・勾配方向のライブ表示。丸め前の内部値で判定し、表示のみ
					    丸める(MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">f(x₀, y₀)</th>
									<td>{formatSigned(z0)}</td>
								</tr>
								<tr>
									<th scope="row">∂f/∂x(解析解)</th>
									<td>{formatSigned(dxAnalytic)}</td>
								</tr>
								<tr>
									<th scope="row">∂f/∂x(中心差分、h={NUMERIC_H})</th>
									<td>{formatSigned(dxNumeric)}</td>
								</tr>
								<tr>
									<th scope="row">x方向: 両経路の一致</th>
									<td>{xPathsMatch ? '一致' : '不一致'}</td>
								</tr>
								<tr>
									<th scope="row">∂f/∂y(解析解)</th>
									<td>{formatSigned(dyAnalytic)}</td>
								</tr>
								<tr>
									<th scope="row">∂f/∂y(中心差分、h={NUMERIC_H})</th>
									<td>{formatSigned(dyNumeric)}</td>
								</tr>
								<tr>
									<th scope="row">y方向: 両経路の一致</th>
									<td>{yPathsMatch ? '一致' : '不一致'}</td>
								</tr>
								<tr>
									<th scope="row">方向微分 D_θf(θ={thetaDeg}°)</th>
									<td>{formatSigned(directional)}</td>
								</tr>
								<tr>
									<th scope="row">方向微分の最大値 |∇f|</th>
									<td>{round2(gradMag)}</td>
								</tr>
								<tr>
									<th scope="row">最大になる向き(勾配方向)</th>
									<td>{round2(gradDir)}°</td>
								</tr>
							</tbody>
						</table>
						<p className={xPathsMatch && yPathsMatch ? styles.statusHeld : styles.statusBroken}>
							{xPathsMatch && yPathsMatch
								? '解析解(偏微分の式)と中心差分(数値計算)の結果が、x方向・y方向とも一致しています。'
								: '解析解と中心差分の結果が一致しません。数学モデルに問題がある可能性があります。'}
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
								? 'その通りです。同じ点でも、進む向きによって足元の傾きは変わります。'
								: '実は、同じ点でも進む向きによって足元の傾きは変わります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: この点での傾きは1つの数ではなく、x方向の傾き(∂f/∂x=
							{formatSigned(dxAnalytic)})とy方向の傾き(∂f/∂y={formatSigned(dyAnalytic)})という
							2つの独立な値(偏微分)で決まります。一般の向き θ への傾き(方向微分)は、
							この2つを θ で重み付けした D_θf = ∂f/∂x・cosθ + ∂f/∂y・sinθ という式になり、
							θ={gradDir.toFixed(0)}° 付近(勾配方向)で最大値 |∇f|={gradMag.toFixed(2)} を取ります。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「1点での傾きは1つの数に決まる(1変数のときと同じ)」。しかし鞍点面
							(f=x²−y²)プリセットの (1,0) では x方向に+2(登り)・y方向に0ですが、(0,1)では
							y方向に−2(下り)になります——<strong>同じ曲面の同じような点でも、向きで正負すら
							変わります</strong>。関数プリセットを鞍点面に切り替え、注目点を (1,0) や (0,1)
							付近に動かして確かめてみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default SurfacePartialExperiment;
