import { useEffect, useRef, useState } from 'react';
import {
	evaluateComplex,
	argDeg,
	modulus,
	windingNumberAround,
	expectedWindingNumber,
	COMPLEX_PRESETS,
	type Complex,
	type ComplexFnId,
} from '../../lib/math/complexFunctions.js';
import { DomainColoringScene } from '../scenes/three/DomainColoringScene.js';
import styles from './DomainColoringExperiment.module.css';

// 「複素関数を見る — ドメインカラーリング」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。MVP 3 最終単元、ADR-005 §5 の
// 「まず ShaderMaterial」判断枠組みの初適用。SurfacePartialExperiment / MandelbrotExperiment
// と同じ設計: 予想 → 操作(Scene + Controls) → 観察 → 確認 を1つの島に収め、状態
// (関数プリセット fnId・表示領域 view・プローブ座標・prediction)をここで一元管理する(SSOT)。
// 数学の計算は lib/math/complexFunctions.ts の純粋関数へ委譲し、この層は描画(Three.js
// ShaderMaterial、DomainColoringScene)への橋渡し・入力同期・実行時交差検証
// (windingNumberAround の数値巻き数 vs expectedWindingNumber の閉形式)・提示に徹する。
//
// この単元の中核体験: 複素関数 w=f(z) は「複素数→複素数」なので4次元が必要に見えて
// グラフに描けないと誤解されがちだが、各点を w の偏角=色相・絶対値=明度で塗ると、
// 2次元の1枚の絵で全体の構造(とりわけ零点・極のまわりの「色の渦の巻き数」=重複度)が
// 読み取れる。canvas は装飾であり(色→値の正確な読み取りは不可能、概算のみ)、実際の数値は
// この観察表(DOM)が唯一の情報源として担保する。

const WIDTH = 640;
const HEIGHT = 480;
const ASPECT = HEIGHT / WIDTH;

interface View {
	readonly re: number;
	readonly im: number;
	readonly halfWidth: number;
}

const INITIAL_VIEW: View = { re: 0, im: 0, halfWidth: 3 };
const MIN_HALF_WIDTH = INITIAL_VIEW.halfWidth / 16;
const MAX_HALF_WIDTH = INITIAL_VIEW.halfWidth * 16;
const ZOOM_LIMIT_TOLERANCE = 1e-9;

const INITIAL_PROBE_RE = 0.3;
const INITIAL_PROBE_IM = 0.4;

// プローブを囲む小円の半径。既知の零点・極どうしの最小距離(cubeMinusOneの根は√3≈1.73、
// mobiusの零点・極は距離2)より十分小さく選び、「1つだけを囲む/どれも囲まない」の判定を
// 曖昧にしない(expectedWindingNumber の境界ちょうど=RangeError を実運用で踏まないための
// 設計上の余裕)。
const PROBE_RADIUS = 0.15;
// 数値巻き数の標本点数。プリセット中もっとも巻き数が大きい square(重複度2)でも、
// 半径 PROBE_RADIUS 程度の円1周でこのサンプル数なら偏角の変化は滑らかに追跡でき、
// 整数へ十分収束する(lib/math のテストで 480 サンプルとの一致を確認済み、UI は
// 対話性を優先してやや軽い 256 を既定にする)。
const WINDING_SAMPLES = 256;

type Prediction = 'impossible' | 'partial' | 'full';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'impossible', label: '描けない(4次元必要)' },
	{ value: 'partial', label: '一部の情報なら2次元に描ける' },
	{ value: 'full', label: '全部そのまま描ける' },
];

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

function clampHalfWidth(value: number): number {
	return Math.min(MAX_HALF_WIDTH, Math.max(MIN_HALF_WIDTH, value));
}

export function DomainColoringExperiment() {
	const [fnId, setFnId] = useState<ComplexFnId>('square');
	const [view, setView] = useState<View>(INITIAL_VIEW);
	const [probeRe, setProbeRe] = useState(INITIAL_PROBE_RE);
	const [probeIm, setProbeIm] = useState(INITIAL_PROBE_IM);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state(MandelbrotExperiment と同じ理由:
	// 確定(blur/Enter)時にのみ数値へ反映し、入力途中の破壊を防ぐ)。
	const [inputProbeRe, setInputProbeRe] = useState(String(INITIAL_PROBE_RE));
	const [inputProbeIm, setInputProbeIm] = useState(String(INITIAL_PROBE_IM));
	useEffect(() => setInputProbeRe(String(probeRe)), [probeRe]);
	useEffect(() => setInputProbeIm(String(probeIm)), [probeIm]);

	const commitInputProbeRe = () => {
		const parsed = Number(inputProbeRe);
		const next = Number.isFinite(parsed) && inputProbeRe.trim() !== '' ? parsed : probeRe;
		setProbeRe(next);
		setInputProbeRe(String(next));
	};
	const commitInputProbeIm = () => {
		const parsed = Number(inputProbeIm);
		const next = Number.isFinite(parsed) && inputProbeIm.trim() !== '' ? parsed : probeIm;
		setProbeIm(next);
		setInputProbeIm(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作UI
	// (関数プリセットの先頭ボタン)へフォーカスを移す(先行単元と同じ配慮)。
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
		setFnId('square');
		setView(INITIAL_VIEW);
		setProbeRe(INITIAL_PROBE_RE);
		setProbeIm(INITIAL_PROBE_IM);
	};

	const zoomLimitReached = view.halfWidth <= MIN_HALF_WIDTH * (1 + ZOOM_LIMIT_TOLERANCE);
	const zoomOutLimitReached = view.halfWidth >= MAX_HALF_WIDTH * (1 - ZOOM_LIMIT_TOLERANCE);

	const zoomIn = () => setView((v) => ({ ...v, halfWidth: clampHalfWidth(v.halfWidth / 2) }));
	const zoomOut = () => setView((v) => ({ ...v, halfWidth: clampHalfWidth(v.halfWidth * 2) }));
	const panLeft = () => setView((v) => ({ ...v, re: v.re - v.halfWidth / 2 }));
	const panRight = () => setView((v) => ({ ...v, re: v.re + v.halfWidth / 2 }));
	const panUp = () => setView((v) => ({ ...v, im: v.im + (v.halfWidth * ASPECT) / 2 }));
	const panDown = () => setView((v) => ({ ...v, im: v.im - (v.halfWidth * ASPECT) / 2 }));

	// 数学モデル(lib/math/complexFunctions.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。
	const probe: Complex = [probeRe, probeIm];
	const fProbe = evaluateComplex(fnId, probe);
	const probeModulus = fProbe ? modulus(fProbe) : null;
	const probeArgDeg = fProbe ? argDeg(fProbe) : null;

	// 実行時交差検証(C-7): プローブを囲む小円の数値巻き数(windingNumberAround、円周上の
	// 偏角を積分する経路)と、既知の零点・極の重複度からの期待巻き数(expectedWindingNumber、
	// evaluateComplex を一切呼ばない閉形式の経路)を突合する。境界ちょうど(RangeError)は
	// 「判定不能」として中立に扱う——サイレントに握りつぶさない。
	let numericWinding: number | null = null;
	let expectedWindingValue: number | null = null;
	let windingAmbiguous = false;
	try {
		numericWinding = windingNumberAround(fnId, probe, PROBE_RADIUS, WINDING_SAMPLES);
		expectedWindingValue = expectedWindingNumber(fnId, probe, PROBE_RADIUS);
	} catch {
		windingAmbiguous = true;
	}
	const windingMatches =
		numericWinding !== null &&
		expectedWindingValue !== null &&
		Math.abs(numericWinding - expectedWindingValue) < 0.1;

	const predictionCorrect = prediction === 'partial';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="domain-coloring-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="domain-coloring-exp-title">実験: 複素関数を色で見る(ドメインカラーリング)</h2>

			{/* JS 無効時のフォールバック。本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、複素平面の
					各点を、複素関数 w=f(z) の偏角(色相)と絶対値(明るさ)で塗った「ドメインカラーリング」
					を観察できます。JavaScript が無効でも要点は次の通りです: 複素関数は「複素数→複素数」
					なので一見グラフに描けないように思えますが、色を使えば2次元の1枚の絵で構造の要点
					(とりわけ零点・極のまわりで色相が渦を巻く回数=重複度)が読み取れます。詳しくは下の
					「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					複素数を入れると複素数が出てくる関数、たとえば f(z)=z² を考えます。
					<strong>操作する前に予想してください:</strong> このような関数は「グラフ」に描けると
					思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="domain-coloring-prediction"
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

			{/* Scene: 全画面クアッド+ShaderMaterialによるドメインカラーリング(ADR-005 §5)。
			    色相環の凡例は submitted(予想確定後)のみ表示する(答えを構成する表示)。 */}
			<div className={styles.scene}>
				<DomainColoringScene
					fnId={fnId}
					centerRe={view.re}
					centerIm={view.im}
					halfWidth={view.halfWidth}
					revealLegend={submitted}
				/>
				{submitted && (
					<p className={styles.legendHint}>
						右上の色相環: 色相は偏角(反時計回りに0°→360°)を表します。明るさは絶対値
						(対数スケール、暗いほど0に近く=零点、明るいほど大きい=極)を表します。
					</p>
				)}
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、関数・表示領域・プローブ座標を操作して
					結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 関数プリセット + ズーム/パン(DOMボタン、ADR-005 §5: OrbitControls
					    不要・キーボード操作可能な代替) + プローブ座標の数値入力。 */}
					<div className={styles.controls}>
						<fieldset className={styles.presetFieldset}>
							<legend>関数プリセット</legend>
							<div className={styles.presetButtons}>
								{COMPLEX_PRESETS.map((preset, idx) => (
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

						<div className={styles.buttonGroup} role="group" aria-label="表示領域の拡大・縮小・移動">
							<button type="button" onClick={zoomIn} disabled={zoomLimitReached}>
								ズームイン(拡大 ×2)
							</button>
							<button type="button" onClick={zoomOut} disabled={zoomOutLimitReached}>
								ズームアウト(縮小 ÷2)
							</button>
							<button type="button" onClick={panUp}>
								上へパン
							</button>
							<button type="button" onClick={panDown}>
								下へパン
							</button>
							<button type="button" onClick={panLeft}>
								左へパン
							</button>
							<button type="button" onClick={panRight}>
								右へパン
							</button>
							<button type="button" className={styles.secondaryButton} onClick={reset}>
								リセット
							</button>
						</div>

						<div className={styles.control}>
							<label htmlFor="probe-re-number">プローブ z の実部(re)</label>
							<input
								id="probe-re-number"
								type="text"
								inputMode="decimal"
								value={inputProbeRe}
								onChange={(e) => setInputProbeRe(e.target.value)}
								onBlur={commitInputProbeRe}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputProbeRe();
								}}
							/>
						</div>
						<div className={styles.control}>
							<label htmlFor="probe-im-number">プローブ z の虚部(im)</label>
							<input
								id="probe-im-number"
								type="text"
								inputMode="decimal"
								value={inputProbeIm}
								onChange={(e) => setInputProbeIm(e.target.value)}
								onBlur={commitInputProbeIm}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputProbeIm();
								}}
							/>
						</div>
					</div>

					<p className={styles.probeHint} role="note">
						試してみる値の例(いずれも既知の零点・極、半径 {PROBE_RADIUS} の小円で巻き数を確認):
						z²は (0, 0) → 巻き数2。z³−1は (1, 0) / (−0.5, 0.87) / (−0.5, −0.87) → いずれも
						巻き数1。1/zは (0, 0) → 巻き数−1(極、零点と逆回り)。(z−1)/(z+1)は (1, 0) → +1
						(零点)、(−1, 0) → −1(極)。
					</p>

					{/* Observation: プローブでの f(z) の実値・巻き数の実行時交差検証。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">プローブ z</th>
									<td>
										({formatSigned(probeRe)}, {formatSigned(probeIm)})
									</td>
								</tr>
								<tr>
									<th scope="row">f(z)</th>
									<td>
										{fProbe
											? `(${formatSigned(fProbe[0])}, ${formatSigned(fProbe[1])})`
											: '未定義(この点は極)'}
									</td>
								</tr>
								<tr>
									<th scope="row">|f(z)|(絶対値)</th>
									<td>{probeModulus !== null ? round2(probeModulus) : '—'}</td>
								</tr>
								<tr>
									<th scope="row">arg(f(z))(偏角、度)</th>
									<td>{probeArgDeg !== null ? formatSigned(probeArgDeg) : '—'}</td>
								</tr>
								<tr>
									<th scope="row">プローブを囲む小円(半径{PROBE_RADIUS})の数値巻き数</th>
									<td>{numericWinding !== null ? numericWinding.toFixed(2) : '判定不能'}</td>
								</tr>
								<tr>
									<th scope="row">期待巻き数(既知の零点・極の重複度、閉形式)</th>
									<td>{expectedWindingValue !== null ? expectedWindingValue : '判定不能'}</td>
								</tr>
								<tr>
									<th scope="row">両経路の一致</th>
									<td>{windingAmbiguous ? '判定不能' : windingMatches ? '一致' : '不一致'}</td>
								</tr>
							</tbody>
						</table>
						<p
							className={
								windingAmbiguous ? styles.narration : windingMatches ? styles.statusHeld : styles.statusBroken
							}
						>
							{windingAmbiguous
								? 'この円は特異点のちょうど真上を通っており判定できません。プローブ座標を少しずらしてください。'
								: windingMatches
									? '数値巻き数(円周上で偏角を積分)と期待巻き数(既知の零点・極の重複度)が一致しています。'
									: '数値巻き数と期待巻き数が一致しません。数学モデルに問題がある可能性があります。'}
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
								? 'その通りです。色を使うと2次元の1枚の絵で構造の要点が見えます。'
								: '実は、色を使うと2次元の1枚の絵で構造の要点が見えます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: w=f(z) は複素数なので「実部・虚部」または同じ情報を持つ
							「絶対値・偏角」という2つの数で決まります。1つの数(高さ)しか持たない実関数の
							グラフとは違い、複素関数は出力そのものが2次元の量です。そこで、入力平面の
							各点を出力の偏角=色相・絶対値=明るさで塗れば、出力の2つの成分を色という
							1つのチャンネルに載せて、2次元の1枚の絵に収められます——「4次元必要だから
							描けない」わけではなく、色という工夫で2次元に収める方法があるのです。ただし
							色から正確な数値を目で読み取るのは困難なので、正確な値はこの観察表(プローブ)
							が担います。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「複素関数はグラフに描けない(4次元必要だから見えない)」。上の
							実験の色の模様は、実は零点・極の情報も持っています——プローブを既知の零点・極に
							近づけると、その周りの小円をたどったときの色相が、零点では重複度の回数だけ
							一周し、極では逆回りに一周します。これは「色の渦の巻き数」という目には見えない
							整数(重複度)を、色という2次元の絵から読み取れることを意味します。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DomainColoringExperiment;
