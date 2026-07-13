import { useEffect, useRef, useState } from 'react';
import {
	permutations,
	combinations,
	factorial,
	enumeratePermutations,
	enumerateCombinations,
} from '../../lib/math/combinatorics.js';
import { CombinatoricsEnumerationScene } from '../scenes/dom/CombinatoricsEnumerationScene.js';
import styles from './CombinatoricsExperiment.module.css';

// 「場合の数 — 順列と組合せ」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。ProbabilityExperiment / QuadraticEquationExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(n, r, mode, prediction)を
// ここに一元管理する(SSOT)。数学の計算は lib/math/combinatorics.ts の純粋関数へ委譲し、
// この層は描画・入力同期・実行時検証(列挙の個数===公式の値)・提示に徹する。
//
// 中核体験: n 個(既定4人)から r 個(既定2人)を「並べる」(順列 nPr)のと「選ぶだけ」
// (組合せ nCr)の違いを、実際の列挙(一覧)の可視化で発見する。nPr = nCr × r!(選んでから
// 並べる)という関係が中核であり、n・r を動かすと列挙数が変わり、公式の値と実際に数え上げた
// 個数が一致することを実行時検証で示す。

const ITEM_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const N_MIN = 2;
const N_MAX = 6;
const INITIAL_N = 4;

// r の UI 上の下限は 1(タスク仕様: n∈[2,6], r∈[1,n])。r=0 という数学的に有効な退化例は
// lib/math/combinatorics.ts 側で不変条件テスト済みだが、この単元の中核体験(「並べる」vs
// 「選ぶだけ」の比較)は r≥1 でこそ意味を持つため、UI はこの範囲に絞る。数値入力に 0 以下を
// 入力しても例外にはせず 1 へクランプする(境界の安全な扱い、結合テストで検証)。
const R_MIN = 1;
const INITIAL_R = 2;

type Mode = 'permutation' | 'combination';

// 予想ゲートの質問: 「4人から2人を『選んで並べる』のと『選ぶだけ』——多いのはどっち?」
// (タスク仕様の例。既定値 n=4, r=2 と対応させる。r≥2 では常に nPr > nCr、比はちょうど r!。
// r=0,1 では両者が一致するため、この違いは checkpoint の説明文で扱う)。
type Prediction = 'permutationMore' | 'combinationMore' | 'same';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'permutationMore', label: '「並べる」(順列)の方が多くなる' },
	{ value: 'combinationMore', label: '「選ぶだけ」(組合せ)の方が多くなる' },
	{ value: 'same', label: '同じ数になる' },
];

function clampN(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_N;
	return Math.min(N_MAX, Math.max(N_MIN, Math.round(value)));
}

function clampR(value: number, n: number): number {
	if (!Number.isFinite(value)) return Math.min(INITIAL_R, n);
	return Math.min(n, Math.max(R_MIN, Math.round(value)));
}

export function CombinatoricsExperiment() {
	const [n, setN] = useState(INITIAL_N);
	const [r, setR] = useState(INITIAL_R);
	const [mode, setMode] = useState<Mode>('permutation');
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DerivativeFunctionExperiment /
	// QuadraticEquationExperiment と同じ理由: 確定 (blur/Enter) 時にのみ clamp して数値 state
	// へ反映し、入力途中の破壊を防ぐ)。
	const [inputN, setInputN] = useState(String(INITIAL_N));
	const [inputR, setInputR] = useState(String(INITIAL_R));

	useEffect(() => setInputN(String(n)), [n]);
	useEffect(() => setInputR(String(r)), [r]);

	// n の変更: 新しい n へ再クランプすると同時に、現在の r も新しい可動域 [R_MIN, n] へ
	// 再クランプする(DerivativeFunctionExperiment の関数切替時の再クランプと同じ論点:
	// n を先に下げてから r を後追いで直すと、その一瞬 r>n の不正な状態で lib/math を
	// 呼び出しかねないため、1つのハンドラ内で両方を同時に確定する)。
	const handleNChange = (value: number) => {
		const nextN = clampN(value);
		setN(nextN);
		setR((prevR) => clampR(prevR, nextN));
	};

	const commitInputN = () => {
		const parsed = Number(inputN);
		const nextN = Number.isFinite(parsed) && inputN.trim() !== '' ? clampN(parsed) : n;
		setN(nextN);
		setInputN(String(nextN));
		setR((prevR) => clampR(prevR, nextN));
	};

	const handleRChange = (value: number) => setR(clampR(value, n));

	const commitInputR = () => {
		const parsed = Number(inputR);
		const nextR = Number.isFinite(parsed) && inputR.trim() !== '' ? clampR(parsed, n) : r;
		setR(nextR);
		setInputR(String(nextR));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (n のスライダー) へフォーカスを移す(キーボード利用者が操作を継続できるように)。
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
		setN(INITIAL_N);
		setR(INITIAL_R);
		setMode('permutation');
	};

	const items: string[] = ITEM_LABELS.slice(0, n) as unknown as string[];

	// 数学モデルによる計算。lib/math/combinatorics.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。n↓時の r 再クランプは handleNChange 内で
	// setN と setR を同一ハンドラで発行しており、React 18 のバッチングにより r>n の
	// 中間レンダーは発生しない。それでも将来の非バッチ経路(外部 state 連携等)に備え、
	// 計算直前にも防御的に r を [1, n] へクランプする(独立レビュー GrokBuild の H1 懸念を
	// 構造的に封じる belt-and-suspenders。RangeError が render に漏れる経路を残さない)。
	const safeR = Math.min(Math.max(1, r), n);
	const nPr = permutations(n, safeR);
	const nCr = combinations(n, safeR);
	const rFactorial = factorial(safeR);
	const enumeratedPermutations = enumeratePermutations(items, safeR);
	const enumeratedCombinations = enumerateCombinations(items, safeR);

	// 実行時検証: 列挙(実際に数え上げた個数)と公式(積・階乗の閉じた式)は完全に別実装
	// (lib/math/combinatorics.ts のコメント参照)。ここでその2経路を突き合わせ、断言せず
	// 実際に一致しているかを見てからステータス文を出す(レビュー学習: 値列は常に実値を
	// 表示し、検証はステータス文専用にする)。整数演算のみ(浮動小数を経由しない)なので
	// 比較は厳密等価(===)でよい(MATH_CONVENTIONS §1 の丸め分離の趣旨とも整合: ここでは
	// そもそも丸めが発生しない)。
	const permutationCountVerified = enumeratedPermutations.length === nPr;
	const combinationCountVerified = enumeratedCombinations.length === nCr;
	const relationVerified = nPr === nCr * rFactorial;

	// r≥2 のときだけ「並べる方が多い」が真になる(r=0,1 では nPr===nCr)。
	// 既定値 n=4,r=2 ではこの分岐は常に predictionCorrect の判定に一致する。
	const permutationStrictlyMore = nPr > nCr;
	const predictionCorrect = permutationStrictlyMore
		? prediction === 'permutationMore'
		: prediction === 'same';

	const currentTuples = mode === 'permutation' ? enumeratedPermutations : enumeratedCombinations;

	return (
		<section
			className={styles.experiment}
			aria-labelledby="combinatorics-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="combinatorics-exp-title">実験: 並べる(順列)場合の数と選ぶだけ(組合せ)場合の数を数え上げる</h2>

			{/* JS 無効時のフォールバック (DOM 描画は React マウント後に行われるため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、n 人から r
					人を選ぶときの「並べ方(順列)」と「選び方(組合せ)」を実際にすべて列挙し、
					<strong>
						並べ方の総数(nPr)は選び方の総数(nCr)の r! 倍になること(nPr = nCr × r!)
					</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 順列の総数
					nPr = n × (n−1) × … × (n−r+1)、組合せの総数 nCr = nPr ÷ r!。詳しくは下の
					「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					{n}人から{r}人を選ぶとき、<strong>「選んで並べる」(順列)</strong>の場合の数と
					<strong>「選ぶだけ」(組合せ)</strong>の場合の数を比べます。
					<strong>操作する前に予想してください:</strong> どちらが多くなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="combinatorics-prediction"
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

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、n・r を操作して列挙の一覧を観察できます。
				</p>
			) : (
				<>
					{/* Controls: n・r のスライダー + 数値入力 + 矢印キー + リセット + 表示切替
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="n-number">人数(全体の数) n</label>
							<input
								id="n-slider"
								ref={nSliderRef}
								type="range"
								min={N_MIN}
								max={N_MAX}
								step={1}
								value={n}
								aria-label="人数(全体の数) n(スライダー)"
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

						<div className={styles.control}>
							<label htmlFor="r-number">選ぶ人数 r</label>
							<input
								id="r-slider"
								type="range"
								min={R_MIN}
								max={n}
								step={1}
								value={r}
								aria-label="選ぶ人数 r(スライダー)"
								onChange={(e) => handleRChange(Number(e.target.value))}
							/>
							<input
								id="r-number"
								type="text"
								inputMode="numeric"
								aria-describedby="r-range-hint"
								value={inputR}
								onChange={(e) => setInputR(e.target.value)}
								onBlur={commitInputR}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputR();
								}}
							/>
							<p id="r-range-hint" className={styles.rangeHint}>
								r は {R_MIN}〜{n}(現在の n)の範囲で指定できます。n を減らすと、r
								もその範囲に収まるよう自動的に調整されます。
							</p>
						</div>

						<fieldset className={styles.modeFieldset}>
							<legend>列挙リストの表示</legend>
							<label className={styles.predictionOption}>
								<input
									type="radio"
									name="combinatorics-mode"
									value="permutation"
									checked={mode === 'permutation'}
									onChange={() => setMode('permutation')}
								/>
								並べ方(順列)を列挙
							</label>
							<label className={styles.predictionOption}>
								<input
									type="radio"
									name="combinatorics-mode"
									value="combination"
									checked={mode === 'combination'}
									onChange={() => setMode('combination')}
								/>
								選び方(組合せ)を列挙
							</label>
						</fieldset>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Scene: 実際の列挙(一覧)の可視化(Tier 1、DOM ベース)。 */}
					<div className={styles.scene}>
						<CombinatoricsEnumerationScene mode={mode} tuples={currentTuples} />
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う(このモデルは
					    整数演算のみで丸め自体が発生しない)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">全体の数 n</th>
									<td>{n}</td>
								</tr>
								<tr>
									<th scope="row">選ぶ数 r</th>
									<td>{r}</td>
								</tr>
								<tr>
									<th scope="row">順列 nPr(並べ方の総数)</th>
									<td>{nPr}</td>
								</tr>
								<tr>
									<th scope="row">組合せ nCr(選び方の総数)</th>
									<td>{nCr}</td>
								</tr>
								<tr>
									<th scope="row">r!(rの階乗)</th>
									<td>{rFactorial}</td>
								</tr>
								<tr>
									<th scope="row">比 nPr ÷ nCr</th>
									<td>{nPr / nCr}</td>
								</tr>
								<tr>
									<th scope="row">列挙した順列の個数</th>
									<td>{enumeratedPermutations.length}</td>
								</tr>
								<tr>
									<th scope="row">列挙した組合せの個数</th>
									<td>{enumeratedCombinations.length}</td>
								</tr>
							</tbody>
						</table>
						<p className={permutationCountVerified && combinationCountVerified ? styles.statusHeld : styles.statusBroken}>
							{permutationCountVerified && combinationCountVerified
								? `列挙した個数(順列 ${enumeratedPermutations.length} 通り・組合せ ${enumeratedCombinations.length} 通り)は、公式で求めた nPr(${nPr})・nCr(${nCr})とそれぞれ一致しています。`
								: '列挙した個数が公式の値と一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						<p className={relationVerified ? styles.statusHeld : styles.statusBroken}>
							{relationVerified
								? `nPr(${nPr})は nCr(${nCr})× r!(${rFactorial})に一致しています。`
								: 'nPr が nCr × r! と一致しません。数学モデルに問題がある可能性があります。'}
						</p>
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
								: '予想と見比べてみましょう。'}{' '}
							{permutationStrictlyMore
								? `n=${n}, r=${r} では、並べる場合の数(nPr=${nPr})が選ぶだけの場合の数(nCr=${nCr})より多く、その比はちょうど r!(=${rFactorial})です。これは、r人を選んだ後にその並び方が r! 通りあるためです(選んでから並べる、nPr = nCr × r!)。`
								: `n=${n}, r=${r}(r=0 または r=1)では、並べ方が1通りしかないため、順列と組合せの場合の数は一致します(nPr=nCr=${nPr})。`}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 「選ぶだけ」(組合せ)では、選んだ r
							人の中での並び順を区別しません。一方「選んで並べる」(順列)では、同じ r
							人の組でも並び順が違えば別の場合として数えます。1組の選び方(組合せ)につき、
							その並べ方はちょうど r! 通りあるので、順列の総数は組合せの総数の r! 倍になります
							(nPr = nCr × r!)。上の列挙リストの表示を「並べ方(順列)」に切り替えると、同じ
							メンバーの組が並び順違いで複数回登場する様子を実際に確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「順列と組合せの使い分けが曖昧で、順序を数えるべき場面でうっかり
							組合せ(nCr)を使ってしまう」ことがあります。たとえば「学級委員長・副委員長を
							1人ずつ選ぶ」のように役割が異なる(=並び順に意味がある)場合は順列、「委員2人を
							選ぶ」のように役割の区別がない場合は組合せです。上の列挙リストで実際に並べ方と
							選び方を見比べ、「役割・順序に意味があるかどうか」で使い分けを判断する感覚を
							つかみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default CombinatoricsExperiment;
