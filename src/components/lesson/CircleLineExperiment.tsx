import { useEffect, useRef, useState } from 'react';
import {
	pointLineDistance,
	circleLineIntersections,
} from '../../lib/math/circleLine.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { CircleLineScene } from '../scenes/mafs/CircleLineScene.js';
import styles from './CircleLineExperiment.module.css';

// 「円の方程式と点と直線の距離」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。QuadraticEquationExperiment / LawOfSinesCosinesExperiment と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態
// (m,k,prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/circleLine.ts の純粋関数へ
// 委譲し、この層は描画・入力同期・実行時検証(交点を円と直線の両方の式へ代入して≈0)・提示に徹する。
//
// 中核体験: 単位円(中心 (0,0)、半径 r=1、固定)と直線 y=mx+k を動かすと、中心から直線までの
// 距離 d と半径 r の大小関係(d<r/d=r/d>r)が、交点の個数(2個/1個/0個)と完全に対応することを
// 発見する。
//
// 円は単位円 (0,0,1) に固定する(タスク厳守事項: 整数系で d=r をちょうど踏める初期構成)。
const CENTER_P = 0;
const CENTER_Q = 0;
const RADIUS = 1;

// k は主操作(タスク厳守事項の直線の切片)。初期値2は d=2>r=1(交点0個、既知例 y=2→なしと一致)。
// k を小さくして直線を単位円に近づけていくと、k=1 でちょうど接し(d=r、交点1個)、k=0 で
// 中心を通り抜ける(d=0<r、交点2個)——「近づける→増える」という中核体験の物語。
const MIN_K = -3;
const MAX_K = 3;
const STEP_K = 1;
const INITIAL_K = 2;

// m は副次操作(タスク厳守事項「または m も」)。m=0(水平線)の配置でのみ、整数 k でちょうど
// 接する配置(d=r)に厳密に到達できる(circleLine.ts の設計コメント参照: d の計算式に含まれる
// √(m²+1) が m≠0 では一般に無理数になるため)。m を動かしても交点の個数の分類自体は
// (circleLineIntersections が exact zero の判別式で判定するため)常に安全に計算されるが、
// 「ちょうど接する」体験は m=0 に固定して観察することを記事側で案内する。
const MIN_M = -2;
const MAX_M = 2;
const STEP_M = 1;
const INITIAL_M = 0;

type Prediction = 'increases' | 'unchanged' | 'decreases';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{
		value: 'increases',
		label: '直線を円に近づける(切片 k を小さくする)と、交点の個数は0個→1個→2個と増えていく',
	},
	{ value: 'unchanged', label: '直線を動かしても、交点の個数はいつも同じ' },
	{ value: 'decreases', label: '直線を円に近づけると、むしろ交点の個数は減っていく' },
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

function formatPoint([x, y]: readonly [number, number]): string {
	return `(${formatSigned(x)}, ${formatSigned(y)})`;
}

export function CircleLineExperiment() {
	const [m, setM] = useState(INITIAL_M);
	const [k, setK] = useState(INITIAL_K);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (QuadraticEquationExperiment と
	// 同じ理由: 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputM, setInputM] = useState(String(m));
	const [inputK, setInputK] = useState(String(k));

	useEffect(() => setInputM(String(round2(m))), [m]);
	useEffect(() => setInputK(String(round2(k))), [k]);

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

	const commitM = makeCommit(inputM, setM, setInputM, m, MIN_M, MAX_M, STEP_M);
	const commitK = makeCommit(inputK, setK, setInputK, k, MIN_K, MAX_K, STEP_K);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (k のスライダー)へフォーカスを移す(先行単元と同じ配慮)。
	const sliderKRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) sliderKRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setM(INITIAL_M);
		setK(INITIAL_K);
	};

	// 数学モデル(lib/math/circleLine.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。重複実装しない(タスク厳守事項): pointLineDistance・
	// circleLineIntersections をそのまま再利用する。
	const d = pointLineDistance(CENTER_P, CENTER_Q, m, k);
	const intersections = circleLineIntersections(CENTER_P, CENTER_Q, RADIUS, m, k);

	// 実行時検証: 返った交点を円の方程式・直線の方程式の両方へ代入すると0に戻ることを確かめる
	// (この単元の中核となる非自己確認的な検証、C-7、タスク厳守事項)。
	const scale = Math.max(1, Math.abs(m), Math.abs(k), RADIUS);
	const intersectionsVerified = intersections.every(([x, y]) => {
		const circleResidual = (x - CENTER_P) ** 2 + (y - CENTER_Q) ** 2 - RADIUS * RADIUS;
		const lineResidual = y - (m * x + k);
		return approximatelyZero(circleResidual, scale) && approximatelyZero(lineResidual, scale);
	});

	// 分類は交点の個数(circleLineIntersections、exact zero の判別式で分類済み)から導く。
	// d と r の大小を独立に比較して表示するのではなく、個数側の分類ラベルとして提示することで、
	// 読者は「d の値」「r の値」「交点の個数」という3つの実値を見比べて自ら対応を発見する
	// (観察表に検証済みの値をそのまま並べ、対応関係の断定はここではしない)。
	const intersectionLabel =
		intersections.length === 2
			? '2個(異なる2点で交わる)'
			: intersections.length === 1
				? '1個(ちょうど接する)'
				: '0個(交わらない)';
	const pointsLabel = intersections.length === 0 ? 'なし' : intersections.map(formatPoint).join(', ');

	const predictionCorrect = prediction === 'increases';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="circleline-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="circleline-exp-title">実験: 直線を動かして円との交点の個数を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、単位円
					(中心(0,0)、半径1)と直線 y=mx+k を動かしながら、円と直線の交点の個数が変わる様子を
					観察できます。JavaScript が無効でも要点は次の通りです: 中心から直線までの距離 d と
					半径 r の大小関係が、交点の個数(2個・1個・0個)と完全に対応します(d&lt;r なら2個、
					d=r なら1個、d&gt;r なら0個)。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、単位円(中心 (0,0)、半径 r=1)と直線 y=mx+k を表しています。
					<strong>操作する前に予想してください:</strong>{' '}
					直線を円に近づけていく(切片 k を小さくしていく)と、円と直線の交点の個数は
					どう変わるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="circleline-prediction"
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

			{/* Scene: Tier 1 図解(円+直線+垂線+交点マーカー) */}
			<div className={styles.scene}>
				<CircleLineScene
					p={CENTER_P}
					q={CENTER_Q}
					r={RADIUS}
					m={m}
					k={k}
					minK={MIN_K}
					maxK={MAX_K}
					interactive={submitted}
					onKChange={(value) => setK(clamp(Math.round(value), MIN_K, MAX_K, k))}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、直線を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: m,k それぞれのスライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="circleline-k-number">直線の切片 k</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="circleline-k-slider"
								ref={sliderKRef}
								type="range"
								min={MIN_K}
								max={MAX_K}
								step={STEP_K}
								value={k}
								aria-label="直線の切片 k(スライダー)"
								onChange={(e) => setK(Number(e.target.value))}
							/>
							<input
								id="circleline-k-number"
								type="text"
								inputMode="decimal"
								value={inputK}
								onChange={(e) => setInputK(e.target.value)}
								onBlur={commitK}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitK();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="circleline-m-number">直線の傾き m</label>
							<input
								id="circleline-m-slider"
								type="range"
								min={MIN_M}
								max={MAX_M}
								step={STEP_M}
								value={m}
								aria-label="直線の傾き m(スライダー)"
								onChange={(e) => setM(Number(e.target.value))}
							/>
							<input
								id="circleline-m-number"
								type="text"
								inputMode="decimal"
								value={inputM}
								onChange={(e) => setInputM(e.target.value)}
								onBlur={commitM}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitM();
								}}
							/>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							k は {MIN_K}〜{MAX_K}、m は {MIN_M}〜{MAX_M} の範囲で指定できます。m=0(水平線)の
							ときに限り、整数 k でちょうど接する配置(d=r)に厳密に到達できます。
						</p>
					</div>

					{/* Observation: 距離・半径・交点の個数・交点座標のライブ表示。丸め前の内部値で判定し、
					    表示のみ丸める(MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは
					    下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">中心から直線までの距離 d</th>
									<td>{formatSigned(d)}</td>
								</tr>
								<tr>
									<th scope="row">半径 r</th>
									<td>{formatSigned(RADIUS)}</td>
								</tr>
								<tr>
									<th scope="row">交点の個数</th>
									<td>{intersectionLabel}</td>
								</tr>
								<tr>
									<th scope="row">交点の座標</th>
									<td>{pointsLabel}</td>
								</tr>
							</tbody>
						</table>
						{intersections.length > 0 ? (
							<p className={intersectionsVerified ? styles.statusHeld : styles.statusBroken}>
								{intersectionsVerified
									? `交点(${pointsLabel})を円の方程式・直線の方程式の両方へ代入すると、確かに0に戻ることを確認しました。`
									: '交点を代入しても0に戻りません。数学モデルに問題がある可能性があります。'}
							</p>
						) : (
							<p className={styles.statusNeutral}>
								円と直線は交わらないため、代入して確かめる交点がありません——直線は円から
								離れた位置にあります。
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
								? 'その通りです。直線を円に近づける(k を小さくする)と、交点の個数は0個→1個→2個と増えていきます。'
								: '実は、直線を円に近づける(k を小さくする)と、交点の個数は0個→1個→2個と増えていきます。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 中心から直線までの距離 d と半径 r を比べると、d が r より
							大きいうちは直線は円の外側にあり、交わりません(交点0個)。直線が近づいて
							d がちょうど r に等しくなる瞬間、直線は円にちょうど接します(交点1個)。
							さらに近づいて d が r より小さくなると、直線は円の内部を通り抜け、2点で
							交わります(交点2個)。上の観察表で d と r の大小関係と交点の個数が常に
							対応することを確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「接する(交点1個)は交点が無い状態だ」と考えたくなるかも
							しれません。しかし<strong>接するときも交点はちゃんと1個存在します</strong>
							——ただ2点が1点に重なっているだけです。円と交わらない(交点0個)のは、
							d が r より真に大きいときだけです。d と r を見比べるときは、y切片(k)
							同士を比べるのではなく、必ず中心からの距離 d と半径 r そのものを比べる
							必要があります(k は直線の位置を表す値であり、距離 d とは別の量です)。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default CircleLineExperiment;
