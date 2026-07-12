import { useEffect, useRef, useState } from 'react';
import { evaluate, vertex, axisOfSymmetry } from '../../lib/math/quadraticFunction.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { QuadraticFunctionScene } from '../scenes/mafs/QuadraticFunctionScene.js';
import styles from './QuadraticFunctionExperiment.module.css';

// 二次関数(頂点形式) y=a(x-p)^2+q のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。LinearFunctionExperiment / InteractiveExperiment
// (三平方の定理) / DerivativeExperiment と同じ設計: 予想 (Prediction) → 操作
// (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を1つの島に収め、状態
// (a, p, q, prediction) をここに一元管理する。数学の計算は lib/math/quadraticFunction.ts の
// 純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。

const MIN_A = -3;
const MAX_A = 3;
const INITIAL_A = 1;
const STEP_A = 0.1;

const MIN_P = -4;
const MAX_P = 4;
const INITIAL_P = 2;
const STEP_P = 0.1;

const MIN_Q = -5;
const MAX_Q = 5;
const INITIAL_Q = -3;
const STEP_Q = 0.1;

// 「対称軸をはさんで対称な2点」の観察行に使う固定オフセット (p からの相対距離。
// a・p・q スライダーとは独立)。どちらの点でも評価値が一致することを示す(軸対称性の生きた確認)。
const SYMMETRY_OFFSET = 2;

type Prediction = 'narrows' | 'widens' | 'shifts';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'narrows', label: '開き方が狭くなり、より急な(とがった)グラフになる' },
	{ value: 'widens', label: '開き方が広くなり、より緩やかな(平べったい)グラフになる' },
	{ value: 'shifts', label: '開き方は変わらず、頂点の位置だけが動く' },
];

function clampA(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_A;
	return Math.min(MAX_A, Math.max(MIN_A, value));
}

function clampP(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_P;
	return Math.min(MAX_P, Math.max(MIN_P, value));
}

function clampQ(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_Q;
	return Math.min(MAX_Q, Math.max(MIN_Q, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function QuadraticFunctionExperiment() {
	const [a, setA] = useState(INITIAL_A);
	const [p, setP] = useState(INITIAL_P);
	const [q, setQ] = useState(INITIAL_Q);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (InteractiveExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(INITIAL_A));
	const [inputP, setInputP] = useState(String(INITIAL_P));
	const [inputQ, setInputQ] = useState(String(INITIAL_Q));

	// 状態の正規化 (clamp) はここに集約する。ドラッグ・スライダーはこのハンドラを通るため、
	// 入力経路によらず単一の真実の状態になる。
	const handleAChange = (value: number) => setA(clampA(value));
	const handlePChange = (value: number) => setP(clampP(value));
	const handleQChange = (value: number) => setQ(clampQ(value));

	const commitInputA = () => {
		const parsed = Number(inputA);
		const next = Number.isFinite(parsed) && inputA.trim() !== '' ? clampA(parsed) : a;
		setA(next);
		setInputA(String(round2(next)));
	};
	const commitInputP = () => {
		const parsed = Number(inputP);
		const next = Number.isFinite(parsed) && inputP.trim() !== '' ? clampP(parsed) : p;
		setP(next);
		setInputP(String(round2(next)));
	};
	const commitInputQ = () => {
		const parsed = Number(inputQ);
		const next = Number.isFinite(parsed) && inputQ.trim() !== '' ? clampQ(parsed) : q;
		setQ(next);
		setInputQ(String(round2(next)));
	};

	// a/p/q が外部要因 (ドラッグ・スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputA(String(round2(a)));
	}, [a]);
	useEffect(() => {
		setInputP(String(round2(p)));
	}, [p]);
	useEffect(() => {
		setInputQ(String(round2(q)));
	}, [q]);

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
		setA(INITIAL_A);
		setP(INITIAL_P);
		setQ(INITIAL_Q);
	};

	// 数学モデル (lib/math/quadraticFunction.ts) による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。
	const [vertexX, vertexY] = vertex(a, p, q);
	const axis = axisOfSymmetry(a, p, q);
	// 頂点での評価値は、evaluate という独立した計算経路から求めても q と一致するはず
	// (頂点が極値であることの生きた確認)。
	const valueAtVertex = evaluate(a, p, q, p);
	const vertexValueMatches = approximatelyZero(
		valueAtVertex - q,
		Math.max(1, Math.abs(q)),
	);

	// 「対称軸をはさんで対称な2点」の観察: 固定オフセット (p からの相対距離) で評価し、
	// evaluate とは独立した箇所(対称性)から軸対称性を再確認する。
	const xLeft = p - SYMMETRY_OFFSET;
	const xRight = p + SYMMETRY_OFFSET;
	const yLeft = evaluate(a, p, q, xLeft);
	const yRight = evaluate(a, p, q, xRight);
	const symmetryHolds = approximatelyZero(yLeft - yRight, Math.max(1, Math.abs(yLeft), Math.abs(yRight)));

	// a=0 は「二次関数ではない」退化ケース(水平線 y=q)。頂点・対称軸の意味そのものが
	// 崩れるため、UI では専用の文言で区別する(linearFunction.ts の isHorizontal と同じ方針)。
	const isDegenerate = approximatelyZero(a, 1);
	let openDirectionText: string;
	if (isDegenerate) {
		openDirectionText = '現在 a=0 のため二次関数ではなく、水平な直線 y=q になっています。';
	} else if (a > 0) {
		openDirectionText = '下に凸(頂点が最小値)です。';
	} else {
		openDirectionText = '上に凸(頂点が最大値)です。';
	}

	const predictionCorrect = prediction === 'narrows';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="quadratic-function-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="quadratic-function-exp-title">実験: 頂点 (p, q) と開き a を動かす</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、二次関数
					y = a(x-p)² + q の頂点 (p, q) と開き方を決める a を動かしながら、
					<strong>
						a の絶対値が放物線の開き方(狭さ・急さ)を、(p, q) が放物線の位置(頂点の座標)を
						それぞれ独立に決めること
					</strong>
					を確かめられます。JavaScript が無効でも関係そのものは次の通りです: 二次関数
					y = a(x-p)² + q のグラフは、頂点 (p, q) を通り、直線 x=p を対称軸とする放物線です。
					a &gt; 0 なら下に凸(頂点が最小値)、a &lt; 0 なら上に凸(頂点が最大値)になります。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の放物線は y = a(x-p)² + q の形で表され、頂点 (p, q) と開き a を自由に変えられます。
					<strong>操作する前に予想してください:</strong> 頂点の位置 (p, q) は変えずに、a の絶対値を
					大きくする(例: 1 から 3 へ)と、放物線の開き方はどう変わるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="quadratic-function-prediction"
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
				<QuadraticFunctionScene
					a={a}
					p={p}
					q={q}
					minA={MIN_A}
					maxA={MAX_A}
					minP={MIN_P}
					maxP={MAX_P}
					minQ={MIN_Q}
					maxQ={MAX_Q}
					interactive={submitted}
					onAChange={handleAChange}
					onPChange={handlePChange}
					onQChange={handleQChange}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、a・p・q を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="a-number">開き a</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="a-slider"
								ref={aSliderRef}
								type="range"
								min={MIN_A}
								max={MAX_A}
								step={STEP_A}
								value={a}
								aria-label="開き a(スライダー)"
								onChange={(e) => handleAChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。 */}
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
						<div className={styles.control}>
							<label htmlFor="p-number">頂点の x 座標 p</label>
							<input
								id="p-slider"
								type="range"
								min={MIN_P}
								max={MAX_P}
								step={STEP_P}
								value={p}
								aria-label="頂点の x 座標 p(スライダー)"
								onChange={(e) => handlePChange(Number(e.target.value))}
							/>
							<input
								id="p-number"
								type="text"
								inputMode="decimal"
								aria-describedby="p-range-hint"
								value={inputP}
								onChange={(e) => setInputP(e.target.value)}
								onBlur={commitInputP}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputP();
								}}
							/>
						</div>
						<div className={styles.control}>
							<label htmlFor="q-number">頂点の y 座標 q</label>
							<input
								id="q-slider"
								type="range"
								min={MIN_Q}
								max={MAX_Q}
								step={STEP_Q}
								value={q}
								aria-label="頂点の y 座標 q(スライダー)"
								onChange={(e) => handleQChange(Number(e.target.value))}
							/>
							<input
								id="q-number"
								type="text"
								inputMode="decimal"
								aria-describedby="q-range-hint"
								value={inputQ}
								onChange={(e) => setInputQ(e.target.value)}
								onBlur={commitInputQ}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputQ();
								}}
							/>
						</div>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="a-range-hint" className={styles.rangeHint}>
							a は {MIN_A}〜{MAX_A} の範囲で指定できます。
						</p>
						<p id="p-range-hint" className={styles.rangeHint}>
							p は {MIN_P}〜{MAX_P} の範囲で指定できます。
						</p>
						<p id="q-range-hint" className={styles.rangeHint}>
							q は {MIN_Q}〜{MAX_Q} の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 現在値と、独立した計算経路 (evaluate) による頂点・対称性確認の
					    ライブ表示。丸め前の内部値で判定し、表示のみ丸める (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">開き a</th>
									<td>{round2(a)}</td>
								</tr>
								<tr>
									<th scope="row">頂点の x 座標 p</th>
									<td>{round2(p)}</td>
								</tr>
								<tr>
									<th scope="row">頂点の y 座標 q</th>
									<td>{round2(q)}</td>
								</tr>
								<tr>
									<th scope="row">頂点の座標</th>
									<td>
										({round2(vertexX)}, {round2(vertexY)})
									</td>
								</tr>
								<tr>
									<th scope="row">対称軸</th>
									<td>x = {round2(axis)}</td>
								</tr>
								<tr>
									<th scope="row">x=p での評価値(頂点の y と比較)</th>
									<td>{round2(valueAtVertex)}</td>
								</tr>
								<tr>
									<th scope="row">
										対称な2点 (x={round2(xLeft)}, x={round2(xRight)}) での値
									</th>
									<td>
										{round2(yLeft)} / {round2(yRight)}
									</td>
								</tr>
							</tbody>
						</table>
						<p className={vertexValueMatches ? styles.statusHeld : styles.statusBroken}>
							{vertexValueMatches
								? 'x=p での評価値は頂点の y 座標 q と一致します。'
								: 'この状態では x=p での評価値が頂点の y 座標 q と一致していません。'}
						</p>
						<p className={symmetryHolds ? styles.statusHeld : styles.statusBroken}>
							{symmetryHolds
								? '対称軸をはさんだ対称な2点は、同じ値になります。'
								: 'この状態では対称な2点の値が一致していません。'}
						</p>
						<p>{openDirectionText}</p>
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
								? '実際、a の絶対値を大きくすると放物線の開き方は狭くなり、より急なグラフになります——頂点 (p, q) の位置は a を変えても動きません。'
								: '実際に a の絶対値を大きくしてみると、放物線の開き方は狭くなり、より急なグラフになります。頂点 (p, q) の位置は a を変えても動きません。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: y = a(x-p)² + q で x=p を代入すると (x-p)² = 0 になるため、a の値に
							関係なく頂点の y 座標は常に q になります。一方 a は「頂点からどれだけ離れると
							y がどれだけ増減するか」を表す係数なので、|a| が大きいほど頂点から少し離れただけで
							y が急に変化し、グラフは狭く・急になります。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default QuadraticFunctionExperiment;
