import { useEffect, useRef, useState } from 'react';
import { riemannSumLeft, exactIntegralPoly } from '../../lib/math/riemannSum.js';
import type { Polynomial } from '../../lib/math/derivativeFunction.js';
import { RiemannSumScene } from '../scenes/mafs/RiemannSumScene.js';
import styles from './DefiniteIntegralExperiment.module.css';

// 「定積分と面積」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。DerivativeFunctionExperiment (M6 前単元、導関数) の続きにあたり、
// 同じ設計 (予想 → 操作 → 観察 → 確認) を1つの島に収め、状態 (functionId, n, prediction) を
// ここに一元管理する。数学の計算は lib/math/riemannSum.ts (左端点リーマン和・係数規則による
// 厳密な定積分、既存モジュールを再利用) の純粋関数へ委譲する。
//
// この単元の中核体験: 区間 [0,1] を n 本の長方形で近似した合計面積 (左端点リーマン和) を、
// n を増やしながら観察すると、ある「きれいな値」(f(x)=x^2 なら 1/3) へ収束していくことを
// 発見する。関数は x^2 / x+1 の2種のみ (rule of three, DESIGN.md: 汎用 DSL を先行設計しない)。

type FunctionId = 'square' | 'linear';

interface FunctionConfig {
	readonly id: FunctionId;
	/** 記事本文・観察テーブルに出す表示ラベル */
	readonly label: string;
	readonly coeffs: Polynomial;
	readonly yMin: number;
	readonly yMax: number;
	/**
	 * 実行時検証 (左端点リーマン和の標準誤差上界 |riemannSumLeft - exactIntegralPoly| <=
	 * (upper-lower)^2 * max|f'| / (2n)) に使う、区間 [0,1] 全体での |f'| の上界。
	 * f(x)=x^2 → f'(x)=2x, |x|<=1 で max|f'|=2。f(x)=x+1 → f'(x)=1 (定数)。
	 * どちらも評価区間 [LOWER, UPPER]=[0,1] 全体を覆う値 (レビュー学習: 誤差上界の較正は
	 * 評価区間全体を覆うこと)。
	 */
	readonly maxAbsDerivativeBound: number;
}

const FUNCTION_CONFIGS: Record<FunctionId, FunctionConfig> = {
	square: {
		id: 'square',
		label: 'f(x) = x²',
		coeffs: [0, 0, 1],
		yMin: -0.15,
		yMax: 1.15,
		maxAbsDerivativeBound: 2,
	},
	linear: {
		id: 'linear',
		label: 'f(x) = x + 1',
		coeffs: [1, 1],
		yMin: -0.15,
		yMax: 2.15,
		maxAbsDerivativeBound: 1,
	},
};

const DEFAULT_FUNCTION_ID: FunctionId = 'square';

// この単元は積分区間 [0,1] に固定する (中核体験: この区間の「きれいな値」への収束が驚きの核)。
const LOWER = 0;
const UPPER = 1;

const N_MIN = 1;
const N_MAX = 64;
const INITIAL_N = 4;

const FLOATING_POINT_SLACK = 1e-9;

type Prediction = 'unbounded' | 'converges' | 'unchanged';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'unbounded', label: '限りなく大きくなる' },
	{ value: 'converges', label: 'ある一定の値に近づく' },
	{ value: 'unchanged', label: '変わらない' },
];

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	const rounded = Math.round(value);
	return Math.min(N_MAX, Math.max(N_MIN, rounded));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function DefiniteIntegralExperiment() {
	const [functionId, setFunctionId] = useState<FunctionId>(DEFAULT_FUNCTION_ID);
	const [n, setN] = useState(INITIAL_N);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const config = FUNCTION_CONFIGS[functionId];

	// 数値入力の編集途中の文字列を保持する表示用 state (DerivativeFunctionExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputN, setInputN] = useState(String(INITIAL_N));

	const handleNChange = (value: number) => setN(clampN(value));

	const commitInputN = () => {
		const parsed = Number(inputN);
		const next = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(next);
		setInputN(String(next));
	};

	const handleFunctionChange = (nextId: FunctionId) => {
		setFunctionId(nextId);
		// n の可動域 [N_MIN, N_MAX] は関数によらず共通なので再クランプは不要だが、
		// 表示文字列との同期は下の useEffect に任せる。
	};

	// n が外部要因 (スライダー・数値入力の確定・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputN(String(n));
	}, [n]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (n のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const nSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) nSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setFunctionId(DEFAULT_FUNCTION_ID);
		setN(INITIAL_N);
	};

	// 数学モデルによる計算。丸めない内部値で誤差を判定する (MATH_CONVENTIONS §1)。
	// riemannSumLeft (総和, 独立経路) と exactIntegralPoly (係数規則, 独立経路) という
	// lib/math/riemannSum.ts の2つの独立実装をそのまま再利用する (重複実装しない,
	// タスク厳守事項)。n の全域 (1〜64) ・関数切替直後のいずれでも例外を起こさない。
	const approx = riemannSumLeft(config.coeffs, LOWER, UPPER, n);
	const exact = exactIntegralPoly(config.coeffs, LOWER, UPPER);
	const diff = approx - exact;

	// 実行時検証: 断言せず、左端点リーマン和の標準誤差上界と比較してから「近づいている」を
	// 表示する (不一致なら警告に切り替える。レビュー学習: 観察 UI は実行時検証してから表示)。
	// 上界は評価区間 [LOWER, UPPER] 全体を覆う maxAbsDerivativeBound を使う。
	const errorBound = ((UPPER - LOWER) ** 2 * config.maxAbsDerivativeBound) / (2 * n) + FLOATING_POINT_SLACK;
	const convergenceVerified = Math.abs(diff) <= errorBound;

	const predictionCorrect = prediction === 'converges';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="definite-integral-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="definite-integral-exp-title">実験: 長方形の本数を増やして面積を近似する</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、放物線
					f(x) = x² の下、区間 [0, 1] の面積を n 本の長方形で近似しながら、
					<strong>n を増やしていくと合計面積が 1/3 という一定の値に近づいていくこと</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 区間 [0, 1] を
					n 等分し、各小区間の左端点での関数値を高さとする長方形 n 本の面積の合計(左端点
					リーマン和)を考えると、n を限りなく大きくしたときの極限が定積分
					∫₀¹ f(x) dx です。f(x) = x² の場合、∫₀¹ x² dx = 1/3 になります。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は放物線 f(x) = x² と、区間 [0, 1] の下を近似する n 本の長方形を示しています。
					<strong>操作する前に予想してください:</strong> 長方形の本数 n
					を増やしていくと、長方形の合計面積はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="definite-integral-prediction"
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

			{/* Scene: Tier 1 図解 (曲線 f(x) + n 本の長方形)。 */}
			<div className={styles.scene}>
				<RiemannSumScene
					coeffs={config.coeffs}
					lower={LOWER}
					upper={UPPER}
					n={n}
					yMin={config.yMin}
					yMax={config.yMax}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、長方形の本数 n
					を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 関数切替 + n のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<fieldset className={styles.functionFieldset}>
						<legend>関数の選択</legend>
						{(Object.keys(FUNCTION_CONFIGS) as FunctionId[]).map((id) => (
							<label key={id} className={styles.functionOption}>
								<input
									type="radio"
									name="definite-integral-function-select"
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
							<label htmlFor="n-number">長方形の本数 n</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="n-slider"
								ref={nSliderRef}
								type="range"
								min={N_MIN}
								max={N_MAX}
								step={1}
								value={n}
								aria-label="長方形の本数 n(スライダー)"
								onChange={(e) => handleNChange(Number(e.target.value))}
							/>
							<input
								id="n-number"
								type="text"
								inputMode="numeric"
								aria-describedby="n-range-hint"
								value={inputN}
								onChange={(e) => setInputN(e.target.value)}
								onBlur={commitInputN}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputN();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="n-range-hint" className={styles.rangeHint}>
							n は {N_MIN}〜{N_MAX} の範囲で指定できます({FUNCTION_CONFIGS[functionId].label}、区間 [0,
							1])。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">n(長方形の本数)</th>
									<td>{n}</td>
								</tr>
								<tr>
									<th scope="row">長方形の合計面積(左端点リーマン和)</th>
									<td>{round2(approx)}</td>
								</tr>
								<tr>
									<th scope="row">厳密な面積(定積分の値)</th>
									<td>{round2(exact)}</td>
								</tr>
								<tr>
									<th scope="row">差(合計面積 − 厳密な面積)</th>
									<td>{convergenceVerified ? '≈ 0' : round2(diff)}</td>
								</tr>
							</tbody>
						</table>
						<p className={convergenceVerified ? styles.statusHeld : styles.statusBroken}>
							{convergenceVerified
								? `n=${n} 本の長方形の合計面積(${round2(approx)})は、厳密な面積(${round2(exact)})との誤差が理論上の上界の範囲に収まっています。`
								: '長方形の合計面積が、理論上の誤差上界を超えて厳密な面積とずれています。数学モデルに問題がある可能性があります。'}
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
								? `その通りです。n を増やしていくと、長方形の合計面積は厳密な面積(${round2(exact)})という一定の値に近づいていきます。`
								: `実は、n を増やしていくと、長方形の合計面積は厳密な面積(${round2(exact)})という一定の値に近づいていきます。予想と見比べてみましょう。`}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 長方形1本1本は f(x) の値を「一定」とみなす近似なので、
							必ず誤差が生まれます。しかし n を増やすほど1本あたりの幅が狭くなり、その
							小区間の中で f(x) の値がほとんど変わらなくなるため、誤差の合計は小さくなって
							いきます。n の数値入力に大きな値(例えば 64)を入れて、合計面積が厳密な面積に
							近づく様子を確かめてみましょう。関数を f(x) = x + 1 に切り替えると、収束先の
							値が変わることも確認できます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「長方形で近似している以上、面積はどれだけ本数を増やしても
							近似のままで、正確な値には決してならない」と考えたくなるかもしれません。
							しかし n を限りなく大きくする(極限を取る)と、長方形の合計面積は厳密な面積と
							<strong>完全に一致</strong>します。これが定積分の意味であり、「近似の延長線上に
							厳密な値がある」という関係を上の観察が示しています。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DefiniteIntegralExperiment;
