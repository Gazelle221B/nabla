import { useEffect, useRef, useState } from 'react';
import {
	escapeTime,
	isInMainCardioid,
	isInPeriod2Bulb,
	type MandelbrotView,
} from '../../lib/math/mandelbrot.js';
import { MandelbrotScene } from '../scenes/canvas/MandelbrotScene.js';
import styles from './MandelbrotExperiment.module.css';

// 「フラクタル — 拡大しても終わらない図形」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。FourierSeriesExperiment / LimitsSequencesExperiment
// と同じ設計: 予想 → 操作(Scene + Controls) → 観察 → 確認 を1つの島に収め、状態
// (表示領域 view・最大反復回数 maxIter・プローブ座標・prediction)をここで一元管理する(SSOT)。
// 数学の計算は lib/math/mandelbrot.ts の純粋関数へ委譲し、この層は描画(Canvas2D、
// MandelbrotScene)への橋渡し・入力同期・実行時交差検証(閉形式 vs 反復の突合)・提示に徹する。
//
// この単元の中核体験: 座標 (x, y) を「2乗して c を足す」というたった1つの2次式の規則で
// 繰り返し動かす。逃げ出すか、留まるかで塗り分けた図形(マンデルブロ集合)を、拡大しても
// 同じような複雑さが現れ続けることを発見する(誤解=「どんな図形も、拡大していけばいつかは
// 滑らかな単純な線に見えてくる」の反証)。
//
// ADR-004: この単元は Canvas2D + putImageData(操作確定時のみ再計算、毎フレーム再計算は
// 設計に組み込まない)。canvas は aria-hidden であり、観察表(DOM)が唯一の情報源を担う。

type Prediction = 'smooth' | 'complex-forever' | 'fades';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'smooth', label: 'だんだん滑らかな線に見えてくる' },
	{ value: 'complex-forever', label: '同じような複雑な形が現れ続ける' },
	{ value: 'fades', label: 'ぼやけて何も見えなくなる' },
];

const WIDTH = 640;
const HEIGHT = 480;
const ASPECT = HEIGHT / WIDTH;

const INITIAL_VIEW: MandelbrotView = { centerX: -0.5, centerY: 0, halfWidth: 1.5 };

// ズーム上限の根拠: 画面幅 640px で halfWidth が縮むと、隣接ピクセルが表す数学座標の間隔
// dx = 2*halfWidth/width も縮む。IEEE754 倍精度(number)は、大きさ~1 の値の周辺で
// 隣り合う表現可能な値の間隔(ULP)が Number.EPSILON(≈2.22e-16)程度しかない。
// dx がこの ULP に迫ると、隣接ピクセルの x0 が同じ浮動小数点値に丸め込まれてしまい、
// これ以上拡大しても新しい情報が得られず絵が破綻する(格子状のノイズ・階段状の劣化)。
// 10^13 倍(halfWidth ≈ 1.5e-13)では dx = 2*1.5e-13/640 ≈ 4.7e-16 ≈ 2.1 ULP まで迫っており、
// これを上限として採用する(この上限は「絵が破綻し始める」実務的な安全側の閾値であり、
// 理論上の限界ちょうどではない——若干手前で止めることで見た目の破綻を避ける)。
// ズームインの上限は 10^6 倍。理論上は倍精度の ULP 限界(~10^13 倍)まで座標計算は
// 可能だが、maxIter の上限(500)の反復予算では 10^6 倍を超える境界深部の構造を解像
// できず「黒つぶれ」する(QA 指摘: 上限だけ深くても『複雑さが現れ続ける』の観察が
// 成立しない)。観察が成立する範囲に上限を合わせ、上限到達時は理由を明示する。
const MAX_ZOOM_EXPONENT = 6;
const MIN_HALF_WIDTH = INITIAL_VIEW.halfWidth / 10 ** MAX_ZOOM_EXPONENT;
// ズームアウトの上限。初期表示の16倍まで(妥当な範囲に留め、際限なく縮小できないようにする)。
const MAX_HALF_WIDTH = INITIAL_VIEW.halfWidth * 16;
// ズームボタンが実際に上限へ到達したかどうかの判定に使う相対許容誤差
// (浮動小数点の丸めで exact 一致にならない場合に備える)。
const ZOOM_LIMIT_TOLERANCE = 1e-9;

const MAX_ITER_MIN = 50;
const MAX_ITER_MAX = 500;
const MAX_ITER_STEP = 50;
const INITIAL_MAX_ITER = 100;

const INITIAL_PROBE_CX = 0;
const INITIAL_PROBE_CY = 0;

/** maxIter は 50 刻みの整数に丸めた上で範囲へクランプする(スライダーの刻みと数値入力を
 * 一致させ、中途半端な値が観察表と食い違わないようにする)。 */
function clampMaxIter(value: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	const clamped = Math.min(MAX_ITER_MAX, Math.max(MAX_ITER_MIN, value));
	return Math.round(clamped / MAX_ITER_STEP) * MAX_ITER_STEP;
}

/**
 * 表示中心の座標フォーマット(表示専用)。既定の小数第2位(MATH_CONVENTIONS §8)のままだと、
 * 深くズームしたときに中心座標が「変化していないように」見えてしまう(実際には小数点以下
 * 十数桁の違いが本質のため)。ズーム段数に応じて表示桁数を増やす、この単元固有の拡張
 * (§8: 桁数を単元ごとに変える場合は明示すること、というルールに従いここに明記する)。
 */
function formatCenterCoordinate(value: number, halfWidth: number): string {
	const zoomExponent = Math.max(0, Math.log10(INITIAL_VIEW.halfWidth / halfWidth));
	const decimals = Math.min(15, Math.max(2, Math.ceil(zoomExponent) + 3));
	const normalized = Object.is(value, -0) ? 0 : value;
	return normalized.toFixed(decimals);
}

function zoomFactorOf(halfWidth: number): number {
	return INITIAL_VIEW.halfWidth / halfWidth;
}

/** 拡大率を「◯◯倍(10^n 表記)」で表示する(表示専用)。 */
function formatZoomFactor(halfWidth: number): string {
	const factor = zoomFactorOf(halfWidth);
	const exponent = Math.log10(factor);
	const factorText = factor < 1e6 ? String(Math.round(factor)) : factor.toExponential(2);
	return `${factorText}倍(10^${exponent.toFixed(1)})`;
}

export function MandelbrotExperiment() {
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const [view, setView] = useState<MandelbrotView>(INITIAL_VIEW);
	const [maxIter, setMaxIter] = useState(INITIAL_MAX_ITER);
	const [probeCx, setProbeCx] = useState(INITIAL_PROBE_CX);
	const [probeCy, setProbeCy] = useState(INITIAL_PROBE_CY);

	// 数値入力の編集途中の文字列を保持する表示用 state(FourierSeriesExperiment と同じ理由:
	// 確定(blur/Enter)時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputMaxIter, setInputMaxIter] = useState(String(INITIAL_MAX_ITER));
	const [inputProbeCx, setInputProbeCx] = useState(String(INITIAL_PROBE_CX));
	const [inputProbeCy, setInputProbeCy] = useState(String(INITIAL_PROBE_CY));
	useEffect(() => setInputMaxIter(String(maxIter)), [maxIter]);
	useEffect(() => setInputProbeCx(String(probeCx)), [probeCx]);
	useEffect(() => setInputProbeCy(String(probeCy)), [probeCy]);

	const commitInputMaxIter = () => {
		const parsed = Number(inputMaxIter);
		const next =
			inputMaxIter.trim() !== '' ? clampMaxIter(parsed, maxIter) : maxIter;
		setMaxIter(next);
		setInputMaxIter(String(next));
	};
	const commitInputProbeCx = () => {
		const parsed = Number(inputProbeCx);
		const next = Number.isFinite(parsed) && inputProbeCx.trim() !== '' ? parsed : probeCx;
		setProbeCx(next);
		setInputProbeCx(String(next));
	};
	const commitInputProbeCy = () => {
		const parsed = Number(inputProbeCy);
		const next = Number.isFinite(parsed) && inputProbeCy.trim() !== '' ? parsed : probeCy;
		setProbeCy(next);
		setInputProbeCy(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作UI
	// (最大反復回数のスライダー)へフォーカスを移す。
	const maxIterSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) maxIterSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setView(INITIAL_VIEW);
		setMaxIter(INITIAL_MAX_ITER);
		setProbeCx(INITIAL_PROBE_CX);
		setProbeCy(INITIAL_PROBE_CY);
	};

	const zoomLimitReached = view.halfWidth <= MIN_HALF_WIDTH * (1 + ZOOM_LIMIT_TOLERANCE);
	const zoomOutLimitReached = view.halfWidth >= MAX_HALF_WIDTH * (1 - ZOOM_LIMIT_TOLERANCE);

	const zoomIn = () => setView((v) => ({ ...v, halfWidth: Math.max(MIN_HALF_WIDTH, v.halfWidth / 2) }));
	const zoomOut = () => setView((v) => ({ ...v, halfWidth: Math.min(MAX_HALF_WIDTH, v.halfWidth * 2) }));
	const panLeft = () => setView((v) => ({ ...v, centerX: v.centerX - v.halfWidth / 2 }));
	const panRight = () => setView((v) => ({ ...v, centerX: v.centerX + v.halfWidth / 2 }));
	const panUp = () =>
		setView((v) => ({ ...v, centerY: v.centerY + (v.halfWidth * ASPECT) / 2 }));
	const panDown = () =>
		setView((v) => ({ ...v, centerY: v.centerY - (v.halfWidth * ASPECT) / 2 }));

	// 数学モデルによる計算。lib/math の純粋関数をそのまま再利用する(重複実装しない、
	// タスク厳守事項)。
	const probeEscape = escapeTime(probeCx, probeCy, maxIter);
	const probeInCardioid = isInMainCardioid(probeCx, probeCy);
	const probeInBulb = isInPeriod2Bulb(probeCx, probeCy);

	// 実行時交差検証(C-7): 主カージオイド・周期2バルブの閉形式判定(代数的な領域判定)と、
	// 反復計算(escapeTime、完全に別経路)を突き合わせる。どちらの領域にも該当しない点では
	// 閉形式による予測ができない(この実験の閉形式判定は2領域に限定しているだけで、それ以外にも
	// マンデルブロ集合に属す点はある)ため、中立ステータスとして扱う。
	const crossValidationApplicable = probeInCardioid || probeInBulb;
	const crossValidationHeld = !crossValidationApplicable || probeEscape === maxIter;

	const predictionCorrect = prediction === 'complex-forever';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="mandelbrot-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="mandelbrot-exp-title">実験: 座標を繰り返し動かして、拡大しても終わらない図形を探す</h2>

			{/* JS 無効時のフォールバック。本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。
			    ADR-004: Canvas はマウントまで描画しないため図は出ない。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、座標 (x, y) を
					「2乗して c を足す」規則で繰り返し動かし、逃げ出すか留まるかで塗り分けた図形(マンデルブロ
					集合)を、拡大しながら観察できます。JavaScript が無効でも要点は次の通りです: この図形の
					縁(境界)は、円や放物線のように拡大すればいつか滑らかに見えるようになる図形とは違い、
					どこまで拡大しても同じような複雑な形が現れ続けます(自己相似)。詳しくは下の「形式的な定義」を
					参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、座標 (x, y) を「2乗して c を足す」という同じ規則で何度も動かしたとき、
					その軌道が無限に遠くへ逃げ出すか、それとも有界な範囲に留まり続けるかで塗り分けたものです
					(黒い部分は「この最大反復回数までは逃げ出さなかった」点——留まり続ける点の近似的な見取り図です)。<strong>操作する前に予想してください:</strong>
					この図形の縁を拡大していくと、最後には何が見えてくると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="mandelbrot-prediction"
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

			{/* Scene は予想ゲートの前から常時表示する(本文が図を参照するため)が、ズーム/パン等の
			    操作(答えを構成する)は予想確定後にのみ現れる。ゲート前は view/maxIter は初期値のまま
			    固定され、初期の全体図だけが見える。 */}
			<div className={styles.scene}>
				<MandelbrotScene view={view} maxIter={maxIter} width={WIDTH} height={HEIGHT} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、拡大・パン・最大反復回数・プローブ座標を
					操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: ボタン中心でキーボード完結(docs/DESIGN.md §非機能要件)。 */}
					<div className={styles.controls}>
						<div className={styles.buttonGroup} role="group" aria-label="拡大・縮小・移動">
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

						{zoomLimitReached && (
							<p className={styles.limitNote} role="note">
								この実験アプリの拡大の上限です。数学的にはこの先も無限に構造が続きますが、境界の
								深部を描くにはこの単元の最大反復回数(500)では足りず、未脱出の黒に塗りつぶされて
								観察になりません(さらに約10¹³倍では倍精度浮動小数点の精度限界にも達します)。
								計算資源の限界であって、図形が終わったわけではありません。
							</p>
						)}

						<div className={styles.control}>
							<label htmlFor="max-iter-number">最大反復回数</label>
							<input
								id="max-iter-slider"
								ref={maxIterSliderRef}
								type="range"
								min={MAX_ITER_MIN}
								max={MAX_ITER_MAX}
								step={MAX_ITER_STEP}
								value={maxIter}
								aria-label="最大反復回数(スライダー)"
								onChange={(e) => setMaxIter(clampMaxIter(Number(e.target.value), maxIter))}
							/>
							<input
								id="max-iter-number"
								type="text"
								inputMode="numeric"
								aria-describedby="max-iter-range-hint"
								value={inputMaxIter}
								onChange={(e) => setInputMaxIter(e.target.value)}
								onBlur={commitInputMaxIter}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputMaxIter();
								}}
							/>
							<p id="max-iter-range-hint" className={styles.rangeHint}>
								最大反復回数は {MAX_ITER_MIN}〜{MAX_ITER_MAX}({MAX_ITER_STEP} 刻み)で指定できます。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="probe-cx-number">プローブの x 座標(cx)</label>
							<input
								id="probe-cx-number"
								type="text"
								inputMode="decimal"
								value={inputProbeCx}
								onChange={(e) => setInputProbeCx(e.target.value)}
								onBlur={commitInputProbeCx}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputProbeCx();
								}}
							/>
						</div>
						<div className={styles.control}>
							<label htmlFor="probe-cy-number">プローブの y 座標(cy)</label>
							<input
								id="probe-cy-number"
								type="text"
								inputMode="decimal"
								value={inputProbeCy}
								onChange={(e) => setInputProbeCy(e.target.value)}
								onBlur={commitInputProbeCy}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputProbeCy();
								}}
							/>
						</div>
					</div>
					{/* QA 指摘の反映: 初期プローブ (0,0) はカージオイド深部で動きがないため、
					    境界の面白さへ誘導する具体例を提示する(値の正しさは転用問題でも扱う)。 */}
					<p className={styles.probeHint} role="note">
						試してみる値の例: (1, 0) は3回で脱出、(−1, 0) は周期2で留まる(閉形式でも内部と
						判定)、(−2, 0) はぎりぎり境界上、(−2.0001, 0) は1回で脱出。境界の鋭敏さは
						(−0.75, 0.05) や (0.25, 0.01) など縁のすぐそばで観察できます。
					</p>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">表示中心 (cx, cy)</th>
									<td>
										({formatCenterCoordinate(view.centerX, view.halfWidth)},{' '}
										{formatCenterCoordinate(view.centerY, view.halfWidth)})
									</td>
								</tr>
								<tr>
									<th scope="row">拡大率</th>
									<td>{formatZoomFactor(view.halfWidth)}</td>
								</tr>
								<tr>
									<th scope="row">最大反復回数</th>
									<td>{maxIter}</td>
								</tr>
								<tr>
									<th scope="row">プローブ座標 (cx, cy)</th>
									<td>
										({formatCenterCoordinate(probeCx, view.halfWidth)}, {formatCenterCoordinate(probeCy, view.halfWidth)})
									</td>
								</tr>
								<tr>
									<th scope="row">プローブの escapeTime(実値)</th>
									<td>
										{probeEscape}
										{probeEscape === maxIter ? '(最大反復回数まで留まる)' : '(この回数で脱出)'}
									</td>
								</tr>
								<tr>
									<th scope="row">プローブは主カージオイド内部か(閉形式)</th>
									<td>{probeInCardioid ? 'はい' : 'いいえ'}</td>
								</tr>
								<tr>
									<th scope="row">プローブは周期2バルブ内部か(閉形式)</th>
									<td>{probeInBulb ? 'はい' : 'いいえ'}</td>
								</tr>
							</tbody>
						</table>

						{crossValidationApplicable ? (
							<p className={crossValidationHeld ? styles.statusHeld : styles.statusBroken}>
								{crossValidationHeld
									? '閉形式(カージオイド/バルブの判定式)と反復計算(escapeTime)は一致しています——この点は決して脱出しません。'
									: '閉形式と反復計算が一致しません。数学モデルに問題がある可能性があります。'}
							</p>
						) : (
							<p className={styles.statusNeutral}>
								この点は主カージオイド・周期2バルブのどちらの閉形式判定にも該当しません(この2つの
								外側にもマンデルブロ集合に属す点はありますが、この実験の閉形式判定は2領域に限定して
								います)。実際に留まるかどうかは反復計算(escapeTime)の結果を参照してください。
							</p>
						)}
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
								: '実は、この図形の縁は拡大しても滑らかにはならず、同じような複雑な形(渦・枝分かれ)が現れ続けます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 円や放物線のような滑らかな図形は、十分に拡大すると直線に近づいて
							見えます。しかしマンデルブロ集合の縁はそうではありません——上のズームボタンで何段階も
							拡大し、拡大率が10桁(10^10)を超えても、図形が単純な線に近づくのではなく、同じような
							複雑さ(渦巻き・枝分かれ)が繰り返し現れ続けることを確かめてみましょう。この「拡大しても
							同じような構造が現れ続ける」性質を<strong>自己相似</strong>と呼び、この単元のような図形を
							<strong>フラクタル</strong>と呼びます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「どんな図形も、拡大していけばいつかは滑らかな単純な線に見えてくる」——
							円や放物線ならその通りですが、マンデルブロ集合の縁ではこれは誤りです。反例を1つ見つければ
							十分で、上の観察で実際に確かめられる通り、拡大率をどれだけ上げても複雑さは尽きません。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default MandelbrotExperiment;
