import { useEffect, useRef, useState } from 'react';
import { mean, variance, standardDeviation, covariance, correlation, type Point2 } from '../../lib/math/statistics.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { ScatterScene } from '../scenes/mafs/ScatterScene.js';
import styles from './DataAnalysisExperiment.module.css';

// 「データの分析 — 平均・分散・相関」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。DotProductExperiment / CombinatoricsExperiment と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態
// (可動点の x, y・prediction)をここに一元管理する(SSOT)。数学の計算は
// lib/math/statistics.ts の純粋関数へ委譲し、この層は描画・入力同期・実行時検証
// (分散の2定義の一致)・提示に徹する。
//
// この単元の中核体験:
//   (1) 散布図上の1点(外れ値候補、可動点)を動かすと、平均点・相関係数がどう変化するかを発見する。
//   (2) 相関係数 r は「直線的な関係の強さ」だけを測る量であり、全ての点のx座標(またはy座標)が
//       同じになると、r は数学的に定義できなくなる(safe 表示)。
//
// データの設計判断(x 方向に散らした右上がりの雲): 旧配置(固定5点が全て x=3 の縦一列)は
// QA_MEMORY(Antigravity)が FAIL 指摘した数学的欠陥を持っていた——x 偏差ベクトルが可動点
// のみで決まるため、相関のスケール不変性により可動点の x をどれだけ遠くへ動かしても |r| が
// 一切変化しない(符号反転のみ)。つまり「外れ値を遠くへ動かすと相関が変わる」という中核体験
// が x 方向で成立していなかった。固定点を散らした本配置では、可動点の位置(x・y とも)に
// 応じて r が連続的に変化する(初期 (8,8) で r≈0.98、(8,−5) で −0.37、(9,−5) で −0.46)。
// トレードオフ: 「全点同一 x」は UI から到達不能になるが、correlation の null 分岐は
// lib テストが担保し、UI 側の safe 表示は防御コードとして残す。
const FIXED_POINTS: readonly Point2[] = [
	[1, 2],
	[2, 3],
	[4, 4],
	[5, 6],
	[6, 6],
];

const INITIAL_MOVABLE: Point2 = [8, 8];

const MOVABLE_X_MIN = 0;
const MOVABLE_X_MAX = 10;
const MOVABLE_Y_MIN = -6;
const MOVABLE_Y_MAX = 14;

// 初期状態(可動点が INITIAL_MOVABLE のとき)の平均・相関係数。checkpoint で「動かした結果、
// どれだけ変化したか」を示すための参照値として使う定数(状態に依存しないため、モジュール
// スコープで一度だけ純粋関数を呼び出して求める。副作用なし、React 不要)。
const INITIAL_ALL_POINTS: readonly Point2[] = [...FIXED_POINTS, INITIAL_MOVABLE];
const INITIAL_XS = INITIAL_ALL_POINTS.map((p) => p[0]);
const INITIAL_YS = INITIAL_ALL_POINTS.map((p) => p[1]);
const INITIAL_MEAN_Y = mean(INITIAL_YS);
// 初期データは FIXED_POINTS が全て x=3 ではなく可動点だけ x=8 のため x に散らばりがあり、
// correlation は null にならない(構造的に non-null であることをコメントで明示し、
// null 分岐を通らない前提を以下で使う)。
const INITIAL_CORRELATION = correlation(INITIAL_XS, INITIAL_YS) as number;

type Prediction = 'bothChangeALot' | 'onlyMeanChanges' | 'bothStayStable';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'bothChangeALot', label: '平均も相関係数も大きく変わる' },
	{ value: 'onlyMeanChanges', label: '平均は大きく変わるが、相関係数はほとんど変わらない' },
	{ value: 'bothStayStable', label: '点は1個だけなので、平均も相関係数もほとんど変わらない' },
];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampMovableX(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_MOVABLE[0];
	return clamp(Math.round(value), MOVABLE_X_MIN, MOVABLE_X_MAX);
}

function clampMovableY(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_MOVABLE[1];
	return clamp(Math.round(value), MOVABLE_Y_MIN, MOVABLE_Y_MAX);
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

// 二乗の平均 E[v²] をこのコンポーネント内で独立に計算する(lib/math/statistics.ts の実装を
// 一切呼ばずに書く)。分散の2定義 Σ(v−v̄)²/n(lib 側の実装)と E[v²]−v̄²(ここでの独立実装)を
// 実行時に突合し、実装が分離された2経路が一致するかをステータス文で示す
// (C-7: 自己確認的な検証にしない。同じ式へ戻すだけの確認ではなく、別の式・別のコードパスで
// 計算した値を比較する)。
function independentMeanOfSquares(values: readonly number[]): number {
	let sum = 0;
	for (const v of values) sum += v * v;
	return sum / values.length;
}

export function DataAnalysisExperiment() {
	const [movableX, setMovableX] = useState(INITIAL_MOVABLE[0]);
	const [movableY, setMovableY] = useState(INITIAL_MOVABLE[1]);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DotProductExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputX, setInputX] = useState(String(INITIAL_MOVABLE[0]));
	const [inputY, setInputY] = useState(String(INITIAL_MOVABLE[1]));

	useEffect(() => setInputX(String(movableX)), [movableX]);
	useEffect(() => setInputY(String(movableY)), [movableY]);

	const handleMovableXChange = (value: number) => setMovableX(clampMovableX(value));
	const handleMovableYChange = (value: number) => setMovableY(clampMovableY(value));

	const commitInputX = () => {
		const parsed = Number(inputX);
		const next = Number.isFinite(parsed) && inputX.trim() !== '' ? clampMovableX(parsed) : movableX;
		setMovableX(next);
		setInputX(String(next));
	};
	const commitInputY = () => {
		const parsed = Number(inputY);
		const next = Number.isFinite(parsed) && inputY.trim() !== '' ? clampMovableY(parsed) : movableY;
		setMovableY(next);
		setInputY(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (可動点の x スライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const xSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) xSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setMovableX(INITIAL_MOVABLE[0]);
		setMovableY(INITIAL_MOVABLE[1]);
	};

	// 数学モデルによる計算。lib/math/statistics.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。
	const movablePoint: Point2 = [movableX, movableY];
	const allPoints: readonly Point2[] = [...FIXED_POINTS, movablePoint];
	const xs = allPoints.map((p) => p[0]);
	const ys = allPoints.map((p) => p[1]);

	const meanX = mean(xs);
	const meanY = mean(ys);
	const varX = variance(xs);
	const varY = variance(ys);
	const sdX = standardDeviation(xs);
	const sdY = standardDeviation(ys);
	const cov = covariance(xs, ys);
	const r = correlation(xs, ys); // number | null (全点xが同じ、または全点yが同じとき null)

	// 実行時検証: 分散の2定義 Σ(v−v̄)²/n(lib 実装)と E[v²]−v̄²(このファイルで独立に計算)が
	// 一致するかを突合する(MATH_CONVENTIONS §1: 丸めない内部値で判定し、表示のみ丸める)。
	const altVarianceX = independentMeanOfSquares(xs) - meanX * meanX;
	const altVarianceY = independentMeanOfSquares(ys) - meanY * meanY;
	const scaleVarX = Math.max(1, Math.abs(varX), Math.abs(altVarianceX));
	const scaleVarY = Math.max(1, Math.abs(varY), Math.abs(altVarianceY));
	const varianceDefinitionsMatch =
		approximatelyZero(varX - altVarianceX, scaleVarX) && approximatelyZero(varY - altVarianceY, scaleVarY);

	const predictionCorrect = prediction === 'bothChangeALot';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="data-analysis-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="data-analysis-exp-title">実験: 散布図の点を動かして平均・分散・相関係数の変化を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、散布図上の6個の点のうち1個を動かしながら、
					<strong>1個の点(外れ値)を大きく動かすだけで、平均点も相関係数も大きく変わりうること</strong>
					、そして<strong>全ての点のx座標(またはy座標)が同じになると相関係数は数学的に定義できなくなること</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 平均は
					x̄=(Σxᵢ)/n、分散は Σ(xᵢ−x̄)²/n、相関係数は共分散を標準偏差の積で割った値です。詳しくは下の
					「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の散布図には6個の点があります。そのうち色の違う1個だけが動かせます。
					<strong>操作する前に予想してください:</strong> その1個の点だけを大きく(遠くへ)動かすと、
					点全体の<strong>平均点</strong>と<strong>相関係数</strong>はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="data-analysis-prediction"
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

			{/* Scene は予想ゲートの前から常時表示する(独立レビュー GrokBuild Major: 予想の
			    本文が「下の散布図には6個の点があります」と図を参照しているのに、旧実装は
			    submitted 分岐の内側でしか Scene をマウントせず矛盾していた。既存単元
			    〔DotProduct 等〕と同じく図は常時・操作だけ interactive={submitted} でゲート)。 */}
			<div className={styles.scene}>
				<ScatterScene
					fixedPoints={FIXED_POINTS}
					movablePoint={movablePoint}
					meanPoint={[meanX, meanY]}
					interactive={submitted}
					onMovablePointChange={([x, y]) => {
						handleMovableXChange(x);
						handleMovableYChange(y);
					}}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、点を操作して平均・分散・相関係数の変化を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 可動点の x/y スライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="movable-x-number">可動点の x 座標</label>
							<input
								id="movable-x-slider"
								ref={xSliderRef}
								type="range"
								min={MOVABLE_X_MIN}
								max={MOVABLE_X_MAX}
								step={1}
								value={movableX}
								aria-label="可動点の x 座標(スライダー)"
								onChange={(e) => handleMovableXChange(Number(e.target.value))}
							/>
							<input
								id="movable-x-number"
								type="text"
								inputMode="numeric"
								aria-describedby="movable-x-range-hint"
								value={inputX}
								onChange={(e) => setInputX(e.target.value)}
								onBlur={commitInputX}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputX();
								}}
							/>
							<p id="movable-x-range-hint" className={styles.rangeHint}>
								x は {MOVABLE_X_MIN}〜{MOVABLE_X_MAX} の範囲で指定できます(整数に量子化されます)。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="movable-y-number">可動点の y 座標</label>
							<input
								id="movable-y-slider"
								type="range"
								min={MOVABLE_Y_MIN}
								max={MOVABLE_Y_MAX}
								step={1}
								value={movableY}
								aria-label="可動点の y 座標(スライダー)"
								onChange={(e) => handleMovableYChange(Number(e.target.value))}
							/>
							<input
								id="movable-y-number"
								type="text"
								inputMode="numeric"
								aria-describedby="movable-y-range-hint"
								value={inputY}
								onChange={(e) => setInputY(e.target.value)}
								onBlur={commitInputY}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputY();
								}}
							/>
							<p id="movable-y-range-hint" className={styles.rangeHint}>
								y は {MOVABLE_Y_MIN}〜{MOVABLE_Y_MAX} の範囲で指定できます(整数に量子化されます)。
							</p>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う(丸めない内部値で
					    判定し、表示のみ丸める)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">可動点</th>
									<td>
										({movableX}, {movableY})
									</td>
								</tr>
								<tr>
									<th scope="row">平均 x̄</th>
									<td>{round2(meanX)}</td>
								</tr>
								<tr>
									<th scope="row">平均 ȳ</th>
									<td>{round2(meanY)}</td>
								</tr>
								<tr>
									<th scope="row">分散(x)</th>
									<td>{round2(varX)}</td>
								</tr>
								<tr>
									<th scope="row">分散(y)</th>
									<td>{round2(varY)}</td>
								</tr>
								<tr>
									<th scope="row">標準偏差(x)</th>
									<td>{round2(sdX)}</td>
								</tr>
								<tr>
									<th scope="row">標準偏差(y)</th>
									<td>{round2(sdY)}</td>
								</tr>
								<tr>
									<th scope="row">共分散</th>
									<td>{round2(cov)}</td>
								</tr>
								<tr>
									<th scope="row">相関係数 r</th>
									<td>{r === null ? '定義されません' : round2(r)}</td>
								</tr>
							</tbody>
						</table>
						<p className={varianceDefinitionsMatch ? styles.statusHeld : styles.statusBroken}>
							{varianceDefinitionsMatch
								? `分散の2つの定義(Σ(v−v̄)²/n と E[v²]−v̄²)は、x・yのどちらでも一致しています。`
								: '分散の2つの定義が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						{r === null ? (
							<p className={styles.statusNeutral}>
								すべての点の x 座標(または y 座標)が同じ値になっているため、相関係数は数学的に定義できません
								(点が縦一直線または横一直線に並んだ状態です。「直線的な関係の強さ」を測ろうにも、片方の変数が
								まったく変化していないので比べようがありません)。可動点を動かして、他の点と x 座標がずれる位置へ戻すと
								相関係数が再び計算されます。
							</p>
						) : (
							<p className={styles.statusNeutral}>
								現在の相関係数は {round2(r)} です({r > 0 ? '正の相関(右上がりの傾向)' : r < 0 ? '負の相関(右下がりの傾向)' : '無相関に近い'})。
							</p>
						)}
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。'
								: '実は、点が1個であっても、平均も相関係数も大きく変わりえます。予想と見比べてみましょう。'}{' '}
							初期状態(可動点が ({INITIAL_MOVABLE[0]}, {INITIAL_MOVABLE[1]}))では平均 ȳ は{' '}
							{round2(INITIAL_MEAN_Y)}、相関係数は {round2(INITIAL_CORRELATION)} でした。今、可動点を ({movableX},{' '}
							{movableY}) へ動かした結果、平均 ȳ は {round2(meanY)}、相関係数は{' '}
							{r === null ? '定義されない状態' : round2(r)} になっています。
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 平均はすべてのデータの<strong>合計</strong>を個数で割った値なので、1個の点をどれだけ遠くへ
							動かしても、その変化量の 1/n(この場合は1/6)がそのまま平均に反映されます——他の5点が動かなくても、1個の
							極端な値だけで平均は大きく引っ張られます。相関係数も同様に、全6点が「1つの直線にどれだけ沿っているか」を
							測る量なので、1個の点が他の点の傾向から大きく外れると、その点1つのために全体の直線的な関係の強さ(や
							向き)が大きく変わってしまいます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「外れ値が混ざっていても、平均は集団を代表する値として常に適切だ」と考えてしまうことがあります。
							しかし上の観察表で確かめた通り、6個のうち5個の点がまったく動いていなくても、残り1個を大きく動かすだけで
							平均は大きく変わります。外れ値が含まれるデータでは、平均だけを見ていると集団の「典型的な」姿を見誤ることが
							あるため、散布図そのものを見て外れ値の有無を確認することが大切です。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DataAnalysisExperiment;
