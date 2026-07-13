import { useEffect, useRef, useState } from 'react';
import { discriminant, realRoots, evaluateStandard } from '../../lib/math/quadraticEquation.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { QuadraticEquationScene } from '../scenes/mafs/QuadraticEquationScene.js';
import styles from './QuadraticEquationExperiment.module.css';

// 「二次方程式と判別式」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。LinearTransformationExperiment / QuadraticFunctionExperiment と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態
// (a,b,c,prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/quadraticEquation.ts の
// 純粋関数へ委譲し、この層は描画・入力同期・実行時検証(解を代入すると0に戻ること)・提示に徹する。
//
// 中核体験: 放物線 y=ax^2+bx+c を上下に動かす(c を変える)と、x軸との交点の個数(2/1/0)が
// 判別式 D=b^2-4ac の符号(正/ゼロ/負)と完全に対応することを発見する。

// a は0を跨がない範囲に構造的に制約する(RangeError になる a=0 が UI から到達不能になるように、
// タスク厳守事項)。1刻みの整数のみを許可し [1,3] に収めるため、a が0になることはない。
const MIN_A = 1;
const MAX_A = 3;
const STEP_A = 1;
const INITIAL_A = 1;

const MIN_B = -6;
const MAX_B = 6;
const STEP_B = 1;
const INITIAL_B = -4;

const MIN_C = -6;
const MAX_C = 6;
const STEP_C = 1;
const INITIAL_C = 3;

// 初期値 (a=1,b=-4,c=3) は D=16-12=4>0 → 解は {1,3} (交点2個)。c を増やしていくと
// c=4 で D=0 (接する、交点1個)、c=5 で D=-4<0 (交点0個) になる、きれいな整数の物語。

type Prediction = 'decreases' | 'unchanged' | 'increases';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{
		value: 'decreases',
		label: '放物線を上へ動かす(c を大きくする)と、x軸との交点の個数は2個→1個→0個と減っていく',
	},
	{ value: 'unchanged', label: '放物線を上下に動かしても、x軸との交点の個数は変わらない' },
	{ value: 'increases', label: '放物線を上へ動かすと、x軸との交点の個数はむしろ増えていく' },
];

function clamp(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

export function QuadraticEquationExperiment() {
	const [a, setA] = useState(INITIAL_A);
	const [b, setB] = useState(INITIAL_B);
	const [c, setC] = useState(INITIAL_C);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (LinearTransformationExperiment と
	// 同じ理由: 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(a));
	const [inputB, setInputB] = useState(String(b));
	const [inputC, setInputC] = useState(String(c));

	useEffect(() => setInputA(String(round2(a))), [a]);
	useEffect(() => setInputB(String(round2(b))), [b]);
	useEffect(() => setInputC(String(round2(c))), [c]);

	function makeCommit(
		input: string,
		setValue: (v: number) => void,
		setInput: (v: string) => void,
		current: number,
		min: number,
		max: number,
		step: number,
	) {
		return () => {
			const parsed = Number(input);
			const next =
				Number.isFinite(parsed) && input.trim() !== ''
					? clamp(Math.round(parsed / step) * step, min, max, current)
					: current;
			setValue(next);
			setInput(String(round2(next)));
		};
	}

	const commitA = makeCommit(inputA, setA, setInputA, a, MIN_A, MAX_A, STEP_A);
	const commitB = makeCommit(inputB, setB, setInputB, b, MIN_B, MAX_B, STEP_B);
	const commitC = makeCommit(inputC, setC, setInputC, c, MIN_C, MAX_C, STEP_C);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a のスライダー)へフォーカスを移す(先行単元と同じ配慮)。
	const sliderARef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) sliderARef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setA(INITIAL_A);
		setB(INITIAL_B);
		setC(INITIAL_C);
	};

	// 数学モデル(lib/math/quadraticEquation.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。重複実装しない(タスク厳守事項): discriminant・realRoots・
	// evaluateStandard をそのまま再利用する。
	const d = discriminant(a, b, c);
	const roots = realRoots(a, b, c);

	// 実行時検証: 返った解を evaluateStandard (completeSquare を経由しない独立した多項式評価)に
	// 代入すると0に戻ることを確かめる(この単元の中核となる非自己確認的な検証、C-7)。
	const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
	const rootsVerified = roots.every((root) =>
		approximatelyZero(evaluateStandard(a, b, c, root), scale),
	);

	// 分類は判別式の符号を exact zero で行う(quadraticEquation.ts の realRoots と同じ根拠:
	// D は「数学的結果を丸めない」契約の量であり、連続量の近傍表示とは違う分類境界に
	// epsilon 幅を持ち込まない。M3 eigen.ts の discriminant<0/===0/>0 分岐と同じ方針)。
	const intersectionLabel =
		d > 0 ? '2個(異なる2つの実数解)' : d === 0 ? '1個(重解)' : '0個(実数の範囲に解はない)';
	const rootsLabel = roots.length === 0 ? 'なし' : roots.map((r) => formatSigned(r)).join(', ');

	const predictionCorrect = prediction === 'decreases';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="quadeq-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="quadeq-exp-title">実験: 放物線を上下に動かして交点の個数を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、二次方程式
					ax²+bx+c=0 の係数 a, b, c を動かしながら、放物線とx軸との交点の個数が変わる様子を
					観察できます。JavaScript が無効でも要点は次の通りです: 交点の個数(2個・1個・0個)は
					判別式 D=b²−4ac の符号(正・ゼロ・負)と完全に対応します。詳しくは下の「形式的な定義」を
					参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、放物線 y=ax²+bx+c とx軸を表しています。
					<strong>操作する前に予想してください:</strong>{' '}
					放物線を上へ動かす(y切片 c を大きくする)と、x軸との交点の個数はどう変わるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="quadeq-prediction"
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

			{/* Scene: Tier 1 図解(放物線+x軸+交点マーカー) */}
			<div className={styles.scene}>
				<QuadraticEquationScene
					a={a}
					b={b}
					c={c}
					minC={MIN_C}
					maxC={MAX_C}
					interactive={submitted}
					onCChange={(value) => setC(clamp(value, MIN_C, MAX_C, c))}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、係数を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: a,b,c それぞれのスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="quadeq-a-number">係数 a</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="quadeq-a-slider"
								ref={sliderARef}
								type="range"
								min={MIN_A}
								max={MAX_A}
								step={STEP_A}
								value={a}
								aria-label="係数 a(スライダー)"
								onChange={(e) => setA(Number(e.target.value))}
							/>
							<input
								id="quadeq-a-number"
								type="text"
								inputMode="decimal"
								value={inputA}
								onChange={(e) => setInputA(e.target.value)}
								onBlur={commitA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitA();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="quadeq-b-number">係数 b</label>
							<input
								id="quadeq-b-slider"
								type="range"
								min={MIN_B}
								max={MAX_B}
								step={STEP_B}
								value={b}
								aria-label="係数 b(スライダー)"
								onChange={(e) => setB(Number(e.target.value))}
							/>
							<input
								id="quadeq-b-number"
								type="text"
								inputMode="decimal"
								value={inputB}
								onChange={(e) => setInputB(e.target.value)}
								onBlur={commitB}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitB();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="quadeq-c-number">係数 c(y切片)</label>
							<input
								id="quadeq-c-slider"
								type="range"
								min={MIN_C}
								max={MAX_C}
								step={STEP_C}
								value={c}
								aria-label="係数 c(スライダー)"
								onChange={(e) => setC(Number(e.target.value))}
							/>
							<input
								id="quadeq-c-number"
								type="text"
								inputMode="decimal"
								value={inputC}
								onChange={(e) => setInputC(e.target.value)}
								onBlur={commitC}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitC();
								}}
							/>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							a は {MIN_A}〜{MAX_A}(0にはなりません)、b・c は {MIN_B}〜{MAX_B} の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 判別式・交点の個数・解の値のライブ表示。丸め前の内部値で判定し、
					    表示のみ丸める(MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは
					    下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">判別式 D(=b²−4ac)</th>
									<td>{formatSigned(d)}</td>
								</tr>
								<tr>
									<th scope="row">x軸との交点の個数</th>
									<td>{intersectionLabel}</td>
								</tr>
								<tr>
									<th scope="row">解の値</th>
									<td>{rootsLabel}</td>
								</tr>
							</tbody>
						</table>
						{roots.length > 0 ? (
							<p className={rootsVerified ? styles.statusHeld : styles.statusBroken}>
								{rootsVerified
									? `解(${rootsLabel})を ax²+bx+c に代入すると、確かに0に戻ることを確認しました。`
									: '解を代入しても0に戻りません。数学モデルに問題がある可能性があります。'}
							</p>
						) : (
							<p className={styles.statusNeutral}>
								実数の範囲に解はないため、代入して確かめる解がありません——放物線はx軸と交わらない
								位置にあります。
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
								? 'その通りです。放物線を上へ動かす(c を大きくする)と、交点の個数は2個→1個→0個と減っていきます。'
								: '実は、放物線を上へ動かす(c を大きくする)と、交点の個数は2個→1個→0個と減っていきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 判別式 D=b²−4ac は解の公式 x=(−b±√D)/(2a) の√の中身です。
							D&gt;0 なら√D は実数として存在し、異なる2つの解(交点)が得られます。D=0 なら
							√D=0 で解は1つ(放物線がx軸にちょうど接する)。D&lt;0 なら実数の範囲で√D が
							存在せず、実数の解はありません(放物線はx軸と交わりません)。上の観察表でDの符号と
							交点の個数が常に対応することを確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「D&lt;0 なら方程式が間違っている」「解がない」と考えたくなるかも
							しれません。しかし D&lt;0 は方程式の誤りではなく、
							<strong>実数の範囲に解がないだけ</strong>です。放物線自体はグラフとしてちゃんと
							存在し、ただx軸と交わらない位置にあるという状態です。c を減らして放物線を下へ
							動かすと、再びx軸と交わる(D が0以上に戻る)様子を確かめてみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default QuadraticEquationExperiment;
