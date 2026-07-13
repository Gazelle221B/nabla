import { useEffect, useRef, useState } from 'react';
import { fibonacci, naiveCallCount, memoizedComputationCount } from '../../lib/math/recurrence.js';
import { CallCountScene } from '../scenes/dom/CallCountScene.js';
import styles from './RecurrenceExperiment.module.css';

// 「漸化式と計算量 — 素朴な再帰の爆発とメモ化」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。CombinatoricsExperiment / LimitsSequencesExperiment
// と同じ設計: 予想 → 操作(Scene + Controls) → 観察 → 確認 を1つの島に収め、状態
// (n, prediction, submitted)をここに一元管理する(SSOT)。数学の計算は
// lib/math/recurrence.ts の純粋関数へ委譲し、この層は描画・入力同期・実行時検証
// (恒等式 C(n)=2・fib(n+1)−1 の突合)・提示に徹する。
//
// 中核体験: 「同じ fib(n) を求めるのに、計算のやり方(素朴な二重再帰 vs メモ化)によって
// 必要な計算回数が桁違いに変わる」ことを、n を動かして発見する。n を大きくするほど、
// 素朴な再帰の呼び出し回数(棒グラフ・対数スケール)が爆発的に伸びる一方、メモ化の計算回数
// は n+1 でしか増えない——この対比が「漸化式がアルゴリズムの効率を記述する」という
// 入口になる。

const N_MIN = 0;
const N_MAX = 30;
const INITIAL_N = 10;

type Prediction = 'about30' | 'about900' | 'over1million';

// 予想ゲートの質問: 「fib(30) を素朴な再帰で求めるとき、呼び出しは合計何回くらい必要か」
// (タスク仕様。正解は 2,692,537 回で「100万回を超える」が正しい)。この質問は固定の n=30
// についてであり、実験の n スライダー(既定10、確定後に0〜30を自由に動かせる)とは独立している
// ——予想確定前は n=30 の実際の値を見せない(スライダー自体が確定後にしか現れない)ことで
// 答えの先出しを防ぐ。
const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'about30', label: '30回くらい' },
	{ value: 'about900', label: '900回(30²)くらい' },
	{ value: 'over1million', label: '100万回を超える' },
];

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	return Math.min(N_MAX, Math.max(N_MIN, Math.round(value)));
}

// 表示専用の換算(MATH_CONVENTIONS.md §1: 内部値は丸めず、表示のみ丸める)。「1秒に100万回
// 計算できる計算機なら、現在の n の素朴な再帰の呼び出し回数に何秒かかるか」という、
// 現在の状態(n)だけから機械的に算出できる事実(状態依存であり、絶対言明ではない)。
function formatComputerSeconds(callCount: number): string {
	const seconds = callCount / 1_000_000;
	if (seconds < 0.001) return `約${Math.round(seconds * 1_000_000)}マイクロ秒`;
	if (seconds < 1) return `約${(seconds * 1000).toFixed(1)}ミリ秒`;
	return `約${seconds.toFixed(2)}秒`;
}

// 転用問題・予想ゲートの根拠となる n=30 の固定値(記事の予想ゲートの正解と対応)。
// スライダーの現在値には依存しない、単元の核心となる具体例として1度だけ計算する。
const NAIVE_CALLS_AT_30 = naiveCallCount(30);
const MEMOIZED_AT_30 = memoizedComputationCount(30);

export function RecurrenceExperiment() {
	const [n, setN] = useState(INITIAL_N);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (CombinatoricsExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputN, setInputN] = useState(String(INITIAL_N));
	useEffect(() => setInputN(String(n)), [n]);

	const handleNChange = (value: number) => setN(clampN(value));
	const commitInputN = () => {
		const parsed = Number(inputN);
		const next = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(next);
		setInputN(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (n のスライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const nSliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) nSliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => setN(INITIAL_N);

	// 数学モデルによる計算。lib/math/recurrence.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。n∈[0,30] は naiveCallCount の安全域(0〜75)・
	// fibonacci(n+1) の安全域(0〜78)のいずれにも十分収まるため、この範囲で例外は発生しない。
	const fibN = fibonacci(n);
	const naiveCalls = naiveCallCount(n);
	const memoizedCalls = memoizedComputationCount(n);

	// 実行時検証: 恒等式 C(n) = 2・fib(n+1) − 1 が実際に成り立つかを突き合わせる。
	// naiveCallCount(漸化式の直接反復)と fibonacci(独立実装)から組み立てた閉形式は
	// 完全に別の計算経路であり(recurrence.ts のコメント参照)、これは自己確認的な
	// 検証ではない(C-7)。整数演算のみなので厳密等価(===)で比較する。
	const identityHeld = naiveCalls === 2 * fibonacci(n + 1) - 1;

	const predictionCorrect = prediction === 'over1million';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="recurrence-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="recurrence-exp-title">実験: 素朴な再帰とメモ化で計算回数を比べる</h2>

			{/* JS 無効時のフォールバック (DOM 描画は React マウント後に行われるため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、n を変えながら
					fib(n) を求めるのに必要な計算の回数を、素朴な二重再帰とメモ化の2通りで比較できます。
					JavaScript が無効でも要点は次の通りです: fib(30) を素朴な再帰で求めると
					2,692,537回もの関数呼び出しが必要になりますが、メモ化(一度計算した値を使い回す)
					なら31回で済みます。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					fib(30) を素朴な再帰(定義 fib(n)=fib(n−1)+fib(n−2) をそのまま関数呼び出しにする
					方法)で求めるとします。<strong>操作する前に予想してください:</strong> 関数の呼び出しは
					合計で何回くらい必要になるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="recurrence-prediction"
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

			{/* Scene は予想ゲートの前から常時表示する(SequenceLimitScene / TaylorScene と同じ方針:
			    本文が図を参照するため矛盾を避ける)。ただしメモ化の棒と実数値ラベルはこの単元の
			    「答え」を構成する表示なので、予想確定まで隠す(CallCountScene 内部のコメント参照)。
			    確定前は n=10(既定値)で固定し、n=30 についての予想の答えを先出ししない。 */}
			<div className={styles.scene}>
				<CallCountScene naiveCalls={naiveCalls} memoizedCalls={memoizedCalls} revealed={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、n を0から30まで操作して、
					素朴な再帰の呼び出し回数とメモ化の計算回数を実際に比較できます。
				</p>
			) : (
				<>
					{/* Controls: n のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="n-number">n(fib(n) を求める項番号)</label>
							<input
								id="n-slider"
								ref={nSliderRef}
								type="range"
								min={N_MIN}
								max={N_MAX}
								step={1}
								value={n}
								aria-label="n(fib(n) を求める項番号)(スライダー)"
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
							<p id="n-range-hint" className={styles.rangeHint}>
								n は {N_MIN}〜{N_MAX} の範囲で指定できます。
							</p>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う(このモデルは
					    整数演算のみで丸め自体が発生しない)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">n</th>
									<td>{n}</td>
								</tr>
								<tr>
									<th scope="row">fib(n)</th>
									<td>{fibN}</td>
								</tr>
								<tr>
									<th scope="row">素朴な再帰の呼び出し回数</th>
									<td>{naiveCalls}</td>
								</tr>
								<tr>
									<th scope="row">メモ化の計算回数</th>
									<td>{memoizedCalls}</td>
								</tr>
							</tbody>
						</table>
						<p className={styles.referenceNote}>
							参考: 1秒に100万回計算できる計算機だとすると、素朴な再帰の呼び出し{naiveCalls}回には
							{formatComputerSeconds(naiveCalls)}かかる計算になります(現在の n={n}
							の値から算出した参考換算で、常にこうなるという意味ではありません)。
						</p>
						<p className={identityHeld ? styles.statusHeld : styles.statusBroken}>
							{identityHeld
								? `素朴な再帰の呼び出し回数(${naiveCalls})は、恒等式 2・fib(n+1)−1(=${2 * fibonacci(n + 1) - 1}) と一致しています。`
								: '素朴な再帰の呼び出し回数が恒等式 2・fib(n+1)−1 と一致しません。数学モデルに問題がある可能性があります。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認)。予想の質問は固定の n=30 に
					    ついてだったので、ここでは現在のスライダー位置ではなく n=30 の固定値
					    (モジュール先頭で1度だけ計算済み)と比較する。 */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect ? 'その通りです。' : '予想と見比べてみましょう。'} fib(30)
							を素朴な再帰で求めると、実際には
							<strong>{`${NAIVE_CALLS_AT_30.toLocaleString('ja-JP')}回`}</strong>もの関数呼び出しが
							必要になります(メモ化なら{MEMOIZED_AT_30}回で済みます)。
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 素朴な再帰は fib(n) を求めるたびに fib(n−1) と fib(n−2)
							をそれぞれ独立に(定義通り)再計算します。fib(n−1) の呼び出し木の中にも
							fib(n−2) の呼び出し木の中にも、fib(n−3) や fib(n−4) のような同じ部分問題が
							何度も重複して現れ、その重複は n が大きくなるほど指数的に増えていきます。
							一方メモ化は「一度計算した fib(k) の値はキャッシュに保存し、2回目以降は
							計算し直さず読み出すだけ」にするので、fib(0)からfib(n)までの各値をちょうど
							1回ずつ計算するだけで済みます(計算回数はn+1)。上の n のスライダーを動かして、
							素朴な再帰の棒(対数スケール)がどれだけ急に伸びるか、メモ化の棒がどれだけ
							ゆっくりとしか伸びないかを見比べてみましょう。
						</p>
						<p className={styles.narration}>
							よくある誤解:「同じ答えを出す計算なら、やり方が違っても手間は大差ない」と
							考えたくなるかもしれません。しかし fib(30) の場合、素朴な再帰は
							2,692,537回、メモ化はわずか31回で、その差はおよそ8.7万倍にもなります。
							同じ数学的な定義(漸化式)から出発しても、それをどう計算に落とし込むか
							(計算のやり方)によって、必要な手間は桁違いに変わり得ます。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default RecurrenceExperiment;
