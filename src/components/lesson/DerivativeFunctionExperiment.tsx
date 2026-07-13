import { useEffect, useRef, useState } from 'react';
import { differenceQuotient, derivativeAt } from '../../lib/math/derivative.js';
import { evaluatePoly, exactDerivativePoly, toDifferentiableFunction, type Polynomial } from '../../lib/math/derivativeFunction.js';
import { DerivativeFunctionScene } from '../scenes/mafs/DerivativeFunctionScene.js';
import styles from './DerivativeFunctionExperiment.module.css';

// 「導関数 — 微分係数から関数へ」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。DerivativeExperiment (M2、微分係数と接線) の
// 続きにあたり、同じ設計 (予想 → 操作 → 観察 → 確認) を1つの島に収め、状態
// (functionId, a, prediction) をここに一元管理する。数学の計算は
// lib/math/derivativeFunction.ts (係数規則) と lib/math/derivative.ts (差分商・微分係数、
// 既存モジュールを再利用) の純粋関数へ委譲する。
//
// この単元の中核体験: 点 a を動かすと接線の傾き f'(a) が変わり、その値を y とする点
// (a, f'(a)) が「別のグラフ (導関数のグラフ)」を描いていく。f(x)=x^2 なら f'(x)=2x
// (直線)、f(x)=x^3 なら f'(x)=3x^2 (放物線) になることを、関数を切り替えて確認できる。
//
// 関数は x^2 / x^3 の2種のみ (rule of three, DESIGN.md: 汎用 DSL を先行設計しない)。

type FunctionId = 'square' | 'cube';

interface FunctionConfig {
	readonly id: FunctionId;
	/** 記事本文・観察テーブルに出す表示ラベル */
	readonly label: string;
	readonly coeffs: Polynomial;
	readonly aMin: number;
	readonly aMax: number;
	readonly initialA: number;
	readonly fYMin: number;
	readonly fYMax: number;
	readonly derivativeYMin: number;
	readonly derivativeYMax: number;
	/**
	 * この関数の可動域全体での |f''(x)| の上界。差分商 (h=H_FIXED) と f'(a) の実行時検証
	 * (平均値定理の剰余 |secant - f'(a)| <= (|h|/2)*bound) に使う。
	 * f(x)=x^2 → f''=2 (定数)。f(x)=x^3 → f''=6x, |x|<=aMax → 6*aMax。
	 */
	readonly secondDerivativeBound: number;
}

const FUNCTION_CONFIGS: Record<FunctionId, FunctionConfig> = {
	square: {
		id: 'square',
		label: 'f(x) = x²',
		coeffs: [0, 0, 1],
		aMin: -2,
		aMax: 2,
		initialA: 1,
		fYMin: -0.5,
		fYMax: 4.5,
		derivativeYMin: -4.5,
		derivativeYMax: 4.5,
		secondDerivativeBound: 2,
	},
	cube: {
		id: 'cube',
		label: 'f(x) = x³',
		coeffs: [0, 0, 0, 1],
		aMin: -1.5,
		aMax: 1.5,
		initialA: 1,
		fYMin: -3.5,
		fYMax: 3.5,
		derivativeYMin: -0.5,
		derivativeYMax: 7,
		secondDerivativeBound: 9,
	},
};

const DEFAULT_FUNCTION_ID: FunctionId = 'square';
const STEP_A = 0.1;

// 差分商での実行時検証専用の固定 h (ユーザー操作対象ではない、内部定数)。
// derivative-tangent-line (M2) の isCloseToTangent と同じ理由: h→0 の収束は本質的に
// 近似であり、compare.ts の approximatelyZero (厳密な恒等式向けの EPSILON=1e-9) をそのまま
// 使うと「係数規則が正しくても常に不一致」になってしまう。代わりに、平均値定理の剰余
// |secant - f'(a)| <= (|h|/2)*|f''| の上界そのものを実行時に計算し、その上界内に収まって
// いるかを検証してから「一致」を表示する (断言せず実行時検証、不一致時は警告する設計)。
const H_FIXED = 1e-4;
const FLOATING_POINT_SLACK = 1e-9;

type Prediction = 'line' | 'parabola' | 'sameAsOriginal';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'line', label: '直線になる' },
	{ value: 'parabola', label: '放物線になる' },
	{ value: 'sameAsOriginal', label: 'f(x) 自身と同じ形(x²のまま)になる' },
];

function clampA(config: FunctionConfig, value: number): number {
	if (!Number.isFinite(value)) return config.initialA;
	return Math.min(config.aMax, Math.max(config.aMin, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function DerivativeFunctionExperiment() {
	const [functionId, setFunctionId] = useState<FunctionId>(DEFAULT_FUNCTION_ID);
	const [a, setA] = useState(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialA);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const config = FUNCTION_CONFIGS[functionId];

	// 数値入力の編集途中の文字列を保持する表示用 state (DerivativeExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialA));

	const handleAChange = (value: number) => setA(clampA(config, value));

	const commitInputA = () => {
		const parsed = Number(inputA);
		const next = Number.isFinite(parsed) && inputA.trim() !== '' ? clampA(config, parsed) : a;
		setA(next);
		setInputA(String(round2(next)));
	};

	// 関数切替: 現在の a を新しい関数の可動域へ再クランプする(境界・退化入力の回避:
	// 例えば x^2 の a=2 は x^3 の可動域 [-1.5, 1.5] の外なので、切替直後にそのまま
	// Scene へ渡すと可動点の制約とレンダリング結果が一時的に食い違う)。
	const handleFunctionChange = (nextId: FunctionId) => {
		const nextConfig = FUNCTION_CONFIGS[nextId];
		setFunctionId(nextId);
		setA((prev) => clampA(nextConfig, prev));
	};

	// a が外部要因 (ドラッグ・スライダー・リセット・関数切替) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputA(String(round2(a)));
	}, [a]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a のスライダー) へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const aSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) aSliderRef.current?.focus();
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
		setA(FUNCTION_CONFIGS[DEFAULT_FUNCTION_ID].initialA);
	};

	// 数学モデルによる計算。丸めない内部値で誤差を判定する (MATH_CONVENTIONS §1)。
	// derivativeFunction.ts の係数規則 (exactDerivativePoly) を derivative.ts の
	// DifferentiableFunction へ包み、differenceQuotient/derivativeAt という既存の
	// 独立実装をそのまま再利用する (重複実装しない, タスク厳守事項)。
	const diffFn = toDifferentiableFunction(config.coeffs);
	const derivCoeffs = exactDerivativePoly(config.coeffs);
	const fa = evaluatePoly(config.coeffs, a);
	const tangentSlope = derivativeAt(diffFn, a); // f'(a) (係数規則による厳密値)
	const secant = differenceQuotient(diffFn, a, H_FIXED); // 独立経路: 割線の傾き (h=H_FIXED)
	const gap = secant - tangentSlope;

	// 実行時検証: 断言せず、平均値定理の剰余の上界と比較してから「一致」を表示する
	// (不一致なら警告に切り替える。レビュー学習: 観察 UI は実行時検証してから表示)。
	const errorBound = (H_FIXED / 2) * config.secondDerivativeBound + FLOATING_POINT_SLACK;
	const derivativeVerified = Math.abs(gap) <= errorBound;

	const predictionCorrect = prediction === 'line';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="derivative-function-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="derivative-function-exp-title">実験: 接線の傾きを集めて導関数のグラフを作る</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、放物線
					f(x) = x² 上の点 a を動かしながら、
					<strong>
						各点での接線の傾き f&apos;(a) を集めていくと、それ自体が別のグラフ (導関数
						f&apos;(x) のグラフ) を描くこと
					</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 関数 f(x) の
					導関数 f&apos;(x) は、各点 x での微分係数 f&apos;(x) = lim(h→0) (f(x+h) −
					f(x)) / h を、x の関数として並べたものです。f(x) = x² の場合、f&apos;(x) = 2x
					(直線)になります。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は放物線 f(x) = x² 上の点 a と、そこでの接線を示しています。
					<strong>操作する前に予想してください:</strong> f(x) = x²
					の各点での接線の傾き(微分係数)を集めて、点 (a, f&apos;(a)) としてグラフに
					すると、どんな形になるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="derivative-function-prediction"
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

			{/* Scene: Tier 1 図解 (上段 f(x)+接線、下段 f'(x)+現在点)。予想確定前はドラッグ不可 */}
			<div className={styles.scene}>
				<DerivativeFunctionScene
					coeffs={config.coeffs}
					derivCoeffs={derivCoeffs}
					a={a}
					minA={config.aMin}
					maxA={config.aMax}
					fYMin={config.fYMin}
					fYMax={config.fYMax}
					derivativeYMin={config.derivativeYMin}
					derivativeYMax={config.derivativeYMax}
					tangentSlope={tangentSlope}
					interactive={submitted}
					onAChange={handleAChange}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、点 a を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 関数切替 + a のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<fieldset className={styles.functionFieldset}>
						<legend>関数の選択</legend>
						{(Object.keys(FUNCTION_CONFIGS) as FunctionId[]).map((id) => (
							<label key={id} className={styles.functionOption}>
								<input
									type="radio"
									name="derivative-function-select"
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
							<label htmlFor="a-number">接点 a の位置</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="a-slider"
								ref={aSliderRef}
								type="range"
								min={config.aMin}
								max={config.aMax}
								step={STEP_A}
								value={a}
								aria-label="接点 a の位置(スライダー)"
								onChange={(e) => handleAChange(Number(e.target.value))}
							/>
							<input
								id="a-number"
								type="text"
								inputMode="decimal"
								aria-describedby="a-range-hint"
								value={inputA}
								onChange={(e) => setInputA(e.target.value)}
								onBlur={commitInputA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputA();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="a-range-hint" className={styles.rangeHint}>
							a は {config.aMin}〜{config.aMax} の範囲で指定できます({FUNCTION_CONFIGS[functionId].label})。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">a</th>
									<td>{round2(a)}</td>
								</tr>
								<tr>
									<th scope="row">f(a)</th>
									<td>{round2(fa)}</td>
								</tr>
								<tr>
									<th scope="row">微分係数 f&apos;(a)(係数規則)</th>
									<td>{round2(tangentSlope)}</td>
								</tr>
								<tr>
									<th scope="row">差分商(h={H_FIXED}での近似値)</th>
									<td>{round2(secant)}</td>
								</tr>
								<tr>
									<th scope="row">差(差分商 − f&apos;(a))</th>
									<td>{derivativeVerified ? '≈ 0' : round2(gap)}</td>
								</tr>
							</tbody>
						</table>
						<p className={derivativeVerified ? styles.statusHeld : styles.statusBroken}>
							{derivativeVerified
								? `係数規則で求めた f'(a)(${round2(tangentSlope)})は、割線の傾き(差分商、h をとても小さくした近似値)と一致しています。`
								: '係数規則で求めた f\'(a) が、差分商による近似値と一致しません。数学モデルに問題がある可能性があります。'}
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
								? 'その通りです。f(x) = x² の各点での接線の傾き f\'(a) を集めると、f\'(x) = 2x という直線になります。'
								: '実は、f(x) = x² の各点での接線の傾き f\'(a) を集めると、f\'(x) = 2x という直線になります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 微分係数 f&apos;(a) は「点 a における接線の傾き」という
							1つの数値ですが、a を動かしながらこの値を集めていくと、a の関数として
							新しい対応関係——導関数 f&apos;(x)——ができあがります。上の関数を f(x) = x³
							に切り替えてみると、f&apos;(x) = 3x² という放物線になり、いつも直線になる
							わけではないことがわかります。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「f&apos;(x) は f(x) の一部で、同じグラフ上にある量だ」と
							考えたくなるかもしれません。しかし上の図の下段が示す通り、f&apos;(x) は
							f(x) とは<strong>別の関数・別のグラフ</strong>です(f(x) = x²
							は放物線ですが、f&apos;(x) = 2x は直線で、形も式もまったく違います)。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DerivativeFunctionExperiment;
