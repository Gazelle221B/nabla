import { useEffect, useRef, useState } from 'react';
import {
	exactValue,
	maclaurinCoefficient,
	maclaurinPartialSum,
	type MaclaurinFunction,
} from '../../lib/math/maclaurin.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { TaylorScene } from '../scenes/mafs/TaylorScene.js';
import styles from './TaylorApproximationExperiment.module.css';

// 「テイラー展開による近似」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。DerivativeFunctionExperiment / M2
// derivative-tangent-line と同じ設計(予想 → 操作 → 観察 → 確認)を1つの島に収め、状態
// (functionId, degree, x, prediction)をここに一元管理する。数学の計算は
// lib/math/maclaurin.ts の純粋関数へ委譲する(重複実装しない、タスク厳守事項)。
//
// この単元の中核体験: 接線(1次近似)の考え方を延長し、近似多項式 P_n(x) の次数 n を
// 上げていくと、曲線 f(x) にどこまで寄り添えるかを発見する。sin/cos/exp は収束半径が
// 無限大だが、log1p(x)=ln(1+x) は収束半径1しか持たないため、x>1 では次数を上げるほど
// かえって誤差が拡大する——「次数を上げれば、どんな関数でも、どんな x でも
// いくらでも良く近似できる」という素朴な予想が破綻する反例を、関数切替1つで体験できる。

type Prediction = 'everywhere' | 'nearZeroOnly' | 'worsensSometimes';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'everywhere', label: 'x の値によらず、どこでも真の値にどんどん近づいていく' },
	{ value: 'nearZeroOnly', label: 'x=0 の近くでだけ近づき、0から離れた x ではあまり改善しない' },
	{ value: 'worsensSometimes', label: '関数や x によっては、次数を上げてもかえって誤差が大きくなることがある' },
];

interface FunctionConfig {
	readonly id: MaclaurinFunction;
	/** 記事本文・観察テーブル・関数選択に出す表示ラベル */
	readonly label: string;
	readonly xMin: number;
	readonly xMax: number;
	readonly initialX: number;
	readonly yMin: number;
	readonly yMax: number;
}

// 関数は sin/cos/exp/log1p の4種(rule of three を超えるが、この単元の核心である
// 「収束半径」の対比(無限大 vs 有限)を体験するには最低2種の対比が必要で、加えて
// sin/cos の対称性(導関数関係)も見せたいため4種とする——DESIGN.mdの「過剰な汎用DSLを
// 先行設計しない」原則には反しない:4種とも同じ係数配列という1つの表現(マクローリン係数
// の切替のみ)で扱っており、任意関数を扱えるDSLではない)。
//
// x の可動範囲: sin/cos/exp は収束半径が無限大なので、体験として十分に真の曲線から
// 離れられる [-4, 4] とする。log1p は定義域が x>-1 のため、境界に十分近い -0.9 から
// (収束半径1を明確に超える)3 までとする(node で事前検算済み: x=3, degree=12 で
// 近似値は約-32493まで暴れるため、Scene 側の固定 yMin/yMax でその暴れを表示レンジの
// 外へクリップする——前例: SequenceLimitScene の RANGE_CAP)。
const FUNCTION_CONFIGS: Record<MaclaurinFunction, FunctionConfig> = {
	sin: {
		id: 'sin',
		label: 'f(x) = sin x',
		xMin: -4,
		xMax: 4,
		initialX: 2,
		yMin: -3,
		yMax: 3,
	},
	cos: {
		id: 'cos',
		label: 'f(x) = cos x',
		xMin: -4,
		xMax: 4,
		initialX: 2,
		yMin: -3,
		yMax: 3,
	},
	exp: {
		id: 'exp',
		label: 'f(x) = eˣ',
		xMin: -4,
		xMax: 4,
		initialX: 2,
		// exp(4)≈54.6・exp(-4)≈0.018、degree0〜12での近似値の実測レンジ(node検算済み)は
		// 概ね[-5.7, 54.6]に収まるため、多少の余裕を持たせた固定レンジにする。
		yMin: -8,
		yMax: 60,
	},
	log1p: {
		id: 'log1p',
		label: 'f(x) = ln(1+x)',
		xMin: -0.9,
		xMax: 3,
		initialX: 0.5,
		// 真の曲線は ln(0.1)≈-2.30 〜 ln(4)≈1.39 の範囲に収まるが、近似多項式は
		// x>1(収束半径の外側)で次数を上げるほど大きく外れるため、その暴れは
		// この固定レンジの外へクリップされ、視覚的に「発散して画面外へ出ていく」ことが
		// 観察できる(上記コメント参照)。
		yMin: -6,
		yMax: 3,
	},
};

const DEFAULT_FUNCTION_ID: MaclaurinFunction = 'sin';
const X_STEP = 0.1;
const DEGREE_MIN = 0;
const DEGREE_MAX = 12;
const INITIAL_DEGREE = 1; // 接線(1次近似)から始める、というこの単元の導入と対応させる。

function clampX(config: FunctionConfig, value: number): number {
	if (!Number.isFinite(value)) return config.initialX;
	return Math.min(config.xMax, Math.max(config.xMin, value));
}

function clampDegree(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_DEGREE;
	// ドラッグ値を整数 step に量子化する(タスク厳守事項: 次数は必ず整数)。
	const rounded = Math.round(value);
	return Math.min(DEGREE_MAX, Math.max(DEGREE_MIN, rounded));
}

function round2(value: number): number {
	const rounded = Math.round(value * 100) / 100;
	return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 近似多項式 P_degree(x) を、maclaurinPartialSum(ライブラリ側、低次から1項ずつ足す
 * ループ加算)とは別の算法——高次から x を掛けながら畳み込むホーナー法——で
 * 独立に再計算する。evaluatePoly(derivativeFunction.ts)と同じアルゴリズムだが、
 * ここではマクローリン係数(maclaurinCoefficient)に対して適用する、この Island 層だけの
 * 検証用コード。C-7: maclaurinPartialSum がループ加算と仕様で決められているのは、この
 * ホーナー法によるクロスチェックが「同じ式へ戻すだけの自己確認」にならないようにする
 * ためでもある(2つの独立したコードパスで同じ多項式を評価し、突き合わせる)。
 */
function hornerPartialSum(fn: MaclaurinFunction, degree: number, x: number): number {
	let result = 0;
	for (let k = degree; k >= 0; k--) {
		result = result * x + maclaurinCoefficient(fn, k);
	}
	return result;
}

export function TaylorApproximationExperiment() {
	const [functionId, setFunctionId] = useState<MaclaurinFunction>(DEFAULT_FUNCTION_ID);
	const [degree, setDegree] = useState(INITIAL_DEGREE);
	const [x, setX] = useState(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialX);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const config = FUNCTION_CONFIGS[functionId];

	// 数値入力の編集途中の文字列を保持する表示用 state (DerivativeFunctionExperiment と
	// 同じ理由: 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の
	// 破壊を防ぐ)。
	const [inputX, setInputX] = useState(String(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialX));

	const handleXChange = (value: number) => setX(clampX(config, value));

	const commitInputX = () => {
		const parsed = Number(inputX);
		const next = Number.isFinite(parsed) && inputX.trim() !== '' ? clampX(config, parsed) : x;
		setX(next);
		setInputX(String(round2(next)));
	};

	// 関数切替: 現在の x を新しい関数の可動域へ再クランプする(境界・退化入力の回避:
	// 例えば sin の x=-4 は log1p の可動域 [-0.9, 3] の外なので、切替直後にそのまま
	// Scene へ渡すと可動点の制約とレンダリング結果が一時的に食い違う)。次数 degree は
	// 全関数で共通の可動域(0〜12)なので、関数切替では変更しない(同じ次数で複数の関数を
	// 見比べられるようにするため)。
	const handleFunctionChange = (nextId: MaclaurinFunction) => {
		const nextConfig = FUNCTION_CONFIGS[nextId];
		setFunctionId(nextId);
		setX((prev) => clampX(nextConfig, prev));
	};

	// x が外部要因 (ドラッグ・スライダー・リセット・関数切替) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputX(String(round2(x)));
	}, [x]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (関数選択の最初のラジオ)へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const functionRadioRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) functionRadioRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setFunctionId(DEFAULT_FUNCTION_ID);
		setDegree(INITIAL_DEGREE);
		setX(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialX);
	};

	// 数学モデルによる計算。丸めない内部値で誤差を判定する (MATH_CONVENTIONS §1)。
	const approx = maclaurinPartialSum(functionId, degree, x);
	const exact = exactValue(functionId, x);
	const absError = Math.abs(approx - exact);

	// 実行時検証(1、statusHeld/statusBroken): 近似値をホーナー法という独立した算法で
	// 再計算し、ライブラリのループ加算による結果と一致するかを確認する(C-7、上記コメント)。
	const approxViaHorner = hornerPartialSum(functionId, degree, x);
	const consistencyScale = Math.max(Math.abs(approx), Math.abs(approxViaHorner));
	const consistent = approximatelyZero(approx - approxViaHorner, consistencyScale);

	// 実行時の観察(2、statusNeutral、正誤判定ではない): 次数を1つ下げたときの誤差との
	// 実測比較。断言(必ず改善する 等)はせず、実際に計算した2つの誤差の値をそのまま報告する
	// (このスライダー位置・この x でその瞬間に成り立つ事実のみを述べる)。
	const previousDegreeError =
		degree > DEGREE_MIN ? Math.abs(maclaurinPartialSum(functionId, degree - 1, x) - exact) : null;

	const predictionCorrect = prediction === 'worsensSometimes';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="taylor-approximation-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="taylor-approximation-exp-title">実験: 次数を上げて、曲線にどこまで寄り添えるか</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、真の曲線
					f(x)(例: sin x)と、その近似多項式 P_n(x)(次数 n を変えられます)を重ねて表示し、
					次数を上げるほど近似がどう変化するかを観察できます。JavaScript が無効でも要点は
					次の通りです: sin・cos・指数関数 eˣ は次数を上げれば実数全体でいつか必ず真の値に
					近づきますが、対数関数 ln(1+x) は収束半径(|x|&lt;1)を超えると、次数を上げるほど
					かえって誤差が大きくなります。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は f(x) = sin x の真の曲線と、その1次近似 P₁(x)(接線そのものです)を示して
					います。<strong>操作する前に予想してください:</strong>{' '}
					近似多項式 P<sub>n</sub>(x) の次数 n をどんどん上げていくと、真の値 f(x)
					との近似はどうなっていくと思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="taylor-approximation-prediction"
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

			{/* Scene: 予想ゲートの外で常時マウントする(本文が「下の図は...示しています」と
			    図を参照するため、ProbabilityDistributionScene / SequenceLimitScene と同じ方針)。
			    予想確定前はドラッグ不可の静的表示。 */}
			<div className={styles.scene}>
				<TaylorScene
					fn={functionId}
					degree={degree}
					x={x}
					xMin={config.xMin}
					xMax={config.xMax}
					yMin={config.yMin}
					yMax={config.yMax}
					interactive={submitted}
					onXChange={handleXChange}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、次数 n・評価点 x・関数を操作して
					結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 関数切替 + 次数スライダー + x のスライダー + 数値入力 + 矢印キー +
					    リセット (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<fieldset className={styles.functionFieldset}>
						<legend>関数の選択</legend>
						{(Object.keys(FUNCTION_CONFIGS) as MaclaurinFunction[]).map((id, index) => (
							<label key={id} className={styles.functionOption}>
								<input
									ref={index === 0 ? functionRadioRef : undefined}
									type="radio"
									name="taylor-approximation-function-select"
									value={id}
									checked={functionId === id}
									onChange={() => handleFunctionChange(id)}
								/>
								{FUNCTION_CONFIGS[id].label}
							</label>
						))}
					</fieldset>

					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="degree-slider">近似の次数 n</label>
							<input
								id="degree-slider"
								type="range"
								min={DEGREE_MIN}
								max={DEGREE_MAX}
								step={1}
								value={degree}
								aria-label="近似の次数 n(スライダー)"
								onChange={(e) => setDegree(clampDegree(Number(e.target.value)))}
							/>
							<p className={styles.rangeHint}>
								n は {DEGREE_MIN}〜{DEGREE_MAX} の整数で指定できます(現在 n={degree})。
							</p>
						</div>

						<div className={styles.control}>
							<label htmlFor="x-number">評価点 x の位置</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="x-slider"
								type="range"
								min={config.xMin}
								max={config.xMax}
								step={X_STEP}
								value={x}
								aria-label="評価点 x の位置(スライダー)"
								onChange={(e) => handleXChange(Number(e.target.value))}
							/>
							<input
								id="x-number"
								type="text"
								inputMode="decimal"
								aria-describedby="x-range-hint"
								value={inputX}
								onChange={(e) => setInputX(e.target.value)}
								onBlur={commitInputX}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputX();
								}}
							/>
							<p id="x-range-hint" className={styles.rangeHint}>
								x は {config.xMin}〜{config.xMax} の範囲で指定できます({config.label})。
							</p>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値(丸めのみ表示用、
					    MATH_CONVENTIONS §1)、検証文言はステータステキストのみに限定する。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">関数</th>
									<td>{config.label}</td>
								</tr>
								<tr>
									<th scope="row">次数 n</th>
									<td>{degree}</td>
								</tr>
								<tr>
									<th scope="row">評価点 x</th>
									<td>{round2(x)}</td>
								</tr>
								<tr>
									<th scope="row">P{degree}(x)(近似値)</th>
									<td>{round2(approx)}</td>
								</tr>
								<tr>
									<th scope="row">真の値 f(x)</th>
									<td>{round2(exact)}</td>
								</tr>
								<tr>
									<th scope="row">|誤差|</th>
									<td>{round2(absError)}</td>
								</tr>
							</tbody>
						</table>

						<p className={consistent ? styles.statusHeld : styles.statusBroken}>
							{consistent
								? `P${degree}(x) の値は、ループ加算(ライブラリ側)とホーナー法(独立した算法)の両方で一致しています。`
								: 'ループ加算とホーナー法で計算した値が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						{previousDegreeError !== null && (
							<p className={styles.statusNeutral}>
								{`次数を n=${degree - 1} から n=${degree} に上げると、誤差は ${round2(previousDegreeError)} から ${round2(absError)} に変化しました。`}
								{/* 偶奇プラトーの注記(QA 指摘): sin は奇数次・cos は偶数次の項しか持たないため、
								    係数 0 の段では多項式が1つ下の次数とまったく同じになる。無言だと「動いていない
								    =バグ」と誤認しうるので、その状態のときだけ理由を添える(状態依存の事実のみ)。 */}
								{degree > DEGREE_MIN && maclaurinCoefficient(functionId, degree) === 0 && (
									<>
										{' '}
										{`(n=${degree} の項の係数は 0 なので、P${degree}(x) は P${degree - 1}(x) とまったく同じ多項式です。sin は奇数次、cos は偶数次の項だけを持つためです)`}
									</>
								)}
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
								? 'その通りです。sin・cos・eˣ は次数を上げれば実数全体でいつか必ず真の値に近づきますが、ln(1+x) は収束半径(|x|<1)を超えると、次数を上げるほどかえって誤差が大きくなります。'
								: '実は、sin・cos・eˣ は次数を上げれば実数全体でいつか必ず真の値に近づきますが、ln(1+x) は収束半径(|x|<1)を超えると、次数を上げるほどかえって誤差が大きくなります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: sin・cos・eˣ は「収束半径が無限大」の関数で、どんな x でも次数を
							上げ続ければ近似はいつか必ず真の値に近づきます。しかし ln(1+x) はマクローリン級数の
							収束半径がちょうど 1 しかありません。上の関数選択で「f(x) = ln(1+x)」に切り替え、
							評価点 x を 1 より大きい値(例: 1.5)にして次数を 4→8→12 と上げてみてください。
							|誤差| の欄が縮むのではなく、むしろ大きくなっていくのが観察できます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「多項式の次数を上げれば、どんな関数でも、どんな x でも
							いくらでも良く近似できる」と考えたくなるかもしれません。しかし上の観察が示す通り、
							これは収束半径を超えた場所では成り立ちません(ln(1+x) の x=1.5 での発散が
							その反例です)。次数を上げることが常に近似を改善するとは限らないのです。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default TaylorApproximationExperiment;
