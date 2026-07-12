import { useEffect, useRef, useState } from 'react';
import { scaleFrom, distance, triangleArea, type Point2 } from '../../lib/math/similarity.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { SimilarityScene } from '../scenes/mafs/SimilarityScene.js';
import styles from './SimilarityExperiment.module.css';

// 相似・拡大縮小のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// TrigonometryExperiment / QuadraticFunctionExperiment と同じ設計:
// 予想 (Prediction) → 操作 (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を
// 1つの島に収め、状態 (k, prediction) をここに一元管理する。数学の計算は
// lib/math/similarity.ts の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。
//
// 設計判断(rule of three との兼ね合い): この単元で操作する量は相似比 k のみとする。
// 相似の中心・元の三角形は固定の定数とし、Mafs シーン側にドラッグ可能な点は置かない
// (DoD が要求するのは「スライダー+数値入力+矢印キー+リセット」であり、既存単元のように
// ドラッグで別の量を操作する必要は仕様上ない。中心や頂点までドラッグ可能にするのは
// 過剰な先行実装になるため、rule of three に沿ってこの単元では見送る)。

const CENTER: Point2 = [-1, -1];
// 相似の中心 (-1,-1) の外側にある三角形。距離3(A-B)・2(A-C)の直角三角形、面積3。
const TRIANGLE: readonly [Point2, Point2, Point2] = [
	[1, 1],
	[4, 1],
	[1, 3],
];

const MIN_K = 0;
const MAX_K = 3;
const INITIAL_K = 2;
const STEP = 0.1;

type Prediction = 'double' | 'quadruple' | 'same';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'double', label: '面積比も2倍になる' },
	{ value: 'quadruple', label: '面積比は4倍になる' },
	{ value: 'same', label: '面積比は変わらない' },
];

function clampK(value: number): number {
	if (!Number.isFinite(value)) return MIN_K;
	return Math.min(MAX_K, Math.max(MIN_K, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function SimilarityExperiment() {
	const [k, setK] = useState(INITIAL_K);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (InteractiveExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputK, setInputK] = useState(String(INITIAL_K));

	// 状態の正規化 (clamp) はここに集約する。ドラッグ相当の入力はないが、スライダー・数値入力
	// すべてがこのハンドラを通るため、入力経路によらず単一の真実の状態になる。
	const handleKChange = (value: number) => setK(clampK(value));

	const commitInputK = () => {
		const parsed = Number(inputK);
		const next = Number.isFinite(parsed) && inputK.trim() !== '' ? clampK(parsed) : k;
		setK(next);
		setInputK(String(round2(next)));
	};

	// k が外部要因 (スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputK(String(round2(k)));
	}, [k]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI (k のスライダー)
	// へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const kSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) kSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setK(INITIAL_K);
	};

	// 数学モデル (lib/math/similarity.ts) による計算。丸めない内部値で判定する (MATH_CONVENTIONS §1)。
	const [A, B, C] = TRIANGLE;
	const originalSideAB = distance(A, B);
	const originalArea = triangleArea(A, B, C);
	const scaledA = scaleFrom(CENTER, k, A);
	const scaledB = scaleFrom(CENTER, k, B);
	const scaledC = scaleFrom(CENTER, k, C);
	const scaledSideAB = distance(scaledA, scaledB);
	const scaledArea = triangleArea(scaledA, scaledB, scaledC);
	// 元の三角形・中心は固定の定数であり originalSideAB・originalArea は常に非ゼロなので、
	// ここでの割り算がゼロ除算になることはない (k=0 でも 0/3 = 0 という有効な値になる)。
	const sideRatio = scaledSideAB / originalSideAB;
	const areaRatio = scaledArea / originalArea;

	// k=0 (退化ケース、MATH_CONVENTIONS §4): 拡大後の三角形が中心の1点に退化し、
	// 辺の長さ・面積がともに 0 になる。クラッシュさせず専用の文言で説明する
	// (TrigonometryExperiment の tanUndefined と同じ「安全に表示する」方針)。
	const isDegenerate = approximatelyZero(k, 1);

	// 観察ステータスの「一致」を断言せず、実測比が理論値と合うかを実行時に検証する
	// (GrokBuild C1: TrigonometryExperiment が恒等式を判定してから表示するのと同じ誠実さ)。
	// 辺の比は |k|(距離は非負)、面積比は k²。実測比がずれたら「一致」ではなく警告を出す。
	const ratiosHold =
		approximatelyZero(sideRatio - Math.abs(k), Math.max(1, Math.abs(k))) &&
		approximatelyZero(areaRatio - k * k, Math.max(1, k * k));

	const predictionCorrect = prediction === 'quadruple';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="similarity-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="similarity-exp-title">実験: 相似の中心から相似比 k で拡大する</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、三角形
					ABC を相似の中心 O から相似比 k で拡大・縮小しながら、
					<strong>辺の長さの比が k 倍、面積の比が k² 倍になること</strong>
					を確かめられます。JavaScript が無効でも関係そのものは次の通りです: 相似の中心
					O から相似比 k で図形を拡大・縮小すると、対応する辺の長さの比は常に k
					になり、面積の比は常に k² になります。k = 0 のときは、図形が中心 O
					の1点へ退化し、辺の長さも面積も 0 になります。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図では、三角形 ABC を相似の中心 O から相似比 k で拡大・縮小できます。
					<strong>操作する前に予想してください:</strong> 相似比 k を2倍にすると、
					三角形 A′B′C′ と元の三角形 ABC の<strong>面積比</strong>はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="similarity-prediction"
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

			{/* Scene: Tier 1 図解。ドラッグ可能な点は持たず、k の値に応じて再描画されるだけの表示 */}
			<div className={styles.scene}>
				<SimilarityScene center={CENTER} original={TRIANGLE} k={k} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、相似比 k を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="k-number">相似比 k</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="k-slider"
								ref={kSliderRef}
								type="range"
								min={MIN_K}
								max={MAX_K}
								step={STEP}
								value={k}
								aria-label="相似比 k(スライダー)"
								onChange={(e) => handleKChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。 */}
							<input
								id="k-number"
								type="text"
								inputMode="decimal"
								aria-describedby="k-range-hint"
								value={inputK}
								onChange={(e) => setInputK(e.target.value)}
								onBlur={commitInputK}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputK();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="k-range-hint" className={styles.rangeHint}>
							相似比 k は {MIN_K}〜{MAX_K} の範囲で指定できます(k=0 は中心の1点への退化)。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">相似比 k</th>
									<td>{round2(k)}</td>
								</tr>
								<tr>
									<th scope="row">辺 AB の長さ(元の三角形)</th>
									<td>{round2(originalSideAB)}</td>
								</tr>
								<tr>
									<th scope="row">辺 A′B′ の長さ(拡大後)</th>
									<td>{round2(scaledSideAB)}</td>
								</tr>
								<tr>
									<th scope="row">辺の比(A′B′ ÷ AB)</th>
									<td>{round2(sideRatio)}</td>
								</tr>
								<tr>
									<th scope="row">元の三角形の面積</th>
									<td>{round2(originalArea)}</td>
								</tr>
								<tr>
									<th scope="row">拡大後の三角形の面積</th>
									<td>{round2(scaledArea)}</td>
								</tr>
								<tr>
									<th scope="row">面積比(拡大後 ÷ 元)</th>
									<td>{round2(areaRatio)}</td>
								</tr>
							</tbody>
						</table>
						<p className={isDegenerate || !ratiosHold ? styles.statusBroken : styles.statusHeld}>
							{isDegenerate
								? 'k = 0 のため、拡大後の三角形は相似の中心 O の1点に退化しています(辺の長さ・面積ともに0)。'
								: ratiosHold
									? `辺の比は k(=${round2(k)})に、面積比は k²(=${round2(k * k)})に一致しています。`
									: '計算された辺の比・面積比が理論値(k・k²)と一致しません。数学モデルに問題がある可能性があります。'}
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
								? '実際、相似比 k を2倍にすると、面積比は4倍になります——面積比は k の2乗(k²)に比例するためです。'
								: '実際に k をいろいろ変えてみると、面積比は k² に比例することがわかります。k を2倍にすると、面積比は(2k)² = 4k² となり、常に4倍になります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜ4倍になるのか: 相似比が k のとき、対応する辺の長さはすべて k
							倍になります。三角形の面積は「底辺 × 高さ ÷ 2」で決まり、底辺も高さもともに
							k 倍になるため、面積は k × k = k² 倍になります。辺の比(1次元の量)と
							面積比(2次元の量)は同じ k 倍にはならない——ここが「面積比は相似比と同じ
							k 倍になる」という誤解の落とし穴です。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default SimilarityExperiment;
