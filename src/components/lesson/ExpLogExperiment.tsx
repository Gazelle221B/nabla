import { useEffect, useRef, useState } from 'react';
import { expBase, logBase } from '../../lib/math/expLog.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { ExpLogScene } from '../scenes/mafs/ExpLogScene.js';
import styles from './ExpLogExperiment.module.css';

// 「指数関数と対数関数」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。QuadraticEquationExperiment と同じ設計: 予想 → 操作
// (Scene + Controls) → 観察 → 確認 を1つの島に収め、状態 (a,t,prediction) をここに一元管理する
// (SSOT)。数学の計算は lib/math/expLog.ts の純粋関数へ委譲し、この層は描画・入力同期・
// 実行時検証(往復 log_a(a^t)≈t)・提示に徹する。
//
// 中核体験: 底 a を固定して指数関数 y=a^x のグラフを描くと、対数関数 y=log_a(x) のグラフは
// 常にそれを直線 y=x に関して鏡映したものになる。これは「a を何乗したら x になるか」という
// 逆の問い(log_a x の定義そのもの)から必然的に生じる関係であり、対応点 (t, a^t)↔(a^t, t) の
// 往復 a^(log_a x)=x / log_a(a^t)=t を観察することで確かめられる。

// a は1に近づかない範囲に構造的に制約する(logBase が RangeError になる a≈1 が UI から
// 到達不能になるように、タスク厳守事項)。0.1刻みで [1.2, 4] に収めるため、a が1になることはない。
const MIN_A = 1.2;
const MAX_A = 4;
const STEP_A = 0.1;
const INITIAL_A = 2;

// t は指数曲線上の対応点のパラメータ。a の最大値4でも a^t が大きくなりすぎない範囲に収める
// (viewBox が扱いやすい大きさに留まるよう ExpLogScene 側の動的計算と整合させる)。
const MIN_T = -2;
const MAX_T = 2;
const STEP_T = 0.1;
const INITIAL_T = 1;

// 初期値 (a=2, t=1) は a^t=2、log_2(2)=1 という、往復が一致することが一目でわかるきれいな例。

type Prediction = 'logMirror' | 'sameCurve' | 'reciprocalBase';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{
		value: 'logMirror',
		label: 'y=2^x のグラフを直線 y=x で折り返す(鏡映させる)と、y=log_2 x のグラフになる',
	},
	{ value: 'sameCurve', label: '折り返しても y=2^x のグラフのままで、形は変わらない' },
	{ value: 'reciprocalBase', label: '折り返すと y=(1/2)^x のグラフになる' },
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

export function ExpLogExperiment() {
	const [a, setA] = useState(INITIAL_A);
	const [t, setT] = useState(INITIAL_T);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (QuadraticEquationExperiment と
	// 同じ理由: 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(a));
	const [inputT, setInputT] = useState(String(t));

	useEffect(() => setInputA(String(round2(a))), [a]);
	useEffect(() => setInputT(String(round2(t))), [t]);

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
	const commitT = makeCommit(inputT, setT, setInputT, t, MIN_T, MAX_T, STEP_T);

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
		setT(INITIAL_T);
	};

	// 数学モデル(lib/math/expLog.ts)による計算。丸めない内部値で判定する(MATH_CONVENTIONS §1)。
	// 重複実装しない(タスク厳守事項): expBase・logBase をそのまま再利用する。
	const aToT = expBase(a, t);

	// 実行時検証: 往復 log_a(a^t) を計算し、元の t に戻ることを確かめる(この単元の中核となる
	// 非自己確認的な検証、C-7——「a を何乗したら a^t になるか」という逆の問いへの立ち返り)。
	const roundTrip = logBase(a, aToT);
	const scale = Math.max(1, Math.abs(t), Math.abs(a));
	const roundTripVerified = approximatelyZero(roundTrip - t, scale);

	const predictionCorrect = prediction === 'logMirror';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="explog-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="explog-exp-title">実験: 指数関数のグラフを折り返して対数関数のグラフを見つける</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、指数関数
					y=a^x のグラフと対数関数 y=log_a(x) のグラフを同時に表示しながら、底 a や対応点の
					パラメータ t を動かして両者の関係を観察できます。JavaScript が無効でも要点は次の
					通りです: y=log_a(x) のグラフは、常に y=a^x のグラフを直線 y=x に関して鏡映した
					ものになります。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、指数関数 y=a^x のグラフと直線 y=x を表しています。
					<strong>操作する前に予想してください:</strong> y=2^x のグラフを直線 y=x で折り返す
					(鏡映させる)と、どんなグラフになるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="explog-prediction"
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

			{/* Scene: Tier 1 図解(指数曲線+対数曲線+y=xの破線+対応点) */}
			<div className={styles.scene}>
				<ExpLogScene
					a={a}
					t={t}
					minT={MIN_T}
					maxT={MAX_T}
					stepT={STEP_T}
					interactive={submitted}
					onTChange={(value) => setT(clamp(Math.round(value / STEP_T) * STEP_T, MIN_T, MAX_T, t))}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、底 a や点 t を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: a, t それぞれのスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="explog-a-number">底 a</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="explog-a-slider"
								ref={sliderARef}
								type="range"
								min={MIN_A}
								max={MAX_A}
								step={STEP_A}
								value={a}
								aria-label="底 a(スライダー)"
								onChange={(e) => setA(Number(e.target.value))}
							/>
							<input
								id="explog-a-number"
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
							<label htmlFor="explog-t-number">対応点のパラメータ t</label>
							<input
								id="explog-t-slider"
								type="range"
								min={MIN_T}
								max={MAX_T}
								step={STEP_T}
								value={t}
								aria-label="対応点のパラメータ t(スライダー)"
								onChange={(e) => setT(Number(e.target.value))}
							/>
							<input
								id="explog-t-number"
								type="text"
								inputMode="decimal"
								value={inputT}
								onChange={(e) => setInputT(e.target.value)}
								onBlur={commitT}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitT();
								}}
							/>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							a は {MIN_A}〜{MAX_A}(1にはなりません)、t は {MIN_T}〜{MAX_T} の範囲で指定できます。
						</p>
					</div>

					{/* Observation: a^t・log_a(a^t)・往復の一致のライブ表示。丸め前の内部値で判定し、
					    表示のみ丸める(MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは
					    下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">パラメータ t</th>
									<td>{formatSigned(t)}</td>
								</tr>
								<tr>
									<th scope="row">a^t</th>
									<td>{formatSigned(aToT)}</td>
								</tr>
								<tr>
									<th scope="row">log_a(a^t)(往復)</th>
									<td>{formatSigned(roundTrip)}</td>
								</tr>
							</tbody>
						</table>
						<p className={roundTripVerified ? styles.statusHeld : styles.statusBroken}>
							{roundTripVerified
								? `a^t(=${formatSigned(aToT)})を対数 log_a に代入すると、確かに元の t(=${formatSigned(t)})に戻ることを確認しました。`
								: '往復しても元の t に戻りません。数学モデルに問題がある可能性があります。'}
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
								? 'その通りです。y=a^x のグラフを直線 y=x で折り返すと、y=log_a x のグラフになります。'
								: '実は、y=a^x のグラフを直線 y=x で折り返すと、y=log_a x のグラフになります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: y=a^x は「x を指定すると y=a^x が決まる」対応です。この式で
							x と y を入れ替えると x=a^y になり、これを y について解き直したものが
							y=log_a(x)(「a を何乗すると x になるか」という問いの答え)です。x と y を
							入れ替える操作は、グラフ上では直線 y=x に関して折り返すことに一致するため、
							y=log_a x のグラフは常に y=a^x のグラフの鏡映になります。上の観察表で、
							a^t を計算してから log_a で戻すと元の t に一致することも、この関係の
							数値的な裏付けです。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「log は掛け算や割り算の一種で、log_a(x) は a と x を何か演算した
							結果(例えば a÷x や x÷a)ではないか」と考えたくなるかもしれません。しかし
							log_a(x) は割り算ではなく、<strong>「a を何乗すると x になるか」を答える演算</strong>
							です。例えば log_2(8) は 8÷2 でも 2÷8 でもなく、「2を何乗すると8になるか」の
							答え(3)です。実験で a や t を動かして a^t と log_a(a^t) を見比べ、log が
							「指数の逆」であることを確かめてみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default ExpLogExperiment;
