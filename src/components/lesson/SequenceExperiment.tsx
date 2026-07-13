import { useEffect, useRef, useState } from 'react';
import { arithmeticTerm, geometricTerm, arithmeticSum } from '../../lib/math/sequences.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { SequenceScene } from '../scenes/mafs/SequenceScene.js';
import styles from './SequenceExperiment.module.css';

// 「数列 — 等差数列と等比数列」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。LinearFunctionExperiment / DefiniteIntegralExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(sequenceType, a1, d, r,
// prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/sequences.ts の純粋関数へ
// 委譲し、この層は描画・入力同期・実行時検証(公式とループ加算の一致)・提示に徹する。
//
// この単元の中核体験: 等差数列の点 (n, aₙ) は一直線に(前単元 algebra/linear-function の
// 一次関数「傾き=公差」と同じ関係)、等比数列の点は指数的に曲がって並ぶ。

type SequenceType = 'arithmetic' | 'geometric';
type Prediction = 'straight' | 'curve' | 'random';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'straight', label: 'まっすぐ一直線に並ぶ' },
	{ value: 'curve', label: 'だんだん急になる曲線に並ぶ' },
	{ value: 'random', label: 'ばらばら' },
];

const DEFAULT_TYPE: SequenceType = 'arithmetic';

const MIN_A1 = -10;
const MAX_A1 = 10;
const INITIAL_A1 = 1;
const STEP_A1 = 1;

const MIN_D = -5;
const MAX_D = 5;
const INITIAL_D = 2;
const STEP_D = 1;

const MIN_R = -3;
const MAX_R = 3;
const INITIAL_R = 2;
const STEP_R = 0.5;

// 観察テーブルに実値を並べる項数(第1〜5項)と、図に描く点の個数(n=1〜10程度)、
// 和 S₁₀ に使う項数(等差のみ、ガウスの逆順和の公式とループ加算を突合する)。
const TERMS_TO_SHOW = 5;
const PLOT_TERMS = 10;
const SUM_N = 10;

function clamp(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function SequenceExperiment() {
	const [type, setType] = useState<SequenceType>(DEFAULT_TYPE);
	const [a1, setA1] = useState(INITIAL_A1);
	const [d, setD] = useState(INITIAL_D);
	const [r, setR] = useState(INITIAL_R);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DefiniteIntegralExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA1, setInputA1] = useState(String(INITIAL_A1));
	const [inputD, setInputD] = useState(String(INITIAL_D));
	const [inputR, setInputR] = useState(String(INITIAL_R));

	useEffect(() => {
		setInputA1(String(a1));
	}, [a1]);
	useEffect(() => {
		setInputD(String(d));
	}, [d]);
	useEffect(() => {
		setInputR(String(r));
	}, [r]);

	const handleA1Change = (value: number) => setA1(clamp(value, MIN_A1, MAX_A1, INITIAL_A1));
	const handleDChange = (value: number) => setD(clamp(value, MIN_D, MAX_D, INITIAL_D));
	const handleRChange = (value: number) => setR(clamp(value, MIN_R, MAX_R, INITIAL_R));

	const commitInputA1 = () => {
		const parsed = Number(inputA1);
		const next = Number.isFinite(parsed) && inputA1.trim() !== '' ? clamp(parsed, MIN_A1, MAX_A1, a1) : a1;
		setA1(next);
		setInputA1(String(next));
	};
	const commitInputD = () => {
		const parsed = Number(inputD);
		const next = Number.isFinite(parsed) && inputD.trim() !== '' ? clamp(parsed, MIN_D, MAX_D, d) : d;
		setD(next);
		setInputD(String(next));
	};
	const commitInputR = () => {
		const parsed = Number(inputR);
		const next = Number.isFinite(parsed) && inputR.trim() !== '' ? clamp(parsed, MIN_R, MAX_R, r) : r;
		setR(next);
		setInputR(String(next));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (初項 a1 のスライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const a1SliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) a1SliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setType(DEFAULT_TYPE);
		setA1(INITIAL_A1);
		setD(INITIAL_D);
		setR(INITIAL_R);
	};

	// 数学モデルによる計算。lib/math/sequences.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。a1/d/r の可動域全域・タイプ切替直後のいずれでも
	// 例外を起こさない(等比の r=0・負・a1=0 はすべて有効な退化例として値を返す)。
	const terms: number[] = [];
	for (let n = 1; n <= TERMS_TO_SHOW; n++) {
		terms.push(type === 'arithmetic' ? arithmeticTerm(a1, d, n) : geometricTerm(a1, r, n));
	}

	// 等差なら階差(aₙ₊₁−aₙ、公差の定義に立ち返る値)、等比なら比(aₙ₊₁÷aₙ)。
	// 差・比の列は「常に実値を表示する」観察対象なので丸め前の値をそのまま使う
	// (レビュー学習: 検証フラグと連動して固定表示にすると観察が成立しない、
	// MATH_CONVENTIONS §8 の「≈0 は真に微小な値のときのみ」にも反する)。
	// 等比で直前の項が 0(a1=0 または r=0)の比は数学的に定義されないため、例外を投げず
	// 「定義されません」という安全な表示に切り替える(退化ケースを塞がない)。
	//
	// 判定は epsilon 幅ではなく exact zero で行う(独立レビュー GrokBuild M1): 数学的に
	// a1≠0 かつ r≠0 なら項 a1·r^(n−1) は決して 0 にならず、浮動小数点でも指数部が尽きる
	// (~1e-308) まで 0 に落ちない。epsilon 幅で判定すると、自由入力の微小値(例 a1=1,
	// r=0.001 の第4項 1e-9)が誤って「定義されません」になり、正しく定義される比 r を
	// 表示し損ねる。M3 の固有値分類が epsilon 幅を撤廃し exact zero にしたのと同じ判断。
	type DiffOrRatio = { readonly definedValue: number | null };
	const diffsOrRatios: DiffOrRatio[] = [];
	for (let i = 0; i < TERMS_TO_SHOW - 1; i++) {
		if (type === 'arithmetic') {
			diffsOrRatios.push({ definedValue: terms[i + 1] - terms[i] });
		} else {
			const denominatorZero = terms[i] === 0;
			diffsOrRatios.push({ definedValue: denominatorZero ? null : terms[i + 1] / terms[i] });
		}
	}

	// 和 S₁₀ の実行時検証(等差のみ、この単元の数学モデルに arithmeticSum を持つのは等差だけ):
	// arithmeticSum(公式、ガウスの逆順和)と、arithmeticTerm を10回足すループ加算という
	// 独立2経路を突合する。丸めない内部値で判定し、表示のみ丸める(MATH_CONVENTIONS §1)。
	let sumFormula = 0;
	let sumLoop = 0;
	let sumVerified = false;
	if (type === 'arithmetic') {
		sumFormula = arithmeticSum(a1, d, SUM_N);
		for (let n = 1; n <= SUM_N; n++) {
			sumLoop += arithmeticTerm(a1, d, n);
		}
		sumVerified = approximatelyZero(sumFormula - sumLoop, Math.max(1, Math.abs(sumFormula), Math.abs(sumLoop)));
	}

	// Scene の viewBox を現在の a1/d/r から動的に決める(等比は指数的に値が大きくなりうるため、
	// 固定範囲ではなく実際の点の値から都度計算する。0 も必ず含めて軸が視野に入るようにする)。
	const plotValues: number[] = [];
	for (let n = 1; n <= PLOT_TERMS; n++) {
		plotValues.push(type === 'arithmetic' ? arithmeticTerm(a1, d, n) : geometricTerm(a1, r, n));
	}
	const rawMin = Math.min(0, ...plotValues);
	const rawMax = Math.max(0, ...plotValues);
	const padding = Math.max(1, (rawMax - rawMin) * 0.15);
	const yMin = rawMin - padding;
	const yMax = rawMax + padding;

	const predictionCorrect = prediction === 'straight';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="sequence-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="sequence-exp-title">実験: 初項と公差(公比)を動かして点の並び方を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、点列 (n,
					aₙ) を初項 a₁・公差 d(または公比 r)を変えながら並べ、
					<strong>
						等差数列の点はまっすぐ一直線に、等比数列の点はだんだん急になる曲線に並ぶこと
					</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 等差数列の第 n 項は
					aₙ = a₁ + (n−1)d、等比数列の第 n 項は aₙ = a₁・r^(n−1) です。詳しくは下の「形式的な定義」を
					参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、初項 a₁・公差 d で決まる<strong>等差数列</strong>の点列 (n, aₙ) を n=1〜10
					まで並べたものです。<strong>操作する前に予想してください:</strong>{' '}
					この点を n の順に並べると、どんな形に並ぶでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="sequence-prediction"
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

			{/* Scene: Tier 1 図解 (点列 (n, aₙ)、等差モードでは対応する直線を薄く重ねる)。 */}
			<div className={styles.scene}>
				<SequenceScene type={type} a1={a1} d={d} r={r} termsCount={PLOT_TERMS} yMin={yMin} yMax={yMax} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、初項 a₁ と公差 d(または公比 r)
					を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 数列タイプ切替 + a1・d(またはr)のスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<fieldset className={styles.functionFieldset}>
						<legend>数列の種類</legend>
						<label className={styles.functionOption}>
							<input
								type="radio"
								name="sequence-type-select"
								value="arithmetic"
								checked={type === 'arithmetic'}
								onChange={() => setType('arithmetic')}
							/>
							等差数列
						</label>
						<label className={styles.functionOption}>
							<input
								type="radio"
								name="sequence-type-select"
								value="geometric"
								checked={type === 'geometric'}
								onChange={() => setType('geometric')}
							/>
							等比数列
						</label>
					</fieldset>

					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="a1-number">初項 a₁</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="a1-slider"
								ref={a1SliderRef}
								type="range"
								min={MIN_A1}
								max={MAX_A1}
								step={STEP_A1}
								value={a1}
								aria-label="初項 a1(スライダー)"
								onChange={(e) => handleA1Change(Number(e.target.value))}
							/>
							<input
								id="a1-number"
								type="text"
								inputMode="decimal"
								value={inputA1}
								onChange={(e) => setInputA1(e.target.value)}
								onBlur={commitInputA1}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputA1();
								}}
							/>
						</div>

						{type === 'arithmetic' ? (
							<div className={styles.control}>
								<label htmlFor="d-number">公差 d</label>
								<input
									id="d-slider"
									type="range"
									min={MIN_D}
									max={MAX_D}
									step={STEP_D}
									value={d}
									aria-label="公差 d(スライダー)"
									onChange={(e) => handleDChange(Number(e.target.value))}
								/>
								<input
									id="d-number"
									type="text"
									inputMode="decimal"
									value={inputD}
									onChange={(e) => setInputD(e.target.value)}
									onBlur={commitInputD}
									onKeyDown={(e) => {
										if (e.key === 'Enter') commitInputD();
									}}
								/>
							</div>
						) : (
							<div className={styles.control}>
								<label htmlFor="r-number">公比 r</label>
								<input
									id="r-slider"
									type="range"
									min={MIN_R}
									max={MAX_R}
									step={STEP_R}
									value={r}
									aria-label="公比 r(スライダー)"
									onChange={(e) => handleRChange(Number(e.target.value))}
								/>
								<input
									id="r-number"
									type="text"
									inputMode="decimal"
									value={inputR}
									onChange={(e) => setInputR(e.target.value)}
									onBlur={commitInputR}
									onKeyDown={(e) => {
										if (e.key === 'Enter') commitInputR();
									}}
								/>
							</div>
						)}

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							a₁ は {MIN_A1}〜{MAX_A1}
							{type === 'arithmetic'
								? `、d は ${MIN_D}〜${MAX_D}`
								: `、r は ${MIN_R}〜${MAX_R}`}{' '}
							の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<thead>
								<tr>
									<th scope="col">n</th>
									{terms.map((_, i) => (
										<th scope="col" key={i}>
											{i + 1}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								<tr>
									<th scope="row">aₙ</th>
									{terms.map((value, i) => (
										<td key={i}>{round2(value)}</td>
									))}
								</tr>
								<tr>
									<th scope="row">{type === 'arithmetic' ? '階差 aₙ₊₁−aₙ' : '比 aₙ₊₁÷aₙ'}</th>
									{diffsOrRatios.map((entry, i) => (
										<td key={i}>{entry.definedValue === null ? '定義されません' : round2(entry.definedValue)}</td>
									))}
									<td>—</td>
								</tr>
							</tbody>
						</table>

						{type === 'arithmetic' && (
							<>
								<table className={styles.valueTable}>
									<tbody>
										<tr>
											<th scope="row">S₁₀(和の公式)</th>
											<td>{round2(sumFormula)}</td>
										</tr>
										<tr>
											<th scope="row">S₁₀(ループ加算)</th>
											<td>{round2(sumLoop)}</td>
										</tr>
									</tbody>
								</table>
								<p className={sumVerified ? styles.statusHeld : styles.statusBroken}>
									{sumVerified
										? `和の公式(${round2(sumFormula)})とループ加算(${round2(sumLoop)})の結果が一致しています。`
										: '和の公式とループ加算の結果が一致しません。数学モデルに問題がある可能性があります。'}
								</p>
							</>
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
								? 'その通りです。等差数列の点 (n, aₙ) を並べると、まっすぐ一直線に並びます。'
								: '実は、等差数列の点 (n, aₙ) を並べると、まっすぐ一直線に並びます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 等差数列は「n が1増えるごとに、値が一定の量 d だけ増える」数列です。
							これは一次関数 y = a₁ + (x−1)d そのものであり、傾き(1あたりの増加量)が常に d
							で一定だからこそ、点が一直線に並びます。数列タイプを「等比数列」に切り替えると、
							今度は「n が1増えるごとに、値が一定の"倍率" r 倍になる」ため、増え方(または減り方)が
							だんだん急になり、点は曲線状に並びます。公比 r を負の値にすると、値の符号が交互に
							入れ替わりながら並ぶことも確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「等比数列も、等差数列と同じように一定の"幅"で増える(あるいは減る)」
							と考えたくなるかもしれません。しかし等比数列が一定に保っているのは
							<strong>差ではなく比</strong>です。公比 r を色々な値に変えて、上の「比
							aₙ₊₁÷aₙ」の列が常に r と一致すること、そして点が(等差のときのような一直線ではなく)
							曲線状に並ぶことを確かめてみましょう。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default SequenceExperiment;
